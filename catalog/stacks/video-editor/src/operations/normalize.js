import path from 'path';
import { artifactPath, loadProject, pathExists } from '../lib/files.js';
import { runCommand } from '../lib/process.js';
import { readProbe } from './probe.js';

export async function normalizeRun(runDir) {
  const { project } = await loadProject(runDir);
  const source = path.join(runDir, project.sourceLink);
  const outputPath = artifactPath(runDir, project, 'working');

  let hasAudio = true;
  if (await pathExists(artifactPath(runDir, project, 'probe'))) {
    const probe = await readProbe(runDir, project);
    hasAudio = probe.streams.some((stream) => stream.codec_type === 'audio');
  }

  const args = [
    '-hide_banner',
    '-y',
    '-i', source,
    '-map', '0:v:0'
  ];

  if (hasAudio) {
    args.push('-map', '0:a:0');
  }

  args.push(
    '-vf', `fps=${project.settings.fps},format=yuv420p`,
    '-r', String(project.settings.fps),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18'
  );

  if (hasAudio) {
    args.push(
      '-af', 'aresample=async=1:first_pts=0',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', String(project.settings.audioSampleRate),
      '-ac', String(project.settings.audioChannels)
    );
  }

  args.push('-movflags', '+faststart', outputPath);

  await runCommand('ffmpeg', args);
  return { outputPath };
}
