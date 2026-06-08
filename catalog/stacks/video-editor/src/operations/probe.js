import path from 'path';
import { artifactPath, loadProject, readJson, writeJson } from '../lib/files.js';
import { runCommand } from '../lib/process.js';
import { parseFrameRate as parseRate } from '../lib/format.js';

export function summarizeProbe(probe) {
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number.parseFloat(probe.format?.duration || video?.duration || '0');

  return {
    duration,
    video: video ? {
      codec: video.codec_name,
      width: video.width,
      height: video.height,
      rFrameRate: parseRate(video.r_frame_rate),
      avgFrameRate: parseRate(video.avg_frame_rate),
      frames: video.nb_frames ? Number.parseInt(video.nb_frames, 10) : null,
      startTime: Number.parseFloat(video.start_time || '0')
    } : null,
    audio: audio ? {
      codec: audio.codec_name,
      sampleRate: audio.sample_rate ? Number.parseInt(audio.sample_rate, 10) : null,
      channels: audio.channels || null,
      startTime: Number.parseFloat(audio.start_time || '0')
    } : null
  };
}

export async function probeRun(runDir) {
  const { project } = await loadProject(runDir);
  const source = path.join(runDir, project.sourceLink);
  const outputPath = artifactPath(runDir, project, 'probe');

  const { stdout } = await runCommand('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    source
  ], { capture: true });

  const probe = JSON.parse(stdout);
  probe.summary = summarizeProbe(probe);
  await writeJson(outputPath, probe);

  return { outputPath, summary: probe.summary };
}

export async function readProbe(runDir, project) {
  return readJson(artifactPath(runDir, project, 'probe'));
}
