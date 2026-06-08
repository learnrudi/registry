import { spawn } from 'child_process';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { callDeepseek as callDeepseekShared } from '../lib/deepseek.js';
import { mapSourceTimeToTimeline } from '../lib/timeline.js';
import { roundTime } from '../lib/format.js';

// Explicit spawn-with-stdin-closed wrapper. The Claude CLI behaves differently
// depending on stdio attachment; explicitly closing stdin avoids the case where
// it waits for input.
function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (c) => stdoutChunks.push(c));
    child.stderr.on('data', (c) => stderrChunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 400)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function callDeepseek(baseUrl, model, prompt) {
  // Insights wants a parsed JSON object; lib/deepseek already parses with response_format=json_object.
  const result = await callDeepseekShared({
    prompt,
    model,
    baseUrl,
    temperature: 0.4,
    maxTokens: 800
  });
  // Defensive: if the model returned a string instead of an object, fall back to empty.
  if (typeof result === 'string') return { insights: [] };
  return result;
}

function buildPrompt(transcriptText, targetCount) {
  return `You are extracting overlay cards for a short-form screen-recording video where a creator shows how they use AI tools.

Return ${targetCount} cards positioned across the video timeline:

CARD 1 — PREMISE (anchor to FIRST sentence of transcript)
Names what the viewer is watching. Not a lesson — a category framing.
- anchor: first 3-6 words of the transcript
- headline: 2-4 words naming the workflow (e.g. "TIKTOK HOOK GRAPHIC", "AI VIDEO INTRO", "BRAND COLOR PALETTE")
- body: one short line stating the tool + outcome (e.g. "Built in Claude in 3 minutes")

CARDS 2-${targetCount} — INSIGHTS (anchor to MID and LATE moments in transcript)
Non-obvious teaching moments — implicit workflow principles, not surface actions.
- Spread these across the rest of the transcript (don't cluster at the end)
- Look for the underlying CRAFT: how they prompt, what they accept, how they iterate
- Avoid surface observations like "they downloaded" or "they typed"
- anchor: 3-6 word phrase from transcript that marks the moment
- headline: 2-4 words ALL CAPS, memorable (e.g. "SPEC THE FEEL", "ACCEPT GOOD ENOUGH")
- body: one short sentence, max 14 words, sentence case

Return ONLY valid JSON in this exact shape, no prose, no markdown, no code fences:
{"insights":[{"anchor":"phrase","headline":"HEADLINE","body":"Body sentence."}]}

Transcript:
"""
${transcriptText}
"""`;
}

const INSIGHTS_JSON_SCHEMA = {
  type: 'object',
  required: ['insights'],
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        required: ['anchor', 'headline', 'body'],
        properties: {
          anchor: { type: 'string' },
          headline: { type: 'string' },
          body: { type: 'string' }
        }
      }
    }
  }
};

async function callClaude(model, prompt) {
  const { stdout } = await runCapture('claude', [
    '-p',
    '--output-format', 'json',
    '--no-session-persistence',
    '--json-schema', JSON.stringify(INSIGHTS_JSON_SCHEMA),
    '--model', model,
    prompt
  ]);
  const envelope = JSON.parse(stdout);
  if (envelope.is_error) {
    throw new Error(`Claude error: ${envelope.result || 'unknown'}`);
  }
  // Prefer the validated structured_output; fall back to parsing result
  if (envelope.structured_output?.insights) {
    return { insights: envelope.structured_output.insights };
  }
  const raw = envelope.result || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function callOllama(host, model, prompt) {
  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { num_predict: 600, temperature: 0.4 }
    })
  });
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return JSON.parse(data.response || '{"insights":[]}');
}

// Find the source-time of the first occurrence of an anchor phrase in the
// word stream. Returns the start-of-first-word time, or null if not found.
// Tokenizer matches the per-word normalization so apostrophes/punctuation
// resolve consistently ("Let's" → "lets" on both sides).
function normalizeToken(s) {
  return String(s).toLowerCase().replace(/[^\w]/g, '');
}

