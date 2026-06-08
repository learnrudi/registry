import fs from 'fs/promises';
import path from 'path';
import {
  cloneDefaultArtifacts,
  cloneDefaultSettings
} from '../config/defaults.js';
import {
  makeSlug,
  loadProject,
  pathExists,
  runsRoot,
  writeJson,
  writeProject
} from '../lib/files.js';
import { assertCommandsAvailable } from '../lib/process.js';
import { RunState } from '../lib/states.js';
import { probeRun } from './probe.js';
import { aboutRun } from './about.js';

const INIT_DEPENDENCIES = ['ffprobe', 'ffmpeg'];
const INIT_MODES = new Set(['create', 'refresh', 'force']);

class InitFailedError extends Error {
  constructor(step, cause) {
    super(`Init failed during ${step}: ${cause.message}`);
    this.name = 'InitFailedError';
    this.step = step;
    this.cause = cause;
  }
}

function normalizeInitMode(options) {
  const mode = options.mode || 'create';
  if (!INIT_MODES.has(mode)) {
    throw new Error(`Unknown init mode: ${mode}`);
  }
  return mode;
}

function resolveSlug(sourcePath, slugArg) {
  const slug = makeSlug(slugArg || sourcePath);
  if (!slug) {
    throw new Error('Unable to derive run slug');
  }
  return slug;
}

function rebasePath(filePath, fromDir, toDir) {
  if (!filePath) {
    return filePath;
  }

  const relative = path.relative(fromDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return filePath;
  }

  return path.join(toDir, relative);
}

function rebaseAboutResult(result, fromDir, toDir) {
  if (!result) {
    return result;
  }

  return {
    ...result,
    aboutPath: rebasePath(result.aboutPath, fromDir, toDir),
    metaPath: rebasePath(result.metaPath, fromDir, toDir)
  };
}

async function resolveInitTarget(sourceArg, slugArg, mode) {
  if (!sourceArg) {
    throw new Error('Usage: init <source-video> [run-slug] [--refresh|--force]');
  }

  const sourcePath = path.resolve(sourceArg);
  const sourceExists = await pathExists(sourcePath);

  if (!sourceExists && mode === 'refresh' && !slugArg) {
    const slug = resolveSlug(null, sourceArg);
    return {
      sourcePath: null,
      slug,
      runDir: path.join(runsRoot, slug)
    };
  }

  if (!sourceExists) {
    throw new Error(`Source video not found: ${sourcePath}`);
  }

  const slug = resolveSlug(sourcePath, slugArg);
  return {
    sourcePath,
    slug,
    runDir: path.join(runsRoot, slug)
  };
}

function buildProject({ sourcePath, slug, sourceLink, createdAt }) {
  return {
    schemaVersion: 1,
    slug,
    sourcePath,
    sourceLink,
    createdAt,
    state: RunState.IMPORTED,
    stateUpdatedAt: createdAt,
    artifacts: cloneDefaultArtifacts(),
    settings: cloneDefaultSettings()
  };
}

function buildComposition(project) {
  return {
    schemaVersion: 1,
    projectSlug: project.slug,
    source: {
      path: project.artifacts.working,
      fps: project.settings.fps
    },
    timeline: {
      keepRanges: [],
      audioCrossfadeSeconds: project.settings.render.audioCrossfadeSeconds,
      captions: {
        enabled: false
      },
      watermark: {
        enabled: false,
        text: 'rough cut'
      },
      textOverlays: [],
      lowerThirds: [],
      punchIns: []
    }
  };
}

async function scaffoldRunDir(runDir, sourcePath, slug) {
  await fs.mkdir(path.join(runDir, 'renders'), { recursive: true });
  await fs.mkdir(path.join(runDir, 'qa', 'frames'), { recursive: true });

  const sourceLink = `source${path.extname(sourcePath).toLowerCase() || '.mov'}`;
  await fs.copyFile(sourcePath, path.join(runDir, sourceLink));

  const createdAt = new Date().toISOString();
  const project = buildProject({
    sourcePath,
    slug,
    sourceLink,
    createdAt
  });
  const composition = buildComposition(project);

  await writeProject(path.join(runDir, 'project.json'), project);
  await writeJson(path.join(runDir, project.artifacts.composition), composition);

  return { project, composition };
}

async function replaceRunDir(stagingDir, runDir, mode) {
  if (mode !== 'force') {
    await fs.rename(stagingDir, runDir);
    return;
  }

  const backupDir = `${runDir}.init-backup-${process.pid}-${Date.now()}`;
  let backedUp = false;

  try {
    if (await pathExists(runDir)) {
      await fs.rename(runDir, backupDir);
      backedUp = true;
    }
    await fs.rename(stagingDir, runDir);
  } catch (error) {
    if (backedUp && !(await pathExists(runDir))) {
      try {
        await fs.rename(backupDir, runDir);
      } catch (restoreError) {
        error.message = `${error.message}; failed to restore previous run: ${restoreError.message}`;
      }
    }
    throw error;
  }

  if (backedUp) {
    await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function refreshExistingRun(runDir) {
  if (!(await pathExists(runDir))) {
    throw new Error(`Run not found for refresh: ${runDir}`);
  }

  await probeRun(runDir);
  const aboutResult = await aboutRun(runDir);
  return aboutResult;
}

export async function initRun(sourceArg, slugArg, options = {}) {
  const mode = normalizeInitMode(options);
  const target = await resolveInitTarget(sourceArg, slugArg, mode);

  await assertCommandsAvailable(INIT_DEPENDENCIES);

  if (mode === 'refresh') {
    const aboutResult = await refreshExistingRun(target.runDir);
    const { project } = await loadProject(target.runDir);
    return {
      runDir: target.runDir,
      project,
      about: aboutResult,
      state: aboutResult.stage
    };
  }

  if (await pathExists(target.runDir) && mode !== 'force') {
    throw new Error(`Run already exists: ${target.runDir}`);
  }

  await fs.mkdir(runsRoot, { recursive: true });
  const stagingDir = await fs.mkdtemp(path.join(runsRoot, `.${target.slug}.init-`));
  let currentStep = 'scaffold';

  try {
    const { project } = await scaffoldRunDir(stagingDir, target.sourcePath, target.slug);
    currentStep = 'probe';
    await probeRun(stagingDir);
    currentStep = 'about';
    const aboutResult = await aboutRun(stagingDir);
    currentStep = 'commit';
    await replaceRunDir(stagingDir, target.runDir, mode);

    return {
      runDir: target.runDir,
      project,
      about: rebaseAboutResult(aboutResult, stagingDir, target.runDir),
      state: RunState.IMPORTED
    };
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true });
    throw new InitFailedError(currentStep, error);
  }
}
