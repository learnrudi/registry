import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProject } from './project-schema.js';

export const videoAgentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

function envPath(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return null;
  }
  return path.resolve(value);
}

function resolveRudiHome() {
  const configuredHome = envPath('RUDI_HOME');
  if (configuredHome) {
    return configuredHome;
  }

  const homeDir = os.homedir();
  if (!homeDir) {
    throw new Error('Unable to resolve RUDI home: HOME is not set');
  }

  return path.join(homeDir, '.rudi');
}

export const stateRoot =
  envPath('RUDI_VIDEO_EDITOR_STATE_DIR') ||
  path.join(resolveRudiHome(), 'state', 'stacks', 'video-editor');

export const runsRoot = path.join(stateRoot, 'runs');

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeProject(filePath, value) {
  const project = await validateProject(value, filePath);
  await writeJson(filePath, project);
  return project;
}

export function makeSlug(input) {
  const base = path.basename(input, path.extname(input));
  return base
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `run-${Date.now()}`;
}

export async function resolveRunDir(runArg) {
  if (!runArg) {
    throw new Error('Run slug or path is required');
  }

  const directPath = path.resolve(runArg);
  if (await pathExists(directPath)) {
    return directPath;
  }

  const slugPath = path.join(runsRoot, runArg);
  if (await pathExists(slugPath)) {
    return slugPath;
  }

  throw new Error(`Run not found: ${runArg}`);
}

export async function loadProject(runDir) {
  const projectPath = path.join(runDir, 'project.json');
  const project = await validateProject(await readJson(projectPath), projectPath);
  return { project, projectPath };
}

export function artifactPath(runDir, project, artifactName) {
  const artifact = project.artifacts[artifactName];
  if (!artifact) {
    throw new Error(`Project is missing artifact path: ${artifactName}`);
  }
  return path.join(runDir, artifact);
}