function locateAnchor(words, anchor) {
  if (!anchor) return null;
  const tokens = anchor.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return null;
  const stream = words.map((w) => normalizeToken(w.text || w.word || ''));
  for (let i = 0; i <= stream.length - tokens.length; i += 1) {
    let match = true;
    for (let j = 0; j < tokens.length; j += 1) {
      if (stream[i + j] !== tokens[j]) { match = false; break; }
    }
    if (match) return words[i].start;
  }
  // Fallback: find the longest contiguous prefix that matches
  for (let prefixLen = Math.min(tokens.length, 6); prefixLen >= 2; prefixLen -= 1) {
    for (let i = 0; i <= stream.length - prefixLen; i += 1) {
      let match = true;
      for (let j = 0; j < prefixLen; j += 1) {
        if (stream[i + j] !== tokens[j]) { match = false; break; }
      }
      if (match) return words[i].start;
    }
  }
  return null;
}

export async function insightsRun(runDir) {
  const { project } = await loadProject(runDir);

  const transcriptPath = artifactPath(runDir, project, 'transcriptSource');
  const compositionPath = artifactPath(runDir, project, 'composition');
  const insightsPath = project.artifacts.insights
    ? artifactPath(runDir, project, 'insights')
    : artifactPath(runDir, project, 'composition').replace(/composition\.json$/, 'insights.json');

  if (!(await pathExists(transcriptPath))) {
    throw new Error('Missing transcript-source.json. Run `transcribe` first.');
  }

  const settings = { ...DEFAULT_SETTINGS.insights, ...(project.settings.insights || {}) };
  const transcript = await readJson(transcriptPath);
  const composition = await readJson(compositionPath);
  const keepRanges = composition.timeline?.keepRanges || [];

  const text = transcript.text || (transcript.words || []).map((w) => w.text || w.word || '').join(' ');
  if (!text.trim()) throw new Error('transcript has no text');

  const provider = settings.provider;
  const modelLabel =
    provider === 'claude' ? settings.claudeModel :
    provider === 'deepseek' ? settings.deepseekModel :
    settings.ollamaModel;
  process.stderr.write(`Asking ${provider} (${modelLabel}) for ${settings.maxInsights} teaching moments...\n`);
  const prompt = buildPrompt(text, settings.maxInsights);
  const parsed =
    provider === 'claude'   ? await callClaude(settings.claudeModel, prompt) :
    provider === 'deepseek' ? await callDeepseek(settings.deepseekBaseUrl, settings.deepseekModel, prompt) :
                              await callOllama(settings.ollamaHost, settings.ollamaModel, prompt);
  const proposed = Array.isArray(parsed.insights) ? parsed.insights : [];

  // Map each insight to a timeline timestamp via its anchor phrase
  const insights = [];
  for (const item of proposed) {
    const sourceAt = locateAnchor(transcript.words || [], item.anchor);
    if (sourceAt === null) {
      process.stderr.write(`  skipped (anchor not found): "${item.anchor}"\n`);
      continue;
    }
    const timelineAt = mapSourceTimeToTimeline(sourceAt, keepRanges);
    if (timelineAt === null) {
      process.stderr.write(`  skipped (in dropped range): "${item.anchor}"\n`);
      continue;
    }
    insights.push({
      at: roundTime(timelineAt),
      duration: settings.durationSec,
      title: String(item.headline || '').slice(0, 64),
      body: item.body ? String(item.body).slice(0, 140) : undefined,
      anchor: item.anchor
    });
    process.stderr.write(`  ✓ ${timelineAt.toFixed(2)}s  ${item.headline}\n`);
  }

  // Sort by time, and ensure cards don't overlap (push back if needed)
  insights.sort((a, b) => a.at - b.at);
  for (let i = 1; i < insights.length; i += 1) {
    const prevEnd = insights[i - 1].at + insights[i - 1].duration;
    if (insights[i].at < prevEnd + 0.5) {
      insights[i].at = roundTime(prevEnd + 0.5);
    }
  }

  const output = {
    schemaVersion: 1,
    provider,
    model: modelLabel,
    insightCount: insights.length,
    insights: insights.map(({ anchor, ...rest }) => rest),
    debug: { proposed, settings }
  };

  await writeJson(insightsPath, output);
  await advanceRunState(runDir, RunState.ANALYZED);

  return {
    outputPath: insightsPath,
    insightCount: insights.length,
    insights: output.insights
  };
}
