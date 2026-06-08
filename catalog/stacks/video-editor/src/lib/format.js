// Shared formatting helpers. All ops that work with time/sizes/rates
// should pull from here so we don't have 13 different copies of `roundTime`.

// Round a time value to a given decimal precision. Default 3dp matches
// the ms-grain that whisper word timestamps and ffmpeg silencedetect produce.
export function roundTime(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

// Round + force fixed-string representation. Used in ffmpeg filter_complex
// time fields where literal "0.500" reads better than "0.5".
export function formatSeconds(value) {
  return roundTime(value).toFixed(3);
}

// Human-readable mm:ss for a duration in seconds.
export function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Human-readable file size (B/KB/MB/GB) with one decimal for GB, integer for MB/KB.
export function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

// Human-readable bitrate in Mbps or kbps.
export function fmtBitrate(bps) {
  if (!Number.isFinite(bps) || bps <= 0) return '—';
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

// Parse ffprobe rational rate strings like "30/1" → 30 (number).
// Returns null for invalid input including ffprobe's "0/0" sentinel.
export function parseFrameRate(rate) {
  if (!rate || typeof rate !== 'string') return null;
  const [num, den] = rate.split('/').map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}
