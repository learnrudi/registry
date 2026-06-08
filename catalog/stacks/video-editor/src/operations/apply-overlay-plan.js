import fs from 'fs/promises';
import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { roundTime } from '../lib/format.js';

// Minimal YAML reader for our specific overlay-plan shape.
// Schema is fixed: { schemaVersion, projectSlug, sections: [...], statCards: [...] }
// We don't need a full YAML parser — line-based works fine for this flat structure.
function parseOverlayPlanYaml(text) {
  const lines = text.split('\n');
  const plan = { schemaVersion: 1, projectSlug: '', sections: [], statCards: [] };

  let currentList = null; // 'sections' | 'statCards' | null
  let currentItem = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line === '' || line.startsWith('#')) continue;

    // Top-level scalar keys
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch && !line.startsWith(' ')) {
      const [, key, value] = topMatch;
      if (key === 'sections' || key === 'statCards') {
        currentList = key;
        currentItem = null;
        continue;
      }
      // Scalar top-level (schemaVersion, projectSlug)
      plan[key] = coerce(value);
      currentList = null;
      currentItem = null;
      continue;
    }

    // List item start: "  - id: foo"
    const itemStart = line.match(/^\s+-\s+(\w+):\s*(.*)$/);
    if (itemStart) {
      const [, key, value] = itemStart;
      if (!currentList) {
        throw new Error(`List item outside any list: ${line}`);
      }
      currentItem = { [key]: coerce(value) };
      plan[currentList].push(currentItem);
      continue;
    }

    // List item continuation: "    key: value"
    const cont = line.match(/^\s+(\w+):\s*(.*)$/);
    if (cont && currentItem) {
      const [, key, value] = cont;
      currentItem[key] = coerce(value);
      continue;
    }
  }

  return plan;
}

function coerce(rawValue) {
  if (rawValue === '' || rawValue === '""') return '';
  // Quoted string
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1).replace(/\\"/g, '"');
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) return Number(rawValue);
  // Boolean
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  // Plain string
  return rawValue;
}

export async function applyOverlayPlanRun(runDir) {
  const { project } = await loadProject(runDir);
  const planPath = path.join(runDir, 'overlay-plan.yaml');
  const compositionPath = artifactPath(runDir, project, 'composition');

  if (!(await pathExists(planPath))) {
    throw new Error('Missing overlay-plan.yaml. Run `overlay-plan` first.');
  }
  if (!(await pathExists(compositionPath))) {
    throw new Error('Missing composition.json. Run `plan` first.');
  }

  const planText = await fs.readFile(planPath, 'utf8');
  const plan = parseOverlayPlanYaml(planText);
  const composition = await readJson(compositionPath);

  // Sections → chapters. Skip sections with empty label.
  const chapters = plan.sections
    .filter((s) => s.label && String(s.label).trim() !== '')
    .map((s) => ({
      at: roundTime(Number(s.startSec)),
      title: String(s.label)
    }));

  // StatCards → insights. Tag becomes part of the insight payload (renderer reads it).
  const insights = plan.statCards.map((c) => {
    const out = {
      at: roundTime(Number(c.at)),
      duration: Number(c.duration),
      title: String(c.headline)
    };
    if (c.body && String(c.body).trim() !== '' && String(c.body).trim() !== 'TODO') {
      out.body = String(c.body);
    }
    if (c.tag && String(c.tag).trim() !== '') {
      out.tag = String(c.tag);
    }
    return out;
  });

  // Preserve everything else in composition.json; only replace chapters + insights.
  const next = {
    ...composition,
    timeline: {
      ...composition.timeline,
      chapters,
      insights
    }
  };

  await writeJson(compositionPath, next);

  return {
    outputPath: compositionPath,
    planPath,
    chapterCount: chapters.length,
    insightCount: insights.length,
    sectionsSkippedEmpty: plan.sections.length - chapters.length
  };
}
