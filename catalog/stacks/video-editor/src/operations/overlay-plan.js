import fs from 'fs/promises';
import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson
} from '../lib/files.js';
import { roundTime } from '../lib/format.js';

// Detect "stat moments" in a cluster — phrases like "77%", "70/30", "45-55 split", "70 30".
// These are the visual anchors for InsightCardLayer cards.
//
// Returns an array of { headline, position } where position is the char offset
// in the cluster text. We use only the first stat per cluster (others happen
// inside the same beat and don't deserve a separate card).
const STAT_PATTERNS = [
  /(\d{1,3})\s*%/,                              // "77%", "61 %"
  /(\d{1,3})\s*[/\-]\s*(\d{1,3})\s*(?:split)?/, // "70/30", "45-55", "45-55 split"
  /(\d{1,3})\s+(\d{1,3})\s+split/i              // "70 30 split"
];

function detectStat(text) {
  for (const pattern of STAT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    let headline;
    if (match[2] != null) {
      // Two-number stat → "70 / 30"
      headline = `${match[1]} / ${match[2]}`;
    } else {
      // Single percent → "77%"
      headline = `${match[1]}%`;
    }
    return { headline, raw: match[0] };
  }
  return null;
}

// CTA detection — last cluster(s) often contain "comment", "follow", "subscribe", "link in bio".
function isCtaCluster(text) {
  return /\b(comment|follow|subscribe|link in bio|dm me|sign up)\b/i.test(text);
}

// Build a draft section structure. Sections are spans of the timeline.
// Heuristic: each detected stat starts a new "finding" section. Everything
// before the first stat is "hook" (if very short) or "intro". Everything in
// the back third that contains "recap" or repeats stats quickly is "recap".
// Last CTA cluster is "cta".
function buildSections(clusters, statClusterIds) {
  const sections = [];
  const firstStat = statClusterIds[0];
  const lastStat = statClusterIds[statClusterIds.length - 1];

  // Hook: everything before the first stat
  if (firstStat != null && firstStat > 0) {
    const hookClusters = clusters.slice(0, firstStat);
    sections.push({
      id: 'hook',
      startSec: roundTime(hookClusters[0].start),
      endSec: roundTime(hookClusters[hookClusters.length - 1].end),
      label: '',
      notes: 'Hook / intro — typically no on-screen label'
    });
  }

  // One section per stat
  for (let i = 0; i < statClusterIds.length; i += 1) {
    const startIdx = statClusterIds[i];
    const endIdx = statClusterIds[i + 1] ? statClusterIds[i + 1] - 1 : clusters.length - 1;
    const section = clusters.slice(startIdx, endIdx + 1);
    sections.push({
      id: `finding-${i + 1}`,
      startSec: roundTime(section[0].start),
      endSec: roundTime(section[section.length - 1].end),
      label: `${i + 1} / ${statClusterIds.length} · TODO`,
      notes: `Auto-detected section ${i + 1}. Edit label for viewer-friendly phrasing.`
    });
  }

  // CTA: scan from the end for a cluster matching CTA patterns
  for (let i = clusters.length - 1; i >= 0 && i > lastStat; i -= 1) {
    if (isCtaCluster(clusters[i].text)) {
      // CTA found — split the last section at this cluster
      const ctaStart = clusters[i].start;
      const last = sections[sections.length - 1];
      if (last && last.endSec > ctaStart) {
        last.endSec = roundTime(ctaStart - 0.02);
      }
      sections.push({
        id: 'cta',
        startSec: roundTime(ctaStart),
        endSec: roundTime(clusters[clusters.length - 1].end),
        label: '',
        notes: 'Call to action — typically no on-screen label (card owns the screen)'
      });
      break;
    }
  }

  return sections;
}

// Map each detected stat to a card with timing aligned to when the number is said.
// Add ~0.3s lead so the card lands as the number drops.
function buildStatCards(clusters, statClusterIds) {
  return statClusterIds.map((idx, i) => {
    const cluster = clusters[idx];
    const stat = detectStat(cluster.text);
    return {
      id: `card-${i + 1}`,
      at: roundTime(cluster.start + 0.3),
      duration: 5.0,
      tag: `FINDING 0${i + 1}`,
      headline: stat.headline,
      body: 'TODO — one-line context for this stat'
    };
  });
}

