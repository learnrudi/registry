import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson
} from '../lib/files.js';
import { runCommand } from '../lib/process.js';
import { auditCutsRun } from './cut-audit.js';
import { transcribeRun } from './transcribe.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { roundTime, formatSeconds } from '../lib/format.js';

function normalizeOutputName(outputName) {
  const name = outputName || 'rough-v1.mp4';
  if (path.basename(name) !== name) {
    throw new Error('Render output name must be a file name, not a path');
  }
  if (!name.toLowerCase().endsWith('.mp4')) {
    throw new Error('Render output name must end with .mp4');
  }
  return name;
}

function normalizeKeepRanges(composition) {
  const ranges = composition.timeline?.keepRanges;
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('composition.timeline.keepRanges must contain at least one range');
  }

  return ranges.map((range, index) => {
    const start = Number(range.start);
    const end = Number(range.end);
    const rawSpeed = Number(range.speed);
    const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Invalid keep range at index ${index}`);
    }
    const sourceDuration = end - start;
    return {
      start: roundTime(start),
      end: roundTime(end),
      speed,
      duration: roundTime(sourceDuration),
      outputDuration: roundTime(sourceDuration / speed)
    };
  });
}

async function detectAudio(runDir, project) {
  const probePath = artifactPath(runDir, project, 'probe');
  if (!(await pathExists(probePath))) {
    return true;
  }

  const probe = await readJson(probePath);
  return Array.isArray(probe.streams) && probe.streams.some((stream) => stream.codec_type === 'audio');
}

function buildAudioFadeFilter(duration, requestedFadeSeconds) {
  const fadeSeconds = Math.max(
    0,
    Math.min(requestedFadeSeconds, duration / 4)
  );

  if (fadeSeconds === 0) {
    return '';
  }

  const fade = formatSeconds(fadeSeconds);
  const outStart = formatSeconds(Math.max(0, duration - fadeSeconds));
  return `,afade=t=in:st=0:d=${fade},afade=t=out:st=${outStart}:d=${fade}`;
}

function buildAtempoChain(speed) {
  if (speed === 1) return '';
  // atempo accepts 0.5–100 per filter; chain so each link stays in safe range
  if (speed <= 2)  return `,atempo=${formatSeconds(speed)}`;
  if (speed <= 4)  return `,atempo=2.0,atempo=${formatSeconds(speed / 2)}`;
  if (speed <= 8)  return `,atempo=2.0,atempo=2.0,atempo=${formatSeconds(speed / 4)}`;
  return `,atempo=2.0,atempo=2.0,atempo=2.0,atempo=${formatSeconds(speed / 8)}`;
}

function buildFilterComplex(keepRanges, options) {
  const chains = [];
  const concatInputs = [];
  const hasAudio = options.hasAudio;
  const audioFadeSeconds = options.audioFadeSeconds;

  for (let index = 0; index < keepRanges.length; index += 1) {
    const range = keepRanges[index];
    const start = formatSeconds(range.start);
    const end = formatSeconds(range.end);
    const speed = range.speed || 1;
    const videoSpeed = speed === 1 ? '' : `/${formatSeconds(speed)}`;

    chains.push(`[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)${videoSpeed}[v${index}]`);
    concatInputs.push(`[v${index}]`);

    if (hasAudio) {
      // afade operates after atempo, so its timing is in OUTPUT time
      const fadeFilter = buildAudioFadeFilter(range.outputDuration || range.duration, audioFadeSeconds);
      const atempoChain = buildAtempoChain(speed);
      chains.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${atempoChain}${fadeFilter}[a${index}]`);
      concatInputs.push(`[a${index}]`);
    }
  }

  const concatOutputs = hasAudio ? '[v][a]' : '[v]';
  chains.push(`${concatInputs.join('')}concat=n=${keepRanges.length}:v=1:a=${hasAudio ? 1 : 0}${concatOutputs}`);

  return chains.join(';');
}

async function maybeRefreshTranscriptEvidence(runDir, project, outputName) {
  if (project.settings.transcription?.autoTranscribeRenders === false) {
    return false;
  }

  const sourceTranscriptPath = artifactPath(runDir, project, 'transcriptSource');
  if (!(await pathExists(sourceTranscriptPath))) {
    await transcribeRun(runDir, 'source');
  }

  await transcribeRun(runDir, 'output', { renderName: outputName });
  await auditCutsRun(runDir);
  return true;
}

export async function renderRoughRun(runDir, outputNameArg = 'rough-v1.mp4') {
  const { project } = await loadProject(runDir);
  const outputName = normalizeOutputName(outputNameArg);
  const composition = await readJson(artifactPath(runDir, project, 'composition'));
  const keepRanges = normalizeKeepRanges(composition);
  const workingPath = artifactPath(runDir, project, 'working');
  const outputPath = path.join(artifactPath(runDir, project, 'renders'), outputName);

  if (!(await pathExists(workingPath))) {
    throw new Error(`Working media not found: ${workingPath}`);
  }

  const hasAudio = await detectAudio(runDir, project);
  const audioFadeSeconds = Number(project.settings.render?.audioCrossfadeSeconds || 0);
  const filterComplex = buildFilterComplex(keepRanges, {
    hasAudio,
    audioFadeSeconds: Number.isFinite(audioFadeSeconds) ? audioFadeSeconds : 0
  });
  const args = [
    '-hide_banner',
    '-y',
    '-i', workingPath,
    '-filter_complex', filterComplex,
    '-map', '[v]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p'
  ];

  if (hasAudio) {
    args.push(
      '-map', '[a]',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', String(project.settings.audioSampleRate || 48000),
      '-ac', String(project.settings.audioChannels || 2)
    );
  }

  args.push('-movflags', '+faststart', outputPath);

  await runCommand('ffmpeg', args);
  const evidenceRefreshed = await maybeRefreshTranscriptEvidence(runDir, project, outputName);
  await advanceRunState(runDir, RunState.RENDERED);

  return {
    outputPath,
    renderer: 'ffmpeg',
    keepRangeCount: keepRanges.length,
    timelineDuration: roundTime(keepRanges.reduce((sum, range) => sum + (range.outputDuration || range.duration), 0)),
    evidenceRefreshed
  };
}
