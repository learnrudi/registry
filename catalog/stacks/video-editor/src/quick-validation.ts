export function assertTimestamp(value: unknown, name: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^(?:\d+:)?(?:[0-5]?\d:)?\d+(?:\.\d+)?$/.test(value) || value.length > 24) {
    throw new Error(`${name} must be a timestamp in seconds or HH:MM:SS format`);
  }
}

function assertNumber(value: unknown, name: string, min = Number.MIN_VALUE, max = Number.MAX_VALUE, integer = false): void {
  if (value === undefined) return;
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${name} must be a finite ${integer ? 'integer' : 'number'} between ${min} and ${max}`);
  }
}

function assertEnum(value: unknown, name: string, choices: string[]): void {
  if (value !== undefined && (typeof value !== 'string' || !choices.includes(value))) {
    throw new Error(`${name} must be one of: ${choices.join(', ')}`);
  }
}

export function validateQuickOptions(operation: string, options: Record<string, unknown>): void {
  for (const name of ['start', 'end', 'duration', 'time']) assertTimestamp(options[name], name);
  for (const name of ['speed', 'targetDuration', 'last', 'minDuration', 'interval', 'scale']) assertNumber(options[name], name);
  for (const name of ['width', 'height']) assertNumber(options[name], name, 1, 16384, true);
  assertNumber(options.padding, 'padding', 0);
  assertNumber(options.crf, 'crf', 0, 51);
  assertNumber(options.count, 'count', 1, 10000, true);
  assertEnum(options.preset, 'preset', ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']);
  if (operation === 'videoExtractAudio') assertEnum(options.format, 'format', ['mp3', 'aac', 'wav', 'flac', 'ogg']);
  if (operation === 'videoFrames') assertEnum(options.format, 'format', ['jpg', 'png', 'webp']);
  if (options.threshold !== undefined && (typeof options.threshold !== 'string' || !/^-?\d+(?:\.\d+)?(?:dB)?$/.test(options.threshold))) {
    throw new Error('threshold must be a numeric amplitude or decibel value');
  }
  if (options.maxBitrate !== undefined && (typeof options.maxBitrate !== 'string' || !/^\d+(?:\.\d+)?[kKmM]?$/.test(options.maxBitrate))) {
    throw new Error('maxBitrate must be a bitrate such as 2M or 500k');
  }
  if (options.timestamps !== undefined) {
    if (!Array.isArray(options.timestamps) || options.timestamps.length > 10000) throw new Error('timestamps must be an array of at most 10000 timestamps');
    for (const value of options.timestamps) assertTimestamp(value, 'timestamps');
  }
  if (options.output !== undefined && (typeof options.output !== 'string' || !options.output.trim() || /[\0\r\n]/.test(options.output))) {
    throw new Error('output must be a non-empty local path without control characters');
  }
}

export function parseFrameRate(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(value)) return 0;
  const [numerator, denominator = 1] = value.split('/').map(Number);
  const rate = numerator / denominator;
  return Number.isFinite(rate) ? rate : 0;
}
