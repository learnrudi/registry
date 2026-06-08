import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { mapSourceTimeToTimeline } from '../lib/timeline.js';
import { roundTime } from '../lib/format.js';

// Research-backed chapter sizing. Targets align with TikTok retention
// checkpoints (3s, 15s, 30s, 60s) — chapter boundaries near these moments
// turn natural drop points into re-commitments.
// Sources: retensis.com TikTok benchmarks, opus.pro length data.
function chapterSizingForDuration(durationSec) {
  if (durationSec < 30)  return null;                                    // skip
  if (durationSec < 60)  return { target: 4,  maxSec: 18, minSec: 6 };
  if (durationSec < 90)  return { target: 5,  maxSec: 20, minSec: 7 };
  if (durationSec < 180) return { target: 8,  maxSec: 20, minSec: 8 };   // 90s–3min
  if (durationSec < 300) return { target: 11, maxSec: 26, minSec: 10 };
  if (durationSec < 600) return { target: 15, maxSec: 32, minSec: 12 };
  return { target: 18, maxSec: 40, minSec: 14 };
}

async function titleFromOllama(host, model, snippet, isSped) {
  const role = isSped ? 'a fast-forwarded silent stretch' : 'a section where the presenter is talking';
  const prompt = `You are titling chapters in a short vertical video.

This chapter is ${role}. The transcript snippet for it is:
"""
${snippet}
"""

Write a 2-3 word title (max 22 characters) that captures what is happening. Use sentence case. Avoid filler words like "the" or "a" at the start. Avoid quotes.

Examples of good titles: "Setting up brief", "First reaction", "Adding handle", "Wrapping up", "Picking a model".

Respond with only the title — no explanation, no quotes, no punctuation at end.`;

  try {
    const res = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { num_predict: 16, temperature: 0.3 }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.response || '').trim().split('\n')[0].trim();
    // Allow up to 40 chars — the ChapterLabel component already handles overflow
    // with ellipsis at render time, so a clean longer title is better than a
    // truncated one. Most good titles land at 22-32 chars.
    const cleaned = raw.replace(/^["'.,*\s]+|["'.,*\s]+$/g, '').slice(0, 40);
    return cleaned || null;
  } catch (_) {
    return null;
  }
}

// Walk keepRanges and emit per-range chapter spans on the TIMELINE axis.
// Each entry: { start, end, sourceStart, sourceEnd, speed, isSped }
function timelineSpans(keepRanges) {
  const spans = [];
  let cursor = 0;
  for (const r of keepRanges) {
    const speed = r.speed || 1;
    const outDur = (r.end - r.start) / speed;
    spans.push({
      start: cursor,
      end: cursor + outDur,
      sourceStart: r.start,
      sourceEnd: r.end,
      speed,
      isSped: speed > 1
    });
    cursor += outDur;
  }
  return spans;
}

// Full transcript text within a source-time range — used as input to title generation.
function transcriptSnippet(words, sourceStart, sourceEnd, maxWords = 30) {
  const inRange = words
    .filter((w) => w.start >= sourceStart && w.end <= sourceEnd)
    .slice(0, maxWords);
  if (inRange.length === 0) return '';
  return inRange.map((w) => (w.text || w.word || '')).join(' ');
}

// Crude fallback when LLM is unavailable.
function titleFromTranscriptFallback(snippet) {
  if (!snippet) return null;
  const words = snippet.split(/\s+/).slice(0, 4);
  return words.join(' ').replace(/[.,?!]$/, '');
}

// Match a sped span to a narration label that falls inside its source range.
function labelForSpan(span, narrationLabels) {
  if (!span.isSped || !narrationLabels) return null;
  const hit = narrationLabels.find((l) =>
    l.at >= span.sourceStart && l.at < span.sourceEnd
  );
  return hit?.text || null;
}

// Split a single talk span into ~maxChapterSec sub-chapters, titled from transcript.
function splitTalkSpan(span, words, maxChapterSec) {
  const outDuration = span.end - span.start;
  if (outDuration <= maxChapterSec) return [span];

  const pieces = Math.ceil(outDuration / maxChapterSec);
  const sourceDuration = span.sourceEnd - span.sourceStart;
  const pieceSourceDur = sourceDuration / pieces;
  const pieceTimelineDur = outDuration / pieces;

  return Array.from({ length: pieces }).map((_, i) => ({
    ...span,
    start: span.start + i * pieceTimelineDur,
    end: span.start + (i + 1) * pieceTimelineDur,
    sourceStart: span.sourceStart + i * pieceSourceDur,
    sourceEnd: span.sourceStart + (i + 1) * pieceSourceDur
  }));
}

export async function chaptersRun(runDir) {
  const { project } = await loadProject(runDir);
  const compositionPath = artifactPath(runDir, project, 'composition');
  const transcriptPath = artifactPath(runDir, project, 'transcriptSource');
  const narrationPath = project.artifacts.narration
    ? artifactPath(runDir, project, 'narration')
    : null;

  const settings = { ...DEFAULT_SETTINGS.chapters, ...(project.settings.chapters || {}) };
  const composition = await readJson(compositionPath);
  const keepRanges = composition.timeline?.keepRanges || [];
  if (keepRanges.length === 0) throw new Error('composition.keepRanges is empty. Run `plan` first.');

  // Compute timeline duration and resolve auto-sizing.
  const timelineDuration = keepRanges.reduce((s, r) => s + (r.end - r.start) / (r.speed || 1), 0);
  const auto = chapterSizingForDuration(timelineDuration);
  if (auto === null && settings.maxChapterSec === null) {
    return { outputPath: compositionPath, chapterCount: 0, chapters: [], reason: 'video too short for chapters (<30s)' };
  }
  const maxChapterSec = settings.maxChapterSec ?? (auto?.maxSec || 20);
  const minChapterSec = settings.minChapterSec ?? (auto?.minSec || 8);

  const transcript = (await pathExists(transcriptPath)) ? await readJson(transcriptPath) : { words: [] };
  const narration = narrationPath && (await pathExists(narrationPath)) ? await readJson(narrationPath) : null;

  const spans = timelineSpans(keepRanges);

  // Expand: split long talk spans, keep sped spans as single chapters
  const expanded = [];
  for (const span of spans) {
    if (span.isSped) {
      expanded.push(span);
    } else {
      expanded.push(...splitTalkSpan(span, transcript.words || [], maxChapterSec));
    }
  }

  // Build chapter titles. For sped spans prefer the existing narration label.
  // For talk spans, ask local LLM for a tight title; fall back to transcript stub.
  const chapters = [];
  for (const span of expanded) {
    const snippet = transcriptSnippet(transcript.words || [], span.sourceStart, span.sourceEnd);
    let title = labelForSpan(span, narration?.labels);
    if (!title && settings.titleSource === 'ollama') {
      title = await titleFromOllama(settings.ollamaHost, settings.ollamaModel, snippet, span.isSped);
    }
    if (!title) {
      title = titleFromTranscriptFallback(snippet) || (span.isSped ? 'Working' : 'Talking');
    }
    chapters.push({ at: roundTime(span.start), title, _isSped: span.isSped });
  }

  // Merge tiny adjacent talk chapters. Sped chapters are exempt — they're
  // valuable signposts ("watch AI work") even when naturally short due to speedup.
  // A too-short FIRST chapter is dropped and the next one is shifted to start at 0
  // so the video opens cleanly with a real chapter, not a 4s sliver.
  const merged = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const ch = chapters[i];
    const nextAt = i + 1 < chapters.length ? chapters[i + 1].at : expanded[expanded.length - 1].end;
    const dur = nextAt - ch.at;
    if (dur < minChapterSec && !ch._isSped) {
      if (merged.length === 0 && i + 1 < chapters.length) {
        chapters[i + 1] = { ...chapters[i + 1], at: 0 };
        continue;
      }
      if (merged.length > 0) continue;
    }
    merged.push(ch);
  }

  // Drop the internal _isSped marker before writing
  const cleanChapters = merged.map(({ _isSped, ...rest }) => rest);

  // Write back to composition
  const next = {
    ...composition,
    timeline: {
      ...composition.timeline,
      chapters: cleanChapters
    }
  };
  await writeJson(compositionPath, next);
  await advanceRunState(runDir, RunState.ANALYZED);

  return {
    outputPath: compositionPath,
    chapterCount: cleanChapters.length,
    chapters: cleanChapters
  };
}
