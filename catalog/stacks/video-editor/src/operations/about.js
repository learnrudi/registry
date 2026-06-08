import fs from 'fs/promises';
import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { resolveRunState } from '../lib/states.js';
import { getDeepseekApiKey, callDeepseek } from '../lib/deepseek.js';
import { summarizeProbe } from '../lib/probe.js';
import { fmtDuration, fmtSize, fmtBitrate } from '../lib/format.js';

// Generates `about.md` (human-readable) + `meta.json` (structured) for a run.
// Idempotent: re-runnable at any stage. Each section is gated on whether the
// upstream artifact exists, so the document grows as more is known.

function summarizeTranscript(t) {
  if (!t) return null;
  const wordCount = (t.words?.length) || (t.stats?.wordCount) || 0;
  const duration = t.duration || 0;
  return {
    wordCount,
    wordsPerSecond: duration > 0 ? Number((wordCount / duration).toFixed(2)) : null,
    model: t.model || null,
    language: t.language || null
  };
}

function summarizeCounts({ silence, chapters, insights, narration }) {
  return {
    silenceCount: silence?.stats?.silenceCount ?? null,
    speedupRangeCount: silence?.stats?.spedRangeCount ?? null,
    chapterCount: Array.isArray(chapters) ? chapters.length : null,
    insightCount: Array.isArray(insights) ? insights.length : null,
    narrationLabelCount: narration?.labels?.length ?? null
  };
}

async function readIf(runDir, project, key) {
  if (!project.artifacts?.[key]) return null;
  const p = artifactPath(runDir, project, key);
  if (!(await pathExists(p))) return null;
  try {
    return await readJson(p);
  } catch (_) {
    return null;
  }
}

