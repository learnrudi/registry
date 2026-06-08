import path from 'path';
import fs from 'fs/promises';
import {artifactPath, loadProject, pathExists, writeJson} from '../lib/files.js';
import {runCommand} from '../lib/process.js';
import { parseFrameRate as parseRate } from '../lib/format.js';

function summarizeMedia(probe) {
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');

  return {
    duration: Number.parseFloat(probe.format?.duration || '0'),
    size: Number.parseInt(probe.format?.size || '0', 10),
    bitRate: Number.parseInt(probe.format?.bit_rate || '0', 10),
    video: video ? {
      codec: video.codec_name,
      width: video.width,
      height: video.height,
      fps: parseRate(video.avg_frame_rate),
      frames: video.nb_frames ? Number.parseInt(video.nb_frames, 10) : null
    } : null,
    audio: audio ? {
      codec: audio.codec_name,
      sampleRate: audio.sample_rate ? Number.parseInt(audio.sample_rate, 10) : null,
      channels: audio.channels || null
    } : null
  };
}

async function probeMedia(mediaPath) {
  const {stdout} = await runCommand('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    mediaPath
  ], {capture: true});

  return JSON.parse(stdout);
}

async function extractFrame(mediaPath, outputPath, atSeconds) {
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await runCommand('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-ss', atSeconds.toFixed(3),
    '-i', mediaPath,
    '-frames:v', '1',
    '-q:v', '2',
    outputPath
  ]);
}

export async function qaRun(runDir, renderName = 'rough-v1.mp4') {
  const {project} = await loadProject(runDir);
  const renderPath = path.join(artifactPath(runDir, project, 'renders'), renderName);

  if (!(await pathExists(renderPath))) {
    throw new Error(`Render not found: ${renderPath}`);
  }

  const probe = await probeMedia(renderPath);
  const summary = summarizeMedia(probe);
  const frameTimes = [
    Math.max(0, summary.duration * 0.15),
    Math.max(0, summary.duration * 0.5),
    Math.max(0, summary.duration * 0.85)
  ];

  const framesDir = path.join(artifactPath(runDir, project, 'qa'), 'frames');
  const frames = [];

  for (let index = 0; index < frameTimes.length; index += 1) {
    const outputPath = path.join(framesDir, `${path.basename(renderName, path.extname(renderName))}_frame_${index + 1}.jpg`);
    await extractFrame(renderPath, outputPath, frameTimes[index]);
    frames.push({
      at: Number(frameTimes[index].toFixed(3)),
      path: path.relative(runDir, outputPath)
    });
  }

  const report = {
    schemaVersion: 1,
    render: path.relative(runDir, renderPath),
    createdAt: new Date().toISOString(),
    summary,
    frames
  };

  const reportPath = path.join(artifactPath(runDir, project, 'qa'), 'report.json');
  await writeJson(reportPath, report);

  return {reportPath, report};
}
