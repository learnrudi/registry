import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildGradeFilter,
  normalizeGradeConfig
} from '../src/operations/grade.js';

const runDir = '/tmp/video-run';

const talkingHead = normalizeGradeConfig({ preset: 'talking-head' }, { runDir });
assert.equal(talkingHead.enabled, true);
assert.equal(talkingHead.preset, 'talking-head');
assert.equal(talkingHead.exposure, 0.04);
assert.equal(talkingHead.contrast, 1.06);
assert.equal(talkingHead.saturation, 1.05);
assert.equal(talkingHead.vibrance, 0.12);
assert.equal(talkingHead.sharpen, 0.18);

const filter = buildGradeFilter(talkingHead);
assert.equal(
  filter,
  'exposure=exposure=0.04,eq=contrast=1.06:saturation=1.05,vibrance=intensity=0.12,unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.18'
);

const custom = normalizeGradeConfig({
  preset: 'talking-head',
  exposure: 0.01,
  brightness: 0.02,
  contrast: 1.1,
  saturation: 0.98,
  gamma: 0.99,
  lut: 'looks/clean.cube',
  sharpen: 0
}, { runDir, skipPathExists: true });

assert.equal(custom.lut, path.join(runDir, 'looks/clean.cube'));
assert.equal(
  buildGradeFilter(custom),
  `exposure=exposure=0.01,eq=brightness=0.02:contrast=1.1:saturation=0.98:gamma=0.99,vibrance=intensity=0.12,lut3d=file='${path.join(runDir, 'looks/clean.cube')}':interp=tetrahedral`
);

assert.equal(buildGradeFilter(normalizeGradeConfig({ enabled: false }, { runDir })), null);

assert.throws(
  () => normalizeGradeConfig({ preset: 'unknown' }, { runDir }),
  /Unknown grade preset/
);

assert.throws(
  () => normalizeGradeConfig({ contrast: -1 }, { runDir }),
  /contrast must be between/
);

assert.throws(
  () => normalizeGradeConfig({ lut: 'missing.cube' }, { runDir }),
  /LUT file not found/
);

console.log('grade tests passed');