function buildMarkdown({ project, stateInfo, probeSummary, transcriptSummary, composition, counts, content }) {
  const lines = [];

  // Header
  lines.push(`# ${project.slug}`);
  lines.push('');
  lines.push(`_Imported ${project.createdAt?.slice(0, 10) || 'unknown'} from \`${project.sourcePath}\`_`);
  lines.push('');

  lines.push('## State');
  lines.push(`- **Current:** ${stateInfo.state}`);
  lines.push(`- **Meaning:** ${stateInfo.description}`);
  if (stateInfo.validNextStates.length > 0) {
    lines.push(`- **Valid next:** ${stateInfo.validNextStates.join(', ')}`);
  }
  if (stateInfo.persistedState && stateInfo.persistedState !== stateInfo.derivedState) {
    lines.push(`- **Derived from artifacts:** ${stateInfo.derivedState}`);
  }
  lines.push('');

  // Technical (always present)
  if (probeSummary) {
    lines.push('## Technical');
    lines.push(`- **Duration:** ${fmtDuration(probeSummary.duration)} (${probeSummary.duration?.toFixed(1)}s)`);
    if (probeSummary.video) {
      const v = probeSummary.video;
      lines.push(`- **Resolution:** ${v.width} × ${v.height}  (${v.orientation}${v.aspectRatio ? `, ${v.aspectRatio}` : ''})`);
      lines.push(`- **Frame rate:** ${v.fps?.toFixed(0) || '?'} fps`);
      lines.push(`- **Video codec:** ${v.codec}${v.profile ? ` (${v.profile})` : ''}${v.pixelFormat ? `, ${v.pixelFormat}` : ''}`);
    }
    if (probeSummary.audio) {
      const a = probeSummary.audio;
      const ch = a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : (a.channelLayout || `${a.channels}ch`);
      lines.push(`- **Audio codec:** ${a.codec}, ${(a.sampleRate / 1000).toFixed(1)} kHz, ${ch}`);
    }
    lines.push(`- **Bitrate:** ${fmtBitrate(probeSummary.bitrate)}`);
    lines.push(`- **File size:** ${fmtSize(probeSummary.fileSize)}`);
    lines.push('');
  }

  // Content (pending until transcript exists)
  lines.push('## Content');
  if (!transcriptSummary) {
    lines.push('_Pending transcribe — run `node src/cli.js transcribe ' + project.slug + ' source`_');
  } else {
    if (content?.title) lines.push(`### ${content.title}`);
    if (content?.summary) {
      lines.push('');
      lines.push(content.summary);
      lines.push('');
    }
    const inline = [];
    if (content?.topic)  inline.push(`**Topic:** ${content.topic}`);
    if (content?.format) inline.push(`**Format:** ${content.format}`);
    if (inline.length) lines.push(inline.join('  ·  '));
    if (content?.entities?.length) {
      lines.push(`**Mentions:** ${content.entities.join(', ')}`);
    }
    if (content?.suggestedSlug && content.suggestedSlug !== project.slug) {
      lines.push(`**Suggested slug:** \`${content.suggestedSlug}\``);
    }
    // Transcript stats footer
    const statsLine = `_${transcriptSummary.wordCount} words` +
      (transcriptSummary.wordsPerSecond ? ` · ${transcriptSummary.wordsPerSecond} words/sec` : '');
    const modelName = typeof transcriptSummary.model === 'string'
      ? transcriptSummary.model
      : transcriptSummary.model?.model;
    lines.push('');
    lines.push(statsLine + (modelName ? ` · Whisper ${modelName}` : '') + '_');
  }
  lines.push('');

  // Edit state (counts from later ops)
  const editLines = [];
  if (counts.silenceCount !== null) {
    editLines.push(`- **Silent gaps detected:** ${counts.silenceCount}` +
      (counts.speedupRangeCount ? ` (${counts.speedupRangeCount} marked for speedup)` : ''));
  }
  if (counts.chapterCount !== null) editLines.push(`- **Chapters:** ${counts.chapterCount}`);
  if (counts.insightCount !== null) editLines.push(`- **Insight cards:** ${counts.insightCount}`);
  if (counts.narrationLabelCount !== null) editLines.push(`- **Narration labels:** ${counts.narrationLabelCount}`);
  if (composition?.timeline?.keepRanges?.length) {
    const total = composition.timeline.keepRanges.reduce(
      (s, r) => s + (r.end - r.start) / (r.speed || 1), 0
    );
    editLines.push(`- **Composition timeline:** ${composition.timeline.keepRanges.length} ranges, ~${fmtDuration(total)} output`);
  }
  if (editLines.length) {
    lines.push('## Edit plan');
    lines.push(...editLines);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

// --- DeepSeek content summarizer -------------------------------------------
// Generates a short content summary from the transcript: title, topic,
// 1-2 sentence summary, mentioned entities, suggested slug.
// Cached in content.json so repeated about runs don't re-call the API.

function buildSummaryPrompt(transcriptText, technical) {
  const orientation = technical?.video?.orientation || 'unknown';
  const duration = technical?.duration ? Math.round(technical.duration) : 0;
  return `You are summarizing a video for a "what is this video" baseline document.

Video info:
- Duration: ${duration}s
- Orientation: ${orientation}

The transcript (may have minor mistranscriptions of proper nouns — infer the right tool/brand names where context makes it obvious; e.g. "clock code" likely = "Claude Code"):

"""
${transcriptText}
"""

Return ONLY this JSON shape (no markdown, no prose, no code fences):
{
  "title": "Short title — 4-7 words",
  "topic": "1-3 word topic category",
  "summary": "One or two sentences explaining what the video is about. Plain factual description.",
  "format": "talking-head | screen-recording | mixed | other",
  "entities": ["proper nouns mentioned, max 8"],
  "suggestedSlug": "kebab-case-version-of-title"
}`;
}

async function generateContentSummary(transcript, technical) {
  if (!getDeepseekApiKey()) {
    return { skipped: true, reason: 'no DEEPSEEK_API_KEY' };
  }
  const text = transcript.text || '';
  if (!text.trim()) {
    return { skipped: true, reason: 'empty transcript' };
  }

  let parsed;
  try {
    parsed = await callDeepseek({
      prompt: buildSummaryPrompt(text, technical),
      temperature: 0.3,
      maxTokens: 400
    });
  } catch (err) {
    return { skipped: true, reason: err.message };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { skipped: true, reason: 'non-JSON response' };
  }

  return {
    title: parsed.title || null,
    topic: parsed.topic || null,
    summary: parsed.summary || null,
    format: parsed.format || null,
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    suggestedSlug: parsed.suggestedSlug || null,
    generatedAt: new Date().toISOString(),
    transcriptWordCount: transcript.stats?.wordCount || transcript.words?.length || 0
  };
}

// Read cached content.json if present + matches current transcript; otherwise
// generate via DeepSeek and cache. Returns null if no transcript exists.
async function getOrGenerateContent(runDir, project, transcript, technical) {
  if (!transcript || !project.artifacts?.content) return null;
  const contentPath = artifactPath(runDir, project, 'content');
  const currentWordCount = transcript.stats?.wordCount || transcript.words?.length || 0;

  if (await pathExists(contentPath)) {
    try {
      const cached = await readJson(contentPath);
      // Invalidate cache if the transcript word count changed (e.g. re-transcribed)
      if (cached.transcriptWordCount === currentWordCount && !cached.skipped) {
        return cached;
      }
    } catch (_) {}
  }

  const fresh = await generateContentSummary(transcript, technical);
  try {
    await writeJson(contentPath, fresh);
  } catch (_) {}
  return fresh;
}

export async function aboutRun(runDir) {
  const { project } = await loadProject(runDir);
  const stateInfo = await resolveRunState(runDir, project);

  const probe = await readIf(runDir, project, 'probe');
  const transcript = await readIf(runDir, project, 'transcriptSource');
  const composition = await readIf(runDir, project, 'composition');
  const silence = await readIf(runDir, project, 'silence');
  const narration = await readIf(runDir, project, 'narration');
  const insightsData = await readIf(runDir, project, 'insights');
  const probeSummary = probe ? summarizeProbe(probe) : null;
  const transcriptSummary = summarizeTranscript(transcript);
  const counts = summarizeCounts({
    silence,
    chapters: composition?.timeline?.chapters,
    insights: insightsData?.insights,
    narration
  });

  // Content summary via DeepSeek (cached in content.json).
  // Async + best-effort: if no key or API fails, we proceed without it.
  const content = await getOrGenerateContent(runDir, project, transcript, probeSummary);

  const meta = {
    schemaVersion: 1,
    slug: project.slug,
    sourcePath: project.sourcePath,
    createdAt: project.createdAt,
    state: stateInfo.state,
    stateDescription: stateInfo.description,
    derivedState: stateInfo.derivedState,
    persistedState: stateInfo.persistedState,
    validNextStates: stateInfo.validNextStates,
    artifacts: stateInfo.artifacts,
    technical: probeSummary,
    transcript: transcriptSummary,
    counts,
    content: content && !content.skipped ? content : null
  };

  const md = buildMarkdown({
    project,
    stateInfo,
    probeSummary,
    transcriptSummary,
    composition,
    counts,
    content: content && !content.skipped ? content : null
  });

  const metaPath = path.join(runDir, 'meta.json');
  const aboutPath = path.join(runDir, 'about.md');
  await writeJson(metaPath, meta);
  await fs.writeFile(aboutPath, md, 'utf8');

  return {
    aboutPath,
    metaPath,
    stage: stateInfo.state,
    technical: probeSummary,
    project
  };
}
