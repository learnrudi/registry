import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { mapSourceTimeToTimeline } from '../lib/timeline.js';
import { roundTime } from '../lib/format.js';

// Subtract talk intervals from each sped range. Talk takes priority; if a sped
// range overlaps talk, the talk-covered portion is removed and the sped range
// may be split into multiple smaller pieces. Pieces below minSec are dropped.
function carveSpedRangesAroundTalk(spedRanges, talkRanges, { minSec }) {
  const result = [];
  const talks = [...talkRanges].sort((a, b) => a.start - b.start);

  for (const sped of spedRanges) {
    let pieces = [{ start: sped.start, end: sped.end }];
    for (const talk of talks) {
      const next = [];
      for (const piece of pieces) {
        if (talk.end <= piece.start || talk.start >= piece.end) {
          next.push(piece);
          continue;
        }
        if (talk.start > piece.start) next.push({ start: piece.start, end: talk.start });
        if (talk.end < piece.end)     next.push({ start: talk.end, end: piece.end });
      }
      pieces = next;
    }
    for (const p of pieces) {
      if (p.end - p.start >= minSec) {
        result.push({
          start: roundTime(p.start),
          end: roundTime(p.end),
          duration: roundTime(p.end - p.start),
          speed: sped.speed
        });
      }
    }
  }
  return result;
}

export async function planCompositionRun(runDir) {
  const { project } = await loadProject(runDir);
  const silencePath = artifactPath(runDir, project, 'silence');
  const cutAuditPath = project.artifacts.cutAudit ? artifactPath(runDir, project, 'cutAudit') : null;
  const transcriptClustersPath = project.artifacts.transcriptClusters
    ? artifactPath(runDir, project, 'transcriptClusters')
    : null;
  const narrationPath = project.artifacts.narration ? artifactPath(runDir, project, 'narration') : null;
  const insightsPath = project.artifacts.insights ? artifactPath(runDir, project, 'insights') : null;
  const compositionPath = artifactPath(runDir, project, 'composition');

  const silence = await readJson(silencePath);
  const cutAudit = cutAuditPath && await pathExists(cutAuditPath)
    ? await readJson(cutAuditPath)
    : null;
  const transcriptClusters = transcriptClustersPath && await pathExists(transcriptClustersPath)
    ? await readJson(transcriptClustersPath)
    : null;
  const narration = narrationPath && await pathExists(narrationPath)
    ? await readJson(narrationPath)
    : null;
  const insightsData = insightsPath && await pathExists(insightsPath)
    ? await readJson(insightsPath)
    : null;
  const composition = await readJson(compositionPath);
  const talkSource = transcriptClusters?.keepRanges || cutAudit?.resolvedKeepRanges || silence.keepRanges;
  // Silence-detected speedup ranges are independent of which talk source we picked;
  // they always reflect the silent stretches of the source media. When a sped range
  // overlaps with a talk range, talk wins — speech is the user's content, silence is filler.
  const spedSource = silence.spedRanges || [];
  const carved = carveSpedRangesAroundTalk(spedSource, talkSource, {
    minSec: project.settings.silence?.speedupMinSec || 5
  });
  const sourceRanges = [...talkSource, ...carved].sort((a, b) => a.start - b.start);

  const keepRanges = sourceRanges.map((range) => {
    const entry = { start: range.start, end: range.end };
    if (Number.isFinite(range.speed) && range.speed > 0 && range.speed !== 1) {
      entry.speed = range.speed;
    }
    return entry;
  });

  // Translate narration labels (source-time) into textOverlays (timeline-time).
  // When chapters exist, the chapter title already carries the section name —
  // suppress the duplicate textOverlay to avoid the double-label effect.
  const hasChapters = (composition.timeline?.chapters || []).length > 0;
  let textOverlays = narration?.labels?.length ? [] : (composition.timeline?.textOverlays || []);
  if (narration?.labels?.length && !hasChapters) {
    for (const label of narration.labels) {
      const timelineAt = mapSourceTimeToTimeline(label.at, keepRanges);
      if (timelineAt === null) continue;
      const containing = keepRanges.find((r) => label.at >= r.start && label.at < r.end);
      const speed = containing?.speed || 1;
      const cappedDuration = roundTime(Math.min(label.duration / speed, label.duration));
      textOverlays.push({
        at: roundTime(timelineAt),
        duration: cappedDuration,
        text: label.text,
        ...(label.position ? { position: label.position } : {})
      });
    }
  }

  // Pull insights into the composition (already in timeline-time from insights.js)
  const insights = insightsData?.insights || composition.timeline?.insights || [];

  const nextComposition = {
    ...composition,
    source: {
      path: project.artifacts.working,
      fps: project.settings.fps
    },
    timeline: {
      ...composition.timeline,
      audioCrossfadeSeconds: project.settings.render?.audioCrossfadeSeconds || 0,
      keepRanges,
      textOverlays,
      insights
    }
  };

  await writeJson(compositionPath, nextComposition);
  await advanceRunState(runDir, RunState.PLANNED);

  return {
    outputPath: compositionPath,
    source: transcriptClusters ? 'transcript-clusters' : cutAudit ? 'cut-audit' : 'silence',
    keepRangeCount: keepRanges.length,
    sourceDuration: silence.duration,
    timelineDuration: roundTime(keepRanges.reduce((sum, range) => {
      const speed = range.speed || 1;
      return sum + Math.max(0, (range.end - range.start) / speed);
    }, 0)),
    narrationLabelCount: narration?.labels?.length || 0,
    textOverlayCount: textOverlays.length,
    insightCount: insights.length
  };
}
