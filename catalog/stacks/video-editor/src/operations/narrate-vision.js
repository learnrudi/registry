import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { runCommand } from '../lib/process.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { roundTime } from '../lib/format.js';

const PROMPT = `This is one frame from a vertical screen-recording video.

In 1-2 words (max 16 characters), label what is happening on screen. This text overlays the video during a fast-forward — it must be short to fit.

Good examples: "Generating", "Refining", "Downloading", "Browsing", "Picking template", "Building hook".
Avoid: full sentences, articles, modifiers.

Respond with just the label — no quotes, no punctuation, no explanation.`;

async function extractFrameAtTime(workingPath, timeSec) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'narrate-vision-'));
  const framePath = path.join(tmpDir, 'frame.jpg');
  await runCommand('ffmpeg', [
    '-hide_banner', '-y',
    '-ss', String(timeSec),
    '-i', workingPath,
    '-frames:v', '1',
    '-update', '1',
    '-q:v', '5',
    framePath
  ]);
  const data = await fs.readFile(framePath);
  await fs.rm(tmpDir, { recursive: true, force: true });
  return data.toString('base64');
}

async function describeFrame(host, model, base64Jpeg, priorText) {
  const prompt = priorText
    ? `${PROMPT}\n\nThe presenter just said: "${priorText}"`
    : PROMPT;

  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [base64Jpeg],
      stream: false,
      options: { num_predict: 24, temperature: 0.2 }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) {
      throw new Error(
        `Ollama returned 404. The model "${model}" may not be pulled. ` +
        `Run: ollama pull ${model}`
      );
    }
    throw new Error(`Ollama ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.response || 'Working').trim().replace(/^["'.,]|["'.,]$/g, '');
}

export async function narrateVisionRun(runDir) {
  const { project } = await loadProject(runDir);

  const silencePath = artifactPath(runDir, project, 'silence');
  const transcriptPath = artifactPath(runDir, project, 'transcriptSource');
  const workingPath = artifactPath(runDir, project, 'working');
  const narrationPath = artifactPath(runDir, project, 'narration');

  if (!(await pathExists(silencePath))) throw new Error('Run `silence` first.');
  if (!(await pathExists(workingPath))) throw new Error('Run `normalize` first.');

  const settings = { ...DEFAULT_SETTINGS.narrateVision, ...(project.settings.narrateVision || {}) };
  const silence = await readJson(silencePath);
  const transcript = (await pathExists(transcriptPath)) ? await readJson(transcriptPath) : { words: [] };

  const candidates = (silence.silences || []).filter((s) => (s.end - s.start) >= settings.minSilenceSec);
  if (candidates.length > settings.maxLabels) {
    candidates.length = settings.maxLabels;
  }

  const labels = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const gap = candidates[i];
    const midT = (gap.start + gap.end) / 2;
    const priorWords = transcript.words
      .filter((w) => w.end <= gap.start)
      .slice(-12)
      .map((w) => w.text)
      .join(' ');

    process.stderr.write(`  [${i+1}/${candidates.length}] gap ${gap.start.toFixed(1)}-${gap.end.toFixed(1)}s … `);
    const base64 = await extractFrameAtTime(workingPath, midT);
    const text = await describeFrame(settings.host, settings.model, base64, priorWords);
    process.stderr.write(`${text}\n`);

    labels.push({
      at: roundTime(gap.start),
      duration: roundTime(gap.end - gap.start),
      text,
      position: settings.position,
      sourceContext: priorWords,
      frameSampledAt: roundTime(midT)
    });
  }

  const out = {
    schemaVersion: 1,
    source: 'vision',
    settings: { minSilenceSec: settings.minSilenceSec, model: settings.model, position: settings.position },
    labelCount: labels.length,
    labels
  };

  await writeJson(narrationPath, out);
  await advanceRunState(runDir, RunState.ANALYZED);

  return {
    outputPath: narrationPath,
    labelCount: labels.length,
    labels: labels.map((l) => ({ at: l.at, duration: l.duration, text: l.text }))
  };
}