// YAML serializer for our specific schema. Avoids adding a dep.
// Shape: { schemaVersion, projectSlug, sections: [...], statCards: [...] }
function emitYaml(plan) {
  const lines = [];
  lines.push('# Overlay plan — edit labels, tags, and bodies for viewer-friendly language.');
  lines.push('# Auto-generated from transcript-clusters.json. Empty label = no on-screen overlay.');
  lines.push('# Run `apply-overlay-plan <slug>` to sync into composition.json.');
  lines.push('');
  lines.push(`schemaVersion: ${plan.schemaVersion}`);
  lines.push(`projectSlug: ${plan.projectSlug}`);
  lines.push('');
  lines.push('sections:');
  for (const section of plan.sections) {
    lines.push(`  - id: ${section.id}`);
    lines.push(`    startSec: ${section.startSec}`);
    lines.push(`    endSec: ${section.endSec}`);
    lines.push(`    label: ${yamlString(section.label)}`);
    if (section.notes) {
      lines.push(`    notes: ${yamlString(section.notes)}`);
    }
  }
  lines.push('');
  lines.push('statCards:');
  for (const card of plan.statCards) {
    lines.push(`  - id: ${card.id}`);
    lines.push(`    at: ${card.at}`);
    lines.push(`    duration: ${card.duration}`);
    lines.push(`    tag: ${yamlString(card.tag)}`);
    lines.push(`    headline: ${yamlString(card.headline)}`);
    lines.push(`    body: ${yamlString(card.body)}`);
  }
  lines.push('');
  return lines.join('\n');
}

// Quote strings that need it. Plain strings without special chars stay unquoted
// for readability.
function yamlString(value) {
  if (value === '' || value == null) return '""';
  const s = String(value);
  if (/^[\w\d /·.()%-]+$/.test(s) && !/^\d/.test(s)) {
    return s; // safe unquoted
  }
  // Escape double quotes and wrap
  return `"${s.replace(/"/g, '\\"')}"`;
}

export async function overlayPlanRun(runDir) {
  const { project } = await loadProject(runDir);
  const clustersPath = artifactPath(runDir, project, 'transcriptClusters');
  if (!(await pathExists(clustersPath))) {
    throw new Error('Missing transcript-clusters.json. Run `cluster` first.');
  }
  const clustersDoc = await readJson(clustersPath);
  const clusters = clustersDoc.clusters || [];
  if (clusters.length === 0) {
    throw new Error('transcript-clusters.json has no clusters.');
  }

  // Find clusters that contain a stat as the first detected pattern.
  const statClusterIds = [];
  for (let i = 0; i < clusters.length; i += 1) {
    if (detectStat(clusters[i].text)) statClusterIds.push(i);
  }

  if (statClusterIds.length === 0) {
    process.stderr.write('No stat patterns detected. Plan will only have sections, no stat cards.\n');
  }

  // Deduplicate adjacent stats in the same cluster (we keep one per cluster).
  // Also collapse stats that appear in the recap (very close to each other near end).
  // Heuristic: if two stats are within 4 seconds of each other AND in the back third,
  // treat as recap and only keep the first.
  const totalDur = clusters[clusters.length - 1].end;
  const recapThreshold = totalDur * 0.7;
  const filtered = [];
  for (let i = 0; i < statClusterIds.length; i += 1) {
    const idx = statClusterIds[i];
    const startSec = clusters[idx].start;
    if (filtered.length === 0) {
      filtered.push(idx);
      continue;
    }
    const prevSec = clusters[filtered[filtered.length - 1]].start;
    if (startSec - prevSec < 4 && startSec > recapThreshold) continue;
    filtered.push(idx);
  }

  const sections = buildSections(clusters, filtered);
  const statCards = buildStatCards(clusters, filtered);

  const plan = {
    schemaVersion: 1,
    projectSlug: project.slug,
    sections,
    statCards
  };

  const planPath = path.join(runDir, 'overlay-plan.yaml');
  const yaml = emitYaml(plan);
  await fs.writeFile(planPath, yaml, 'utf8');

  return {
    outputPath: planPath,
    sectionCount: sections.length,
    statCardCount: statCards.length,
    statClusters: filtered.length,
    detectedStats: filtered.map((i) => detectStat(clusters[i].text).headline)
  };
}
