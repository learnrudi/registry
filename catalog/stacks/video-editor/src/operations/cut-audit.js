import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeJson
} from '../lib/files.js';
import {
  applyTranscriptCorrections,
  loadTranscriptCorrections
} from '../lib/transcript-corrections.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { advanceRunState, RunState } from '../lib/states.js';
import { flattenTranscriptWords } from '../lib/transcript.js';
import { roundTime } from '../lib/format.js';

function rangeDuration(range) {
  return roundTime(Math.max(0, range.end - range.start));
}

function overlapDuration(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function normalizeRawToken(text) {
  const token = String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  return token.replace(/^(\d+)(st|nd|rd|th)$/u, '$1');
}

function expandToken(token) {
  if (token === 'gonna') return ['going', 'to'];
  if (token === 'wanna') return ['want', 'to'];
  if (token === 'gotta') return ['got', 'to'];
  return [token];
}

function tokenizeText(text) {
  return String(text || '')
    .split(/\s+/u)
    .flatMap((part) => expandToken(normalizeRawToken(part)))
    .filter(Boolean);
}

function comparableText(text, corrections) {
  return tokenizeText(applyTranscriptCorrections(text, corrections)).join(' ');
}

function extractTranscriptWords(transcript) {
  return flattenTranscriptWords(transcript, {
    round: true,
    includeProbability: false,
    allowEmptyText: true
  });
}

async function loadTranscriptArtifact(runDir, project, artifactName, fallbackArtifactName = null) {
  const transcriptArtifact = project.artifacts[artifactName] || project.artifacts[fallbackArtifactName];
  if (!transcriptArtifact) {
    return {
      available: false,
      path: null,
      words: []
    };
  }

  const transcriptPath = path.join(runDir, transcriptArtifact);
  if (!(await pathExists(transcriptPath))) {
    return {
      available: false,
      path: transcriptArtifact,
      words: []
    };
  }

  const transcript = await readJson(transcriptPath);
  const words = extractTranscriptWords(transcript);
  return {
    available: true,
    path: transcriptArtifact,
    text: transcript.text || words.map((word) => word.text).join(' '),
    stats: transcript.stats || {},
    words
  };
}

function findLastWordBefore(words, time) {
  let found = null;
  for (const word of words) {
    if (word.end <= time) {
      found = word;
      continue;
    }
    break;
  }
  return found;
}

function findNextWordAfter(words, time) {
  return words.find((word) => word.start >= time) || null;
}

function findWordsOverlapping(words, start, end) {
  return words.filter((word) => overlapDuration(start, end, word.start, word.end) > 0);
}

function wordSnapshot(word) {
  if (!word) {
    return null;
  }

  return {
    text: word.text,
    start: word.start,
    end: word.end
  };
}

function riskRank(risk) {
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  if (risk === 'low') return 1;
  return 0;
}

function combineRisk(...risks) {
  return risks.reduce((highest, risk) => (
    riskRank(risk) > riskRank(highest) ? risk : highest
  ), 'unknown');
}

function wordMidpoint(word) {
  return (word.start + word.end) / 2;
}

function isTimeInRanges(time, ranges) {
  return ranges.some((range) => time >= range.start && time <= range.end);
}

function wordsInRanges(words, ranges) {
  return words.filter((word) => isTimeInRanges(wordMidpoint(word), ranges));
}

function wordsInWindow(words, start, end) {
  return words.filter((word) => word.end >= start && word.start <= end);
}

function buildOutputFlow(outputWords, outputSec, settings) {
  if (!outputWords || outputWords.length === 0) {
    return {
      available: false,
      risk: 'unknown',
      reasons: []
    };
  }

  const windowStart = Math.max(0, outputSec - settings.spliceReviewWindowSec);
  const windowEnd = outputSec + settings.spliceReviewWindowSec;
  const windowDuration = Math.max(0.001, windowEnd - windowStart);
  const windowWords = wordsInWindow(outputWords, windowStart, windowEnd);
  const lastBefore = findLastWordBefore(outputWords, outputSec);
  const nextAfter = findNextWordAfter(outputWords, outputSec);
  const wordGapSec = lastBefore && nextAfter
    ? roundTime(nextAfter.start - lastBefore.end)
    : null;
  const wordsPerSecond = roundTime(windowWords.length / windowDuration);
  const reasons = [];

  if (wordsPerSecond > settings.maxWordsPerSecond) {
    reasons.push('output transcript word density is above max words/second');
  }

  if (wordGapSec !== null && wordGapSec < settings.minOutputWordGapSec) {
    reasons.push('output transcript has too little word gap across splice');
  }

  return {
    available: true,
    risk: reasons.length > 0 ? 'high' : 'low',
    window: {
      start: roundTime(windowStart),
      end: roundTime(windowEnd),
      wordCount: windowWords.length,
      wordsPerSecond,
      words: windowWords.map(wordSnapshot)
    },
    acrossSplice: {
      lastBefore: wordSnapshot(lastBefore),
      nextAfter: wordSnapshot(nextAfter),
      wordGapSec
    },
    reasons
  };
}

function buildTokenSequence(words, corrections) {
  return words.flatMap((word, wordIndex) => (
    tokenizeText(applyTranscriptCorrections(word.text, corrections)).map((token) => ({
      token,
      wordIndex,
      word
    }))
  ));
}

function buildWordDiff(expectedWords, outputWords, corrections) {
  const expectedSequence = buildTokenSequence(expectedWords, corrections);
  const outputSequence = buildTokenSequence(outputWords, corrections);
  const expectedTokens = expectedSequence.map((entry) => entry.token);
  const outputTokens = outputSequence.map((entry) => entry.token);
  const expectedCount = expectedTokens.length;
  const outputCount = outputTokens.length;
  const dp = Array.from({ length: expectedCount + 1 }, () => new Uint32Array(outputCount + 1));

  for (let i = expectedCount - 1; i >= 0; i -= 1) {
    for (let j = outputCount - 1; j >= 0; j -= 1) {
      dp[i][j] = expectedTokens[i] && expectedTokens[i] === outputTokens[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matchedExpected = new Set();
  const matchedOutput = new Set();
  const matchedExpectedWords = new Set();
  const matchedOutputWords = new Set();
  let i = 0;
  let j = 0;

  while (i < expectedCount && j < outputCount) {
    if (expectedTokens[i] && expectedTokens[i] === outputTokens[j]) {
      matchedExpected.add(i);
      matchedOutput.add(j);
      matchedExpectedWords.add(expectedSequence[i].wordIndex);
      matchedOutputWords.add(outputSequence[j].wordIndex);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return {
    matchedExpected,
    matchedOutput,
    matchedExpectedWords,
    matchedOutputWords,
    expectedTokenCount: expectedCount,
    outputTokenCount: outputCount
  };
}

function buildRequiredPhraseChecks(sourceTranscript, outputTranscript, correctionsDocument) {
  const requiredPhrases = correctionsDocument.requiredPhrases;
  const expectedComparable = comparableText(sourceTranscript.text, correctionsDocument.replacements);
  const outputComparable = comparableText(outputTranscript.text, correctionsDocument.replacements);

  return requiredPhrases.map((phrase) => {
    const phraseComparable = comparableText(phrase, correctionsDocument.replacements);
    return {
      phrase,
      expectedContains: expectedComparable.includes(phraseComparable),
      outputContains: outputComparable.includes(phraseComparable)
    };
  });
}

function buildTranscriptComparison(
  sourceTranscript,
  outputTranscript,
  keepRanges,
  outputDuration,
  settings,
  correctionsDocument
) {
  if (!sourceTranscript.available || !outputTranscript.available) {
    return {
      available: false,
      reason: !sourceTranscript.available
        ? 'source transcript unavailable'
        : 'output transcript unavailable'
    };
  }

  const expectedWords = wordsInRanges(sourceTranscript.words, keepRanges);
  const outputWords = outputTranscript.words;
  const diff = buildWordDiff(expectedWords, outputWords, correctionsDocument.replacements);
  const missingWords = expectedWords.filter((_, index) => !diff.matchedExpectedWords.has(index));
  const extraWords = outputWords.filter((_, index) => !diff.matchedOutputWords.has(index));
  const requiredPhraseChecks = buildRequiredPhraseChecks(sourceTranscript, outputTranscript, correctionsDocument);
  const missingRequiredPhrases = requiredPhraseChecks.filter((check) => (
    check.expectedContains && !check.outputContains
  ));
  const renderedDuration = outputTranscript.stats.duration || outputDuration;
  const outputWordsPerSecond = renderedDuration > 0 ? outputWords.length / renderedDuration : 0;
  const missingPercent = expectedWords.length > 0
    ? (missingWords.length / expectedWords.length) * 100
    : 0;
  const reasons = [];

  if (missingWords.length > 0) {
    reasons.push('rendered transcript differs from expected corrected source tokens');
  }

  if (missingRequiredPhrases.length > 0) {
    reasons.push('rendered transcript is missing required phrase(s)');
  }

  if (outputWordsPerSecond > settings.maxWordsPerSecond) {
    reasons.push('rendered transcript exceeds max words/second');
  }

  const risk = missingRequiredPhrases.length > 0 ||
    missingPercent > settings.maxMissingWordPercent ||
    outputWordsPerSecond > settings.maxWordsPerSecond
    ? 'high'
    : reasons.length > 0 ? 'medium' : 'low';

  return {
    available: true,
    risk,
    reasons,
    expectedWordCount: expectedWords.length,
    outputWordCount: outputWords.length,
    expectedTokenCount: diff.expectedTokenCount,
    outputTokenCount: diff.outputTokenCount,
    matchedTokenCount: diff.matchedExpected.size,
    matchedWordCount: diff.matchedExpectedWords.size,
    missingWordCount: missingWords.length,
    extraWordCount: extraWords.length,
    missingPercent: roundTime(missingPercent),
    maxMissingWordPercent: settings.maxMissingWordPercent,
    outputWordsPerSecond: roundTime(outputWordsPerSecond),
    maxWordsPerSecond: settings.maxWordsPerSecond,
    corrections: {
      path: correctionsDocument.path,
      replacementCount: correctionsDocument.replacements.length,
      requiredPhraseCount: correctionsDocument.requiredPhrases.length
    },
    requiredPhraseChecks,
    missingWordsSample: missingWords.slice(0, 25).map(wordSnapshot),
    extraWordsSample: extraWords.slice(0, 25).map(wordSnapshot),
    outputTextPreview: applyTranscriptCorrections(
      outputTranscript.text || outputWords.map((word) => word.text).join(' '),
      correctionsDocument.replacements
    ).slice(0, 800)
  };
}

function summarizeDensity(keepRanges, maxCutsPerMinute) {
  const outputDuration = keepRanges.reduce((sum, range) => sum + rangeDuration(range), 0);
  const spliceCount = Math.max(0, keepRanges.length - 1);
  const cutsPerMinute = outputDuration > 0 ? spliceCount / (outputDuration / 60) : 0;
  const densityRisk = cutsPerMinute > maxCutsPerMinute
    ? 'high'
    : cutsPerMinute > maxCutsPerMinute * 0.75 ? 'medium' : 'low';

  return {
    outputDuration: roundTime(outputDuration),
    keepRangeCount: keepRanges.length,
    spliceCount,
    cutsPerMinute: roundTime(cutsPerMinute),
    densityRisk
  };
}

function classifySplice({
  leftEdgeWord,
  rightEdgeWord,
  removedWords,
  tailPaddingSec,
  leadPaddingSec,
  settings,
  transcriptAvailable
}) {
  const reasons = [];

  if (!transcriptAvailable) {
    return {
      risk: 'unknown',
      reasons: ['transcript unavailable; word-boundary checks skipped']
    };
  }

  if (leftEdgeWord) {
    reasons.push('left cut edge lands inside a word');
  }

  if (rightEdgeWord) {
    reasons.push('right cut edge lands inside a word');
  }

  if (removedWords.length > 0) {
    reasons.push('removed gap overlaps transcript words');
  }

  if (tailPaddingSec !== null && tailPaddingSec < settings.minimumWordPaddingSec) {
    reasons.push('tail padding below minimum word padding');
  } else if (tailPaddingSec !== null && tailPaddingSec < settings.targetWordPaddingSec) {
    reasons.push('tail padding below target word padding');
  }

  if (leadPaddingSec !== null && leadPaddingSec < settings.minimumWordPaddingSec) {
    reasons.push('lead padding below minimum word padding');
  } else if (leadPaddingSec !== null && leadPaddingSec < settings.targetWordPaddingSec) {
    reasons.push('lead padding below target word padding');
  }

  const highRisk = Boolean(leftEdgeWord || rightEdgeWord || removedWords.length > 0) ||
    (tailPaddingSec !== null && tailPaddingSec < settings.minimumWordPaddingSec) ||
    (leadPaddingSec !== null && leadPaddingSec < settings.minimumWordPaddingSec);

  if (highRisk) {
    return { risk: 'high', reasons };
  }

  if (reasons.length > 0) {
    return { risk: 'medium', reasons };
  }

  return { risk: 'low', reasons: [] };
}

function buildResolution({
  risk,
  leftKeep,
  rightKeep,
  lastWordBefore,
  nextWordAfter,
  leftEdgeWord,
  rightEdgeWord,
  removedWords,
  settings,
  transcriptAvailable
}) {
  if (!transcriptAvailable) {
    return {
      action: 'defer',
      reason: 'transcript required before adjust/shorten/skip resolution',
      order: settings.resolutionOrder
    };
  }

  if (risk === 'low') {
    return {
      action: 'keep',
      reason: 'cut already satisfies transcript padding checks',
      order: settings.resolutionOrder
    };
  }

  if (removedWords.length > 0) {
    return {
      action: 'skip',
      reason: 'removed gap overlaps transcript words; keep the full phrase instead of cutting spoken content',
      order: settings.resolutionOrder,
      removedWords: removedWords.map(wordSnapshot)
    };
  }

  const leftAnchor = leftEdgeWord || lastWordBefore;
  const rightAnchor = rightEdgeWord || nextWordAfter;
  const targetLeftEnd = leftAnchor
    ? Math.max(leftKeep.end, leftAnchor.end + settings.targetWordPaddingSec)
    : leftKeep.end;
  const targetRightStart = rightAnchor
    ? Math.min(rightKeep.start, rightAnchor.start - settings.targetWordPaddingSec)
    : rightKeep.start;
  const targetGapDuration = targetRightStart - targetLeftEnd;
  const hasWordBoundaryFailure = Boolean(leftEdgeWord || rightEdgeWord || removedWords.length > 0);

  if (targetGapDuration >= settings.minimumCutDurationSec) {
    return {
      action: hasWordBoundaryFailure ? 'adjust' : 'shorten',
      reason: hasWordBoundaryFailure
        ? 'moved cut edges to transcript-safe word boundaries plus target padding'
        : 'shortened removed pause to preserve target word padding',
      order: settings.resolutionOrder,
      resolvedGap: {
        start: roundTime(targetLeftEnd),
        end: roundTime(targetRightStart),
        duration: roundTime(targetGapDuration)
      },
      edgeChanges: {
        leftEndDeltaSec: roundTime(targetLeftEnd - leftKeep.end),
        rightStartDeltaSec: roundTime(targetRightStart - rightKeep.start)
      }
    };
  }

  const minimumLeftEnd = leftAnchor
    ? Math.max(leftKeep.end, leftAnchor.end + settings.minimumWordPaddingSec)
    : leftKeep.end;
  const minimumRightStart = rightAnchor
    ? Math.min(rightKeep.start, rightAnchor.start - settings.minimumWordPaddingSec)
    : rightKeep.start;
  const minimumGapDuration = minimumRightStart - minimumLeftEnd;

  if (minimumGapDuration >= settings.minimumCutDurationSec) {
    return {
      action: 'shorten',
      reason: 'target padding would remove the cut; shortened to minimum safe padding',
      order: settings.resolutionOrder,
      resolvedGap: {
        start: roundTime(minimumLeftEnd),
        end: roundTime(minimumRightStart),
        duration: roundTime(minimumGapDuration)
      },
      edgeChanges: {
        leftEndDeltaSec: roundTime(minimumLeftEnd - leftKeep.end),
        rightStartDeltaSec: roundTime(minimumRightStart - rightKeep.start)
      }
    };
  }

  return {
    action: 'skip',
    reason: 'no transcript-safe cut remains after required padding',
    order: settings.resolutionOrder
  };
}

function applyResolutions(keepRanges, splices) {
  if (keepRanges.length === 0) {
    return [];
  }

  const resolved = [];
  let current = {
    start: keepRanges[0].start,
    end: keepRanges[0].end
  };

  for (const splice of splices) {
    const nextRange = keepRanges[splice.index + 1];
    if (!nextRange) {
      continue;
    }

    if (splice.resolution.action === 'skip') {
      current.end = nextRange.end;
      continue;
    }

    if (
      (splice.resolution.action === 'adjust' || splice.resolution.action === 'shorten') &&
      splice.resolution.resolvedGap
    ) {
      current.end = splice.resolution.resolvedGap.start;
      if (current.end > current.start) {
        resolved.push({
          start: roundTime(current.start),
          end: roundTime(current.end)
        });
      }
      current = {
        start: splice.resolution.resolvedGap.end,
        end: nextRange.end
      };
      continue;
    }

    if (current.end > current.start) {
      resolved.push({
        start: roundTime(current.start),
        end: roundTime(current.end)
      });
    }
    current = {
      start: nextRange.start,
      end: nextRange.end
    };
  }

  if (current.end > current.start) {
    resolved.push({
      start: roundTime(current.start),
      end: roundTime(current.end)
    });
  }

  return resolved;
}

function buildSplices(keepRanges, sourceWords, sourceTranscriptAvailable, outputWords, settings) {
  let outputCursor = 0;

  return keepRanges.slice(0, -1).map((leftKeep, index) => {
    const rightKeep = keepRanges[index + 1];
    const removedGap = {
      start: leftKeep.end,
      end: rightKeep.start,
      duration: roundTime(Math.max(0, rightKeep.start - leftKeep.end))
    };
    const lastWordBefore = sourceTranscriptAvailable ? findLastWordBefore(sourceWords, leftKeep.end) : null;
    const nextWordAfter = sourceTranscriptAvailable ? findNextWordAfter(sourceWords, rightKeep.start) : null;
    const removedWords = sourceTranscriptAvailable
      ? findWordsOverlapping(sourceWords, removedGap.start, removedGap.end)
      : [];
    const leftEdgeWord = sourceTranscriptAvailable
      ? sourceWords.find((word) => word.start < leftKeep.end && word.end > leftKeep.end) || null
      : null;
    const rightEdgeWord = sourceTranscriptAvailable
      ? sourceWords.find((word) => word.start < rightKeep.start && word.end > rightKeep.start) || null
      : null;
    const tailPaddingSec = lastWordBefore ? roundTime(leftKeep.end - lastWordBefore.end) : null;
    const leadPaddingSec = nextWordAfter ? roundTime(nextWordAfter.start - rightKeep.start) : null;
    const classification = classifySplice({
      leftEdgeWord,
      rightEdgeWord,
      removedWords,
      tailPaddingSec,
      leadPaddingSec,
      settings,
      transcriptAvailable: sourceTranscriptAvailable
    });
    const resolution = buildResolution({
      risk: classification.risk,
      leftKeep,
      rightKeep,
      lastWordBefore,
      nextWordAfter,
      leftEdgeWord,
      rightEdgeWord,
      removedWords,
      settings,
      transcriptAvailable: sourceTranscriptAvailable
    });
    const outputSec = outputCursor + rangeDuration(leftKeep);
    outputCursor = outputSec;
    const outputFlow = buildOutputFlow(outputWords, outputSec, settings);
    const combinedRisk = combineRisk(classification.risk, outputFlow.risk);

    return {
      index,
      outputSec: roundTime(outputSec),
      sourceGap: removedGap,
      leftKeep: {
        start: leftKeep.start,
        end: leftKeep.end,
        duration: rangeDuration(leftKeep)
      },
      rightKeep: {
        start: rightKeep.start,
        end: rightKeep.end,
        duration: rangeDuration(rightKeep)
      },
      words: {
        lastBefore: wordSnapshot(lastWordBefore),
        nextAfter: wordSnapshot(nextWordAfter),
        leftEdge: wordSnapshot(leftEdgeWord),
        rightEdge: wordSnapshot(rightEdgeWord),
        removed: removedWords.map(wordSnapshot)
      },
      padding: {
        tailSec: tailPaddingSec,
        leadSec: leadPaddingSec
      },
      risk: combinedRisk,
      sourceRisk: classification.risk,
      outputRisk: outputFlow.risk,
      reasons: [
        ...classification.reasons,
        ...outputFlow.reasons
      ],
      outputFlow,
      resolution
    };
  });
}

export async function auditCutsRun(runDir) {
  const { project } = await loadProject(runDir);
  const silencePath = artifactPath(runDir, project, 'silence');
  const auditPath = artifactPath(runDir, project, 'cutAudit');
  const compositionPath = artifactPath(runDir, project, 'composition');
  const silence = await readJson(silencePath);
  const composition = await pathExists(compositionPath) ? await readJson(compositionPath) : null;
  const sourceTranscript = await loadTranscriptArtifact(
    runDir,
    project,
    'transcriptSource',
    'transcript'
  );
  const outputTranscript = await loadTranscriptArtifact(runDir, project, 'transcriptOutput');
  const correctionsDocument = await loadTranscriptCorrections(runDir, project);
  const settings = {
    ...DEFAULT_SETTINGS.audit,
    ...(project.settings.audit || {})
  };

  const keepRanges = silence.keepRanges.map((range) => ({
    start: range.start,
    end: range.end
  }));
  const candidateDensity = summarizeDensity(keepRanges, settings.maxCutsPerMinute);
  const structuralFindings = candidateDensity.densityRisk === 'high'
    ? [{
      risk: 'high',
      type: 'candidate-cut-density',
      message: `Candidate cut density ${candidateDensity.cutsPerMinute}/min exceeds max ${settings.maxCutsPerMinute}/min`
    }]
    : [];
  const splices = buildSplices(
    keepRanges,
    sourceTranscript.words,
    sourceTranscript.available,
    outputTranscript.words,
    settings
  );
  const resolvedKeepRanges = applyResolutions(keepRanges, splices);
  const comparisonKeepRanges = composition?.timeline?.keepRanges || keepRanges;
  const plannedDensity = summarizeDensity(comparisonKeepRanges, settings.maxCutsPerMinute);
  const transcriptComparison = buildTranscriptComparison(
    sourceTranscript,
    outputTranscript,
    comparisonKeepRanges,
    plannedDensity.outputDuration,
    settings,
    correctionsDocument
  );

  if (plannedDensity.densityRisk === 'high') {
    structuralFindings.push({
      risk: 'high',
      type: 'planned-cut-density',
      message: `Planned/rendered cut density ${plannedDensity.cutsPerMinute}/min exceeds max ${settings.maxCutsPerMinute}/min`
    });
  }

  if (transcriptComparison.available && transcriptComparison.risk !== 'low') {
    structuralFindings.push({
      risk: transcriptComparison.risk,
      type: 'transcript-output',
      message: `Rendered transcript differs on ${transcriptComparison.missingWordCount}/${transcriptComparison.expectedWordCount} expected words after corrections`
    });
  }

  const highRiskSpliceCount = splices.filter((splice) => splice.risk === 'high').length;
  const mediumRiskSpliceCount = splices.filter((splice) => splice.risk === 'medium').length;

  const audit = {
    schemaVersion: 1,
    source: {
      silence: path.relative(runDir, silencePath),
      sourceTranscript: sourceTranscript.path,
      sourceTranscriptAvailable: sourceTranscript.available,
      outputTranscript: outputTranscript.path,
      outputTranscriptAvailable: outputTranscript.available
    },
    settings,
    summary: {
      sourceDuration: silence.duration,
      outputDuration: candidateDensity.outputDuration,
      keepRangeCount: candidateDensity.keepRangeCount,
      spliceCount: candidateDensity.spliceCount,
      cutsPerMinute: candidateDensity.cutsPerMinute,
      maxCutsPerMinute: settings.maxCutsPerMinute,
      densityRisk: candidateDensity.densityRisk,
      plannedOutputDuration: plannedDensity.outputDuration,
      plannedKeepRangeCount: plannedDensity.keepRangeCount,
      plannedSpliceCount: plannedDensity.spliceCount,
      plannedCutsPerMinute: plannedDensity.cutsPerMinute,
      plannedDensityRisk: plannedDensity.densityRisk,
      highRiskSpliceCount,
      mediumRiskSpliceCount,
      transcriptComparisonRisk: transcriptComparison.available ? transcriptComparison.risk : 'unknown'
    },
    structuralFindings,
    transcriptComparison,
    splices,
    resolvedKeepRanges
  };

  await writeJson(auditPath, audit);
  await advanceRunState(runDir, RunState.ANALYZED);
  return { outputPath: auditPath, audit };
}
