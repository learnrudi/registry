import path from 'path';
import { pathExists, readJson } from './files.js';

function normalizeCorrection(raw) {
  return {
    from: String(raw.from || '').trim(),
    to: String(raw.to || '').trim(),
    reason: raw.reason ? String(raw.reason) : null
  };
}

export function applyTranscriptCorrections(text, corrections) {
  return corrections.reduce((current, correction) => {
    if (!correction.from || !correction.to) {
      return current;
    }

    const escaped = correction.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startsWithWord = /^\w/.test(correction.from);
    const endsWithWord = /\w$/.test(correction.from);
    const pattern = new RegExp(
      `${startsWithWord ? '\\b' : ''}${escaped}${endsWithWord ? '\\b' : ''}`,
      'gi'
    );
    return current.replace(pattern, correction.to);
  }, String(text || ''));
}

export async function loadTranscriptCorrections(runDir, project) {
  const artifact = project.artifacts.transcriptCorrections;
  if (!artifact) {
    return {
      path: null,
      replacements: [],
      captionReplacements: [],
      requiredPhrases: []
    };
  }

  const correctionsPath = path.join(runDir, artifact);
  if (!(await pathExists(correctionsPath))) {
    return {
      path: artifact,
      replacements: [],
      captionReplacements: [],
      requiredPhrases: []
    };
  }

  const correctionsFile = await readJson(correctionsPath);
  return {
    path: artifact,
    replacements: (correctionsFile.replacements || [])
      .map(normalizeCorrection)
      .filter((correction) => correction.from && correction.to),
    captionReplacements: (correctionsFile.captionReplacements || [])
      .map(normalizeCorrection)
      .filter((correction) => correction.from && correction.to),
    requiredPhrases: (correctionsFile.requiredPhrases || [])
      .map((phrase) => String(phrase || '').trim())
      .filter(Boolean)
  };
}
