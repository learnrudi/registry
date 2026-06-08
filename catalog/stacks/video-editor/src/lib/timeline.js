// Timeline math shared by ops that need to translate between
// source-video time and post-cut timeline time.

// Map a source-time moment to its corresponding timeline-time moment,
// given the keepRanges that define the cut plan. Honors `speed` per range
// (e.g. a 6× sped range compresses its slice of source time into 1/6 of timeline time).
//
// Returns null if `sourceAt` falls outside every keep range
// (i.e. the moment was cut out of the timeline).
export function mapSourceTimeToTimeline(sourceAt, keepRanges) {
  let cursor = 0;
  for (const r of keepRanges) {
    const speed = r.speed || 1;
    if (sourceAt >= r.start && sourceAt < r.end) {
      return cursor + (sourceAt - r.start) / speed;
    }
    cursor += (r.end - r.start) / speed;
  }
  return null;
}

// The total output duration of a set of keepRanges, accounting for per-range speed.
export function timelineDuration(keepRanges) {
  return (keepRanges || []).reduce((sum, r) => {
    const speed = r.speed || 1;
    return sum + Math.max(0, (r.end - r.start) / speed);
  }, 0);
}
