import fs from 'fs/promises';
import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists
} from '../lib/files.js';

// Promote a rendered video out of the run's working directory into a delivery
// destination (typically a story directory alongside the raw source assets).
//
// Does NOT move — copies the file so the run folder remains intact for future
// re-renders or comparisons.
export async function promoteRun(runDir, renderName, destinationDir, options = {}) {
  if (!renderName) {
    throw new Error('Render name is required (e.g. "rough-v2.mp4").');
  }
  if (!destinationDir) {
    throw new Error('Destination directory is required.');
  }

  const { project } = await loadProject(runDir);
  const rendersDir = artifactPath(runDir, project, 'renders');
  const sourcePath = path.join(rendersDir, renderName);

  if (!(await pathExists(sourcePath))) {
    throw new Error(`Render not found: ${sourcePath}`);
  }

  const destDirAbs = path.resolve(destinationDir);
  if (!(await pathExists(destDirAbs))) {
    throw new Error(`Destination dir does not exist: ${destDirAbs}`);
  }

  const finalName = options.outputName || 'video-final.mp4';
  const destPath = path.join(destDirAbs, finalName);

  // Refuse to overwrite an existing file unless --force is set.
  if (await pathExists(destPath) && !options.force) {
    throw new Error(
      `Destination already exists: ${destPath}\nPass --force to overwrite.`
    );
  }

  await fs.copyFile(sourcePath, destPath);
  const stat = await fs.stat(destPath);

  return {
    sourcePath,
    destPath,
    bytes: stat.size,
    finalName
  };
}
