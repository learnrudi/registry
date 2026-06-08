export { SILENCE_PRESETS } from '../config/defaults.js';
import { SILENCE_PRESETS } from '../config/defaults.js';

function normalizeNumber(rawValue, label, validator) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || !validator(value)) {
    throw new Error(`Invalid ${label}: ${rawValue}`);
  }
  return value;
}

export function applySilenceOptions(baseSettings, options = {}) {
  const presetName = options.preset || null;
  const preset = presetName ? SILENCE_PRESETS[presetName] : null;

  if (presetName && !preset) {
    throw new Error(`Unknown silence preset: ${presetName}`);
  }

  const overrides = {};
  const thresholdDb = normalizeNumber(
    options.thresholdDb,
    'silence threshold',
    (value) => value < 0 && value >= -100
  );
  const minDuration = normalizeNumber(
    options.minDuration,
    'minimum silence duration',
    (value) => value > 0
  );
  const padding = normalizeNumber(
    options.padding,
    'silence padding',
    (value) => value >= 0
  );
  const minKeepDuration = normalizeNumber(
    options.minKeepDuration,
    'minimum keep duration',
    (value) => value >= 0
  );

  if (thresholdDb !== null) overrides.thresholdDb = thresholdDb;
  if (minDuration !== null) overrides.minDuration = minDuration;
  if (padding !== null) overrides.padding = padding;
  if (minKeepDuration !== null) overrides.minKeepDuration = minKeepDuration;

  return {
    ...baseSettings,
    ...(preset || {}),
    ...overrides
  };
}

export function listSilencePresets() {
  return Object.entries(SILENCE_PRESETS).map(([name, settings]) => ({
    name,
    ...settings
  }));
}
