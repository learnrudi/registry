import fs from 'fs';
import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { runCommand } from '../lib/process.js';

const GRADE_PRESETS = {
  natural: {
    exposure: 0.02,
    contrast: 1.04,
    saturation: 1.03,
    vibrance: 0.06,
    sharpen: 0.12
  },
  'talking-head': {
    exposure: 0.04,
    contrast: 1.06,
    saturation: 1.05,
    vibrance: 0.12,
    sharpen: 0.18
  },
  punchy: {
    exposure: 0.06,
    contrast: 1.1,
    saturation: 1.08,
    vibrance: 0.18,
    sharpen: 0.24
  }
};

const NUMBER_FIELDS = {
  exposure: { min: -3, max: 3 },
  black: { min: -1, max: 1 },
  brightness: { min: -1, max: 1 },
  contrast: { min: 0, max: 3, exclusiveMin: true },
  saturation: { min: 0, max: 3 },
  gamma: { min: 0, max: 3, exclusiveMin: true },
  vibrance: { min: -2, max: 2 },
  sharpen: { min: -2, max: 5 }
};

function formatNumber(value) {
  const fixed = Number(value).toFixed(3);
  return fixed.replace(/\.?0+$/u, '');
}

function normalizeRunFileName(value, fallback, label) {
  const name = value || fallback;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(`${label} is required`);
  }
  if (path.basename(name) !== name) {
    throw new Error(`${label} must be a file name, not a path`);
  }
  if (!name.toLowerCase().endsWith('.mp4')) {
    throw new Error(`${label} must end with .mp4`);
  }
  return name;
}

function normalizeNumber(value, field) {
  const bounds = NUMBER_FIELDS[field];
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a finite number`);
  }

  const belowMin = bounds.exclusiveMin ? parsed <= bounds.min : parsed < bounds.min;
  if (belowMin || parsed > bounds.max) {
    const minText = bounds.exclusiveMin ? `greater than ${bounds.min}` : `at least ${bounds.min}`;
    throw new Error(`${field} must be between ${minText} and ${bounds.max}`);
  }

  return Number(formatNumber(parsed));
}

function resolveLutPath(value, runDir, options) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('lut must be a file path string');
  }

  const resolved = path.isAbsolute(value) ? value : path.join(runDir, value);
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.cube' && ext !== '.3dl') {
    throw new Error('lut must point to a .cube or .3dl file');
  }
  if (options.skipPathExists !== true && !fs.existsSync(resolved)) {
    throw new Error(`LUT file not found: ${resolved}`);
  }
  return resolved;
}

function escapeFilterPath(filePath) {
  return filePath
    .replace(/\\/gu, '\\\\')
    .replace(/:/gu, '\\:')
    .replace(/,/gu, '\\,')
    .replace(/'/gu, "\\'");
}

export function listGradePresets() {
  return Object.fromEntries(
    Object.entries(GRADE_PRESETS).map(([name, preset]) => [name, { ...preset }])
  );
}

export function normalizeGradeConfig(input = {}, options = {}) {
  const runDir = options.runDir || process.cwd();
  const raw = input || {};

  if (raw.enabled === false) {
    return { enabled: false };
  }

  const presetName = raw.preset || options.preset || 'talking-head';
  const preset = GRADE_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown grade preset: ${presetName}`);
  }

  const merged = {
    ...preset,
    ...raw,
    enabled: true,
    preset: presetName
  };

  for (const field of Object.keys(NUMBER_FIELDS)) {
    if (merged[field] !== undefined && merged[field] !== null) {
      merged[field] = normalizeNumber(merged[field], field);
    }
  }

  const lutPath = resolveLutPath(merged.lut, runDir, options);
  if (lutPath) {
    merged.lut = lutPath;
  } else {
    delete merged.lut;
  }

  return merged;
}

export function buildGradeFilter(config) {
  if (!config || config.enabled === false) {
    return null;
  }

  const filters = [];

  if (config.exposure || config.black) {
    const parts = [`exposure=${formatNumber(config.exposure || 0)}`];
    if (config.black) {
      parts.push(`black=${formatNumber(config.black)}`);
    }
    filters.push(`exposure=${parts.join(':')}`);
  }

  const eqParts = [];
  for (const field of ['brightness', 'contrast', 'saturation', 'gamma']) {
    if (config[field] !== undefined && config[field] !== null) {
      eqParts.push(`${field}=${formatNumber(config[field])}`);
    }
  }
  if (eqParts.length > 0) {
    filters.push(`eq=${eqParts.join(':')}`);
  }

  if (config.vibrance) {
    filters.push(`vibrance=intensity=${formatNumber(config.vibrance)}`);
  }

  if (config.lut) {
    filters.push(`lut3d=file='${escapeFilterPath(config.lut)}':interp=tetrahedral`);
  }

  if (config.sharpen) {
    filters.push(`unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=${formatNumber(config.sharpen)}`);
  }

  return filters.length > 0 ? filters.join(',') : null;
}

async function renderGradedMedia(inputPath, outputPath, filter) {
  if (!(await pathExists(inputPath))) {
    throw new Error(`Input media not found: ${inputPath}`);
  }
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new Error('Grade output must be different from input media');
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await runCommand('ffmpeg', [
    '-hide_banner',
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath
  ]);
}

export async function gradeSourceRun(runDir, options = {}) {
  const { project } = await loadProject(runDir);
  const compositionPath = artifactPath(runDir, project, 'composition');
  const composition = await readJson(compositionPath);
  const preset = options.preset || composition.timeline?.grade?.preset || 'talking-head';
  const rawGrade = {
    ...(composition.timeline?.grade || {}),
    ...(options.grade || {}),
    preset
  };
  const grade = normalizeGradeConfig(rawGrade, { runDir });
  const filter = buildGradeFilter(grade);

  if (!filter) {
    throw new Error('Grade is disabled or contains no visual adjustments');
  }

  const defaultOutputName = `working-${grade.preset}-grade.mp4`;
  const outputName = normalizeRunFileName(options.outputName, defaultOutputName, 'Grade output name');
  const inputPath = artifactPath(runDir, project, 'working');
  const outputPath = path.join(runDir, outputName);

  await renderGradedMedia(inputPath, outputPath, filter);

  const nextComposition = {
    ...composition,
    source: {
      ...(composition.source || {}),
      path: outputName
    },
    timeline: {
      ...(composition.timeline || {}),
      grade: {
        ...grade,
        source: outputName,
        filter
      }
    }
  };

  await writeJson(compositionPath, nextComposition);

  return {
    outputPath,
    outputName,
    compositionPath,
    preset: grade.preset,
    grade,
    filter
  };
}

export async function gradeRenderRun(runDir, inputNameArg, outputNameArg, options = {}) {
  const { project } = await loadProject(runDir);
  const rendersDir = artifactPath(runDir, project, 'renders');
  const inputName = normalizeRunFileName(inputNameArg, null, 'Input render name');
  const outputName = normalizeRunFileName(
    outputNameArg,
    inputName.replace(/\.mp4$/iu, '-graded.mp4'),
    'Grade output name'
  );
  const grade = normalizeGradeConfig(options.grade || { preset: options.preset || 'talking-head' }, { runDir });
  const filter = buildGradeFilter(grade);

  if (!filter) {
    throw new Error('Grade is disabled or contains no visual adjustments');
  }

  const inputPath = path.join(rendersDir, inputName);
  const outputPath = path.join(rendersDir, outputName);
  await renderGradedMedia(inputPath, outputPath, filter);

  return {
    outputPath,
    outputName,
    inputName,
    preset: grade.preset,
    grade,
    filter
  };
}
