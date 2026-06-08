import assert from 'assert/strict';
import path from 'path';
import {
  defaultSlidesDir,
  fpsForInterval,
  parsePositiveNumber
} from '../src/operations/slides.js';

assert.equal(fpsForInterval(2), 0.5);
assert.equal(fpsForInterval(5), 0.2);
assert.equal(fpsForInterval(3), 0.333333);

assert.equal(parsePositiveNumber('5', 'interval'), 5);
assert.throws(() => parsePositiveNumber('0', 'interval'), /Invalid interval/);
assert.throws(() => parsePositiveNumber('-1', 'interval'), /Invalid interval/);
assert.throws(() => parsePositiveNumber('nope', 'interval'), /Invalid interval/);

assert.equal(
  path.basename(defaultSlidesDir('/tmp/example.video.mp4')),
  'example.video_slides'
);

console.log('slides tests passed');
