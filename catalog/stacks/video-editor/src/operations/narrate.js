import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { roundTime } from '../lib/format.js';

// Heuristic label from the sentence(s) immediately before a silent stretch.
// Returns a short imperative phrase the viewer sees during the speedup.
function inferLabel(precedingText) {
  const t = precedingText.toLowerCase();
  if (/\b(download|save|export|exporting|saving)\b/.test(t)) return 'Downloading';
  if (/\b(refin|adjust|tweak|change|edit|fix|update)\b/.test(t)) return 'Refining';
  if (/\b(generat|create|creating|making|build|design)\b/.test(t)) return 'Generating';
  if (/\b(render|processing|encod)\b/.test(t)) return 'Rendering';
  if (/\b(upload|sending|publishing|posting)\b/.test(t)) return 'Uploading';
  if (/\b(install|setup|configuring)\b/.test(t)) return 'Setting up';
  if (/\b(search|looking|finding)\b/.test(t)) return 'Searching';
  if (/\b(load|loading|opening)\b/.test(t)) return 'Loading';
  return 'Working';
}

export async function narrateRun(runDir) {
  const { project } = await loadProject(runDir);

  const silencePath = artifactPath(runDir, project, 'silence');
  const transcriptPath = artifactPath(runDir, project, 'transcriptSource');
  const narrationPath = artifactPath(runDir, project, 'narration');

  if (!(await pathExists(silencePath))) {
    throw new Error(`Missing silence artifact: ${silencePath}. Run \`silence\` first.`);
  }
  if (!(await pathExists(transcriptPath))) {
    throw new Error(`Missing transcript artifact: ${transcriptPath}. Run \`transcribe\` first.`);
  }

  const settings = { ...DEFAULT_SETTINGS.narrate, ...(project.settings.narrate || {}) };
  const silence = await readJson(silencePath);
  const transcript = await readJson(transcriptPath);
  const words = transcript.words || [];

  const labels = [];
  for (const gap of silence.silences || []) {
    if ((gap.end - gap.start) < settings.minSilenceSec) continue;

    const priorWords = words.filter((w) => w.end <= gap.start).slice(-settings.contextWords);
    const priorText = priorWords.map((w) => w.text).join(' ');
    const text = inferLabel(priorText);

    labels.push({
      at: roundTime(gap.start),
      duration: roundTime(gap.end - gap.start),
      text,
      position: settings.position,
      sourceContext: priorText
    });
  }

  const out = {
    schemaVersion: 1,
    settings,
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
