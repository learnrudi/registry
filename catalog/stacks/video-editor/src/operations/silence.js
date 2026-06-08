import path from 'path';
import { artifactPath, loadProject, pathExists, writeJson } from '../lib/files.js';
import { runCommand } from '../lib/process.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { roundTime } from '../lib/format.js';

function parseSilences(output, duration) {
  const silences = [];
  let openStart = null;

  for (const line of output.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      openStart = Number.parseFloat(startMatch[1]);
      continue;
    }

    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch && openStart !== null) {
      const end = Number.parseFloat(endMatch[1]);
      silences.push({
        start: roundTime(openStart),
        end: roundTime(end),
        duration: roundTime(Math.max(0, end - openStart))
      });
      openStart = null;
    }
  }

  if (openStart !== null && duration > openStart) {
    silences.push({
      start: roundTime(openStart),
      end: roundTime(duration),
      duration: roundTime(duration - openStart)
    });
  }

  return silences;
}

function calculateKeepRanges(silences, duration, padding, minKeepDuration) {
  const keepRanges = [];
  let cursor = 0;

  for (const silence of silences) {
    const end = Math.max(cursor, silence.start - padding);
    if (end - cursor >= minKeepDuration) {
      keepRanges.push({
        start: roundTime(cursor),
        end: roundTime(end),
        duration: roundTime(end - cursor)
      });
    }
    cursor = Math.min(duration, silence.end + padding);
  }

  if (duration - cursor >= minKeepDuration) {
    keepRanges.push({
      start: roundTime(cursor),
      end: roundTime(duration),
      duration: roundTime(duration - cursor)
    });
  }

  return keepRanges;
}

// Emit silent stretches as their own keep ranges with a `speed` factor.
// Plan.js merges these with whichever talk-source it selects.
// Returns [] when speedup mode is disabled or no silence meets the duration threshold.
function buildSpedRanges(silences, options) {
  const { factor, minSec } = options;
  return silences
    .filter((s) => s.duration >= minSec)
    .map((s) => ({
      start: roundTime(s.start),
      end: roundTime(s.end),
      duration: roundTime(s.end - s.start),
      speed: factor
    }));
}

async function getMediaDuration(mediaPath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mediaPath
  ], { capture: true });

  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error(`Unable to determine media duration for ${mediaPath}`);
  }
  return duration;
}

export async function detectSilenceRun(runDir) {
  const { project } = await loadProject(runDir);
  const workingPath = artifactPath(runDir, project, 'working');
  const source = await pathExists(workingPath) ? workingPath : path.join(runDir, project.sourceLink);
  const duration = await getMediaDuration(source);
  const settings = project.settings.silence;

  const { stdout, stderr } = await runCommand('ffmpeg', [
    '-hide_banner',
    '-i', source,
    '-af', `silencedetect=noise=${settings.thresholdDb}dB:duration=${settings.minDuration}`,
    '-f', 'null',
    '-'
  ], { capture: true });

  const silences = parseSilences(`${stdout}\n${stderr}`, duration);
  const keepRanges = calculateKeepRanges(
    silences,
    duration,
    settings.padding,
    settings.minKeepDuration
  );
  const spedRanges = settings.speedupInsteadOfCut
    ? buildSpedRanges(silences, {
        factor: settings.speedupFactor || 6,
        minSec: settings.speedupMinSec || 5
      })
    : [];
  const keepDuration = keepRanges.reduce((sum, range) => sum + range.duration, 0);
  const spedDuration = spedRanges.reduce((sum, range) => sum + range.duration / range.speed, 0);
  const removedDuration = Math.max(0, duration - keepDuration - spedDuration);

  const analysis = {
    schemaVersion: 1,
    source,
    settings,
    duration: roundTime(duration),
    silences,
    keepRanges,
    spedRanges,
    stats: {
      silenceCount: silences.length,
      keepRangeCount: keepRanges.length,
      spedRangeCount: spedRanges.length,
      keepDuration: roundTime(keepDuration),
      spedOutputDuration: roundTime(spedDuration),
      removedDuration: roundTime(removedDuration),
      removedPercent: duration > 0 ? roundTime((removedDuration / duration) * 100) : 0
    }
  };

  const outputPath = artifactPath(runDir, project, 'silence');
  await writeJson(outputPath, analysis);
  await advanceRunState(runDir, RunState.ANALYZED);
  return { outputPath, analysis };
}
