import assert from 'assert/strict';
import {
  applySilenceOptions,
  listSilencePresets,
  SILENCE_PRESETS
} from '../src/operations/silence-options.js';

const baseSettings = {
  thresholdDb: -30,
  minDuration: 0.5,
  padding: 0.12,
  minKeepDuration: 0.25
};

assert.deepEqual(
  applySilenceOptions(baseSettings, { preset: 'aggressive' }),
  SILENCE_PRESETS.aggressive
);

assert.deepEqual(
  applySilenceOptions(baseSettings, {
    preset: 'conservative',
    thresholdDb: '-28',
    padding: '0.1'
  }),
  {
    ...SILENCE_PRESETS.conservative,
    thresholdDb: -28,
    padding: 0.1
  }
);

assert.throws(
  () => applySilenceOptions(baseSettings, { preset: 'reckless' }),
  /Unknown silence preset/
);

assert.throws(
  () => applySilenceOptions(baseSettings, { minDuration: '0' }),
  /Invalid minimum silence duration/
);

assert.deepEqual(
  listSilencePresets().map((preset) => preset.name),
  ['aggressive', 'moderate', 'conservative']
);

console.log('silence options tests passed');
