// Shared transcript handling. Each consumer op has slightly different needs
// (transcribe wants probability + rounding; cluster wants segmentIndex; cut-audit
// wants the basic shape). The flexible base + opts pattern keeps the canonical
// field-precedence and validation rules in one place.

// Whisper sometimes uses `word`, sometimes `text` for the word value depending on
// which extractor produced it. Normalize that across the stack.
export function pickWordText(raw) {
  return String(raw?.text || raw?.word || '').trim();
}

// Normalize a single raw whisper word into the canonical shape.
// Options:
//   round (boolean, default false)        — round start/end (and probability) to 3dp / 4dp.
//   includeProbability (boolean, default true) — pass probability through when present.
//   allowEmptyText (boolean, default false) — keep words with empty text (cut-audit uses this).
//   extra (object, optional)              — extra fields to merge onto the output (e.g. {segmentIndex}).
// Returns null when the input fails validation (missing text [unless allowEmptyText], invalid timestamps, end < start).
export function normalizeWord(raw, opts = {}) {
  const { round = false, includeProbability = true, allowEmptyText = false, extra = null } = opts;
  const text = pickWordText(raw);
  const start = Number(raw?.start);
  const end = Number(raw?.end);
  if ((!text && !allowEmptyText) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  const word = {
    text,
    start: round ? Number(start.toFixed(3)) : start,
    end: round ? Number(end.toFixed(3)) : end
  };

  if (includeProbability && Number.isFinite(raw.probability)) {
    word.probability = round ? Number(raw.probability.toFixed(4)) : raw.probability;
  }

  if (extra) Object.assign(word, extra);

  return word;
}

export function sortWords(words) {
  return words.slice().sort((a, b) => a.start - b.start || a.end - b.end);
}

// Walk a transcript (which may have a flat `words[]` or only `segments[].words[]`)
// and return a sorted flat list of normalized words. Useful for any op that needs
// "all words" without caring about segment grouping (cut-audit, narration ops).
//
// Opts forwarded to normalizeWord. Additionally:
//   withSegmentIndex (boolean, default false) — when walking segments, attach
//   the segmentIndex to each word's `extra` so downstream code can group them.
export function flattenTranscriptWords(transcript, opts = {}) {
  const { withSegmentIndex = false, ...wordOpts } = opts;

  if (Array.isArray(transcript?.words) && transcript.words.length > 0) {
    const flat = transcript.words.map((w) => normalizeWord(w, wordOpts)).filter(Boolean);
    return sortWords(flat);
  }

  if (Array.isArray(transcript?.segments)) {
    const flat = transcript.segments.flatMap((segment, segmentIndex) => (
      Array.isArray(segment.words)
        ? segment.words.map((w) => normalizeWord(w, {
            ...wordOpts,
            extra: withSegmentIndex ? { ...(wordOpts.extra || {}), segmentIndex } : wordOpts.extra
          }))
        : []
    )).filter(Boolean);
    return sortWords(flat);
  }

  return [];
}
