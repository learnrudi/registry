import path from 'path';
import fs from 'fs/promises';
import {
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { roundTime } from '../lib/format.js';

function relativeArtifactPath(project, artifactName, fallbackPath) {
  return project.artifacts?.[artifactName] || fallbackPath;
}

async function readOptionalJson(runDir, relativePath) {
  if (!relativePath) {
    return null;
  }

  const fullPath = path.join(runDir, relativePath);
  if (!(await pathExists(fullPath))) {
    return null;
  }

  return readJson(fullPath);
}

function basenameWithoutExtension(filePath) {
  return path.basename(filePath || '', path.extname(filePath || ''));
}

function resolveRenderName(outputTranscript, qaReport, renderName) {
  if (renderName) {
    return renderName;
  }

  if (outputTranscript?.media?.render) {
    return outputTranscript.media.render;
  }

  if (qaReport?.render) {
    return path.basename(qaReport.render);
  }

  return null;
}

function durationOfRanges(ranges) {
  return roundTime((ranges || []).reduce((sum, range) => (
    sum + Math.max(0, range.end - range.start)
  ), 0));
}

function buildRemovedRanges(keepRanges, sourceDuration) {
  const ranges = [];
  let cursor = 0;

  for (const keepRange of keepRanges || []) {
    if (keepRange.start > cursor) {
      ranges.push({
        start: roundTime(cursor),
        end: roundTime(keepRange.start),
        duration: roundTime(keepRange.start - cursor)
      });
    }
    cursor = Math.max(cursor, keepRange.end);
  }

  if (sourceDuration > cursor) {
    ranges.push({
      start: roundTime(cursor),
      end: roundTime(sourceDuration),
      duration: roundTime(sourceDuration - cursor)
    });
  }

  return ranges;
}

function formatSeconds(value) {
  return `${roundTime(value)}s`;
}

function formatRange(range) {
  return `${formatSeconds(range.start)}-${formatSeconds(range.end)} (${formatSeconds(range.duration)})`;
}

function wordList(words, max = 12) {
  return (words || [])
    .slice(0, max)
    .map((word) => word.text)
    .join(' ');
}

function addFinding(findings, risk, type, message, evidence, recommendation) {
  findings.push({
    risk,
    type,
    message,
    evidence,
    recommendation
  });
}

function buildFindings({ audit, silence, transcriptComparison, outputTranscript, plannedKeepRanges }) {
  const findings = [];
  const summary = audit?.summary || {};
  const silenceStats = silence?.stats || {};

  if (summary.densityRisk === 'high') {
    addFinding(
      findings,
      summary.plannedDensityRisk === 'high' ? 'high' : 'info',
      'raw-silence-density',
      'Raw silence detection is too aggressive for direct planning.',
      `Raw silence produced ${summary.spliceCount} splices over ${formatSeconds(summary.outputDuration)}, ${summary.cutsPerMinute} cuts/minute.`,
      'Keep silence as a candidate signal; plan from transcript clusters or audited ranges.'
    );
  }

  if (silenceStats.removedPercent >= 60) {
    addFinding(
      findings,
      summary.plannedDensityRisk === 'high' ? 'medium' : 'info',
      'raw-silence-removal',
      'Raw silence would remove most of the source.',
      `Silence analysis would remove ${silenceStats.removedPercent}% of the clip.`,
      'Use phrase clusters first, then selectively remove only reviewed gaps.'
    );
  }

  if (summary.plannedDensityRisk === 'high') {
    addFinding(
      findings,
      'high',
      'planned-cut-density',
      'The planned cut is structurally too dense.',
      `Planned timeline has ${summary.plannedSpliceCount} splices over ${formatSeconds(summary.plannedOutputDuration)}, ${summary.plannedCutsPerMinute} cuts/minute.`,
      'Merge nearby transcript clusters or increase phrase padding before adding captions/effects.'
    );
  } else if (plannedKeepRanges.length > 0) {
    addFinding(
      findings,
      'info',
      'planned-cut-density',
      'The planned cut density is inside the talking-head ceiling.',
      `Planned timeline has ${summary.plannedSpliceCount} splices over ${formatSeconds(summary.plannedOutputDuration)}, ${summary.plannedCutsPerMinute} cuts/minute.`,
      'Use human watch/listen review to judge pacing and breath room.'
    );
  }

  if (transcriptComparison?.available) {
    const missingRequired = (transcriptComparison.requiredPhraseChecks || [])
      .filter((check) => check.expectedContains && !check.outputContains);

    if (missingRequired.length > 0) {
      addFinding(
        findings,
        'high',
        'required-phrases',
        'The rendered transcript is missing required phrase(s).',
        missingRequired.map((check) => check.phrase).join(', '),
        'Do not proceed to captions/effects; fix transcript corrections, padding, or keep ranges and re-render.'
      );
    }

    if (transcriptComparison.missingWordCount > 0) {
      const risk = transcriptComparison.risk === 'high' ? 'high' : 'medium';
      addFinding(
        findings,
        risk,
        'rendered-transcript-diff',
        'The rendered transcript differs from the expected source transcript.',
        `${transcriptComparison.missingWordCount}/${transcriptComparison.expectedWordCount} expected words differ. Sample: ${wordList(transcriptComparison.missingWordsSample)}.`,
        'Listen to the listed phrases. If the edit sounds good, add transcript corrections or use a stronger model before treating this as a cut defect.'
      );
    }

    if (transcriptComparison.outputWordsPerSecond > transcriptComparison.maxWordsPerSecond) {
      addFinding(
        findings,
        'high',
        'output-word-density',
        'Rendered speech density is above the configured ceiling.',
        `${transcriptComparison.outputWordsPerSecond} words/sec exceeds ${transcriptComparison.maxWordsPerSecond}.`,
        'Increase cluster padding or merge adjacent clusters to restore breath room.'
      );
    }
  } else {
    addFinding(
      findings,
      'medium',
      'rendered-transcript-missing',
      'No rendered-output transcript is available.',
      'The review cannot compare source and rendered speech.',
      'Transcribe the rendered output before trusting this review.'
    );
  }

  if (!outputTranscript?.available && !outputTranscript?.text) {
    addFinding(
      findings,
      'info',
      'output-transcript-context',
      'Rendered transcript text is unavailable to the review artifact.',
      'Only audit summary data could be used.',
      'Run the render/transcribe loop so the review can include output wording.'
    );
  }

  return findings;
}

function summarizeArtifacts({ project, probe, silence, clusters, audit, composition, qaReport, outputTranscript, renderName }) {
  const sourceDuration = audit?.summary?.sourceDuration ||
    silence?.duration ||
    probe?.summary?.duration ||
    0;
  const plannedKeepRanges = composition?.timeline?.keepRanges || clusters?.keepRanges || [];
  const removedRanges = buildRemovedRanges(plannedKeepRanges, sourceDuration);

  return {
    slug: project.slug,
    render: renderName,
    source: {
      duration: roundTime(sourceDuration),
      width: probe?.summary?.video?.width || qaReport?.summary?.video?.width || null,
      height: probe?.summary?.video?.height || qaReport?.summary?.video?.height || null,
      fps: project.settings?.fps || probe?.summary?.video?.rFrameRate || null
    },
    transcript: {
      sourceWords: audit?.transcriptComparison?.expectedWordCount || null,
      outputWords: audit?.transcriptComparison?.outputWordCount || outputTranscript?.stats?.wordCount || null,
      outputWordsPerSecond: audit?.transcriptComparison?.outputWordsPerSecond || outputTranscript?.stats?.wordsPerSecond || null,
      risk: audit?.summary?.transcriptComparisonRisk || 'unknown'
    },
    cut: {
      planningSurface: clusters ? 'transcript-clusters' : audit ? 'cut-audit' : 'unknown',
      keepRangeCount: plannedKeepRanges.length,
      keepDuration: durationOfRanges(plannedKeepRanges),
      removedDuration: durationOfRanges(removedRanges),
      removedRanges,
      plannedCutsPerMinute: audit?.summary?.plannedCutsPerMinute ?? null,
      plannedDensityRisk: audit?.summary?.plannedDensityRisk || 'unknown',
      rawSilenceCutsPerMinute: audit?.summary?.cutsPerMinute ?? null,
      rawSilenceDensityRisk: audit?.summary?.densityRisk || 'unknown'
    },
    qa: qaReport ? {
      duration: qaReport.summary?.duration || null,
      video: qaReport.summary?.video || null,
      audio: qaReport.summary?.audio || null,
      frames: qaReport.frames || []
    } : null
  };
}

function buildNextStep(findings) {
  const high = findings.filter((finding) => finding.risk === 'high');

  if (high.some((finding) => finding.type === 'required-phrases')) {
    return 'Fix required phrase preservation before adding captions or effects.';
  }

  if (high.some((finding) => finding.type === 'rendered-transcript-diff')) {
    return 'Watch/listen to the flagged phrases, then either add corrections or tune cluster padding and re-render.';
  }

  if (high.some((finding) => finding.type === 'planned-cut-density')) {
    return 'Merge clusters or increase padding to reduce cut density before proceeding.';
  }

  return 'Do a human watch/listen pass; if pacing feels good, this rough cut is ready for captions/effects.';
}

function renderMarkdown(review) {
  const lines = [
    '# Agent Review',
    '',
    `Run: \`${review.run}\``,
    `Render: \`${review.render || 'unknown'}\``,
    `Overall risk: \`${review.overallRisk}\``,
    '',
    '## Summary',
    '',
    `- Source: ${formatSeconds(review.summary.source.duration)}, ${review.summary.source.width || '?'}x${review.summary.source.height || '?'}, ${review.summary.source.fps || '?'}fps.`,
    `- Planned cut: ${review.summary.cut.keepRangeCount} keep ranges, ${formatSeconds(review.summary.cut.keepDuration)} kept, ${formatSeconds(review.summary.cut.removedDuration)} removed.`,
    `- Planned density: ${review.summary.cut.plannedCutsPerMinute ?? 'unknown'} cuts/minute, risk \`${review.summary.cut.plannedDensityRisk}\`.`,
    `- Raw silence density: ${review.summary.cut.rawSilenceCutsPerMinute ?? 'unknown'} cuts/minute, risk \`${review.summary.cut.rawSilenceDensityRisk}\`.`,
    `- Transcript comparison risk: \`${review.summary.transcript.risk}\`.`,
    '',
    '## Removed Ranges',
    ''
  ];

  if (review.summary.cut.removedRanges.length === 0) {
    lines.push('- None.');
  } else {
    for (const range of review.summary.cut.removedRanges) {
      lines.push(`- ${formatRange(range)}`);
    }
  }

  lines.push('', '## Findings', '');

  for (const finding of review.findings) {
    lines.push(`- \`${finding.risk}\` ${finding.message}`);
    lines.push(`  Evidence: ${finding.evidence}`);
    lines.push(`  Next: ${finding.recommendation}`);
  }

  lines.push('', '## Next Step', '', review.nextStep, '');
  return `${lines.join('\n')}\n`;
}

function highestRisk(findings) {
  if (findings.some((finding) => finding.risk === 'high')) return 'high';
  if (findings.some((finding) => finding.risk === 'medium')) return 'medium';
  if (findings.some((finding) => finding.risk === 'info')) return 'info';
  return 'low';
}

export async function reviewRun(runDir, renderNameArg = null) {
  const { project } = await loadProject(runDir);
  const probe = await readOptionalJson(runDir, project.artifacts?.probe);
  const silence = await readOptionalJson(runDir, project.artifacts?.silence);
  const clusters = await readOptionalJson(runDir, project.artifacts?.transcriptClusters);
  const audit = await readOptionalJson(runDir, project.artifacts?.cutAudit);
  const composition = await readOptionalJson(runDir, project.artifacts?.composition);
  const outputTranscript = await readOptionalJson(runDir, project.artifacts?.transcriptOutput);
  const qaReport = await readOptionalJson(runDir, path.join(project.artifacts?.qa || 'qa', 'report.json'));
  const renderName = resolveRenderName(outputTranscript, qaReport, renderNameArg);
  const plannedKeepRanges = composition?.timeline?.keepRanges || clusters?.keepRanges || [];
  const transcriptComparison = audit?.transcriptComparison || null;
  const summary = summarizeArtifacts({
    project,
    probe,
    silence,
    clusters,
    audit,
    composition,
    qaReport,
    outputTranscript,
    renderName
  });
  const findings = buildFindings({
    audit,
    silence,
    transcriptComparison,
    outputTranscript,
    plannedKeepRanges
  });
  const review = {
    schemaVersion: 1,
    run: project.slug,
    render: renderName,
    overallRisk: highestRisk(findings),
    summary,
    findings,
    nextStep: buildNextStep(findings)
  };
  const reviewJsonPath = path.join(
    runDir,
    relativeArtifactPath(project, 'review', 'review.json')
  );
  const reviewMarkdownPath = path.join(
    runDir,
    relativeArtifactPath(project, 'reviewMarkdown', 'review.md')
  );

  await writeJson(reviewJsonPath, review);
  await fs.mkdir(path.dirname(reviewMarkdownPath), { recursive: true });
  await fs.writeFile(reviewMarkdownPath, renderMarkdown(review), 'utf8');
  await advanceRunState(runDir, RunState.REVIEWED);

  return {
    reviewPath: reviewJsonPath,
    markdownPath: reviewMarkdownPath,
    review
  };
}
