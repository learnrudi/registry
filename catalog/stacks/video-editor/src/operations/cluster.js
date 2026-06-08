import {
  artifactPath,
  loadProject,
  readJson,
  pathExists,
  writeJson
} from '../lib/files.js';
import {
  applyTranscriptCorrections,
  loadTranscriptCorrections
} from '../lib/transcript-corrections.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { flattenTranscriptWords } from '../lib/transcript.js';
import { roundTime } from '../lib/format.js';

function segmentToCluster(segment, index, duration, settings, corrections) {
  const start = roundTime(Math.max(0, segment.start));
  const end = roundTime(Math.max(start, segment.end));
  return {
    id: index + 1,
    source: 'whisper-segment',
    start,
    end,
    keepStart: roundTime(Math.max(0, start - settings.paddingSec)),
    keepEnd: roundTime(Math.min(duration, end + settings.paddingSec)),
    text: applyTranscriptCorrections(segment.text || '', corrections),
    rawText: segment.text || '',
    wordCount: Array.isArray(segment.words) ? segment.words.length : 0
  };
}

function extractTranscriptWords(transcript) {
  return flattenTranscriptWords(transcript, {
    round: false,
    includeProbability: false,
    withSegmentIndex: true,
    extra: { segmentIndex: null }
  });
}

function wordGroupToCluster(words, index, duration, settings, corrections) {
  const start = roundTime(Math.max(0, words[0].start));
  const end = roundTime(Math.max(start, words[words.length - 1].end));
  const rawText = words.map((word) => word.text).join(' ');

  return {
    id: index + 1,
    source: 'whisper-word-gap',
    start,
    end,
    keepStart: roundTime(Math.max(0, start - settings.paddingSec)),
    keepEnd: roundTime(Math.min(duration, end + settings.paddingSec)),
    text: applyTranscriptCorrections(rawText, corrections),
    rawText,
    wordCount: words.length
  };
}

function wordsToClusters(transcript, duration, settings, corrections) {
  const words = extractTranscriptWords(transcript);
  const groups = [];

  for (const word of words) {
    if (groups.length === 0) {
      groups.push([word]);
      continue;
    }

    const current = groups[groups.length - 1];
    const previousWord = current[current.length - 1];
    const wordGap = word.start - previousWord.end;

    if (wordGap <= settings.maxWordGapSec) {
      current.push(word);
      continue;
    }

    groups.push([word]);
  }

  return groups.map((group, index) => (
    wordGroupToCluster(group, index, duration, settings, corrections)
  ));
}

function segmentsToClusters(transcript, duration, settings, corrections) {
  return transcript.segments.map((segment, index) => (
    segmentToCluster(segment, index, duration, settings, corrections)
  ));
}

async function resolveClusterDuration(runDir, project, transcript) {
  const transcriptDuration = transcript.stats?.duration || Math.max(
    0,
    ...transcript.segments.map((segment) => Number(segment.end) || 0)
  );
  const probePath = artifactPath(runDir, project, 'probe');

  if (!(await pathExists(probePath))) {
    return transcriptDuration;
  }

  const probe = await readJson(probePath);
  const mediaDuration = Number(
    probe.summary?.duration ||
    probe.format?.duration ||
    0
  );
  return Math.max(transcriptDuration, Number.isFinite(mediaDuration) ? mediaDuration : 0);
}

function mergeKeepRanges(clusters, settings) {
  const ranges = [];

  for (const cluster of clusters) {
    if (ranges.length === 0) {
      ranges.push({
        start: cluster.keepStart,
        end: cluster.keepEnd,
        clusterIds: [cluster.id]
      });
      continue;
    }

    const previous = ranges[ranges.length - 1];
    const gap = cluster.keepStart - previous.end;
    if (gap < settings.minGapToCutSec) {
      previous.end = Math.max(previous.end, cluster.keepEnd);
      previous.clusterIds.push(cluster.id);
      continue;
    }

    ranges.push({
      start: cluster.keepStart,
      end: cluster.keepEnd,
      clusterIds: [cluster.id]
    });
  }

  return ranges.map((range) => ({
    start: roundTime(range.start),
    end: roundTime(range.end),
    clusterIds: range.clusterIds
  }));
}

export async function clusterTranscriptRun(runDir) {
  const { project } = await loadProject(runDir);
  const transcriptPath = artifactPath(runDir, project, 'transcriptSource');
  const clustersPath = artifactPath(runDir, project, 'transcriptClusters');
  const transcript = await readJson(transcriptPath);
  const settings = {
    ...DEFAULT_SETTINGS.cluster,
    ...(project.settings.cluster || {})
  };
  const correctionsDocument = await loadTranscriptCorrections(runDir, project);
  const corrections = correctionsDocument.replacements;
  const duration = await resolveClusterDuration(runDir, project, transcript);
  const clusters = settings.source === 'words'
    ? wordsToClusters(transcript, duration, settings, corrections)
    : segmentsToClusters(transcript, duration, settings, corrections);
  const keepRanges = mergeKeepRanges(clusters, settings);
  const clusterDocument = {
    schemaVersion: 1,
    sourceTranscript: project.artifacts.transcriptSource,
    corrections: {
      path: correctionsDocument.path,
      replacementCount: corrections.length,
      requiredPhraseCount: correctionsDocument.requiredPhrases.length
    },
    settings,
    stats: {
      clusterCount: clusters.length,
      keepRangeCount: keepRanges.length,
      keepDuration: roundTime(keepRanges.reduce((sum, range) => sum + Math.max(0, range.end - range.start), 0))
    },
    clusters,
    keepRanges
  };

  await writeJson(clustersPath, clusterDocument);
  await advanceRunState(runDir, RunState.CLUSTERED);
  return {
    outputPath: clustersPath,
    clusters: clusterDocument
  };
}
