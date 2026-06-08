import assert from 'node:assert/strict';
import {
  getCaptionTextStyle,
  getPillTextStyle,
  getTextOverlayPlacement,
  getTikTokSafeArea
} from '../composer/src/components/tiktokOverlayStyle.js';

const storySafeArea = getTikTokSafeArea(1080, 1920);
assert.deepEqual({
  left: storySafeArea.left,
  right: storySafeArea.right,
  top: storySafeArea.top,
  bottom: storySafeArea.bottom,
  contentWidth: storySafeArea.contentWidth,
  contentHeight: storySafeArea.contentHeight
}, {
  left: 40,
  right: 150,
  top: 130,
  bottom: 300,
  contentWidth: 890,
  contentHeight: 1490
});

const phoneSafeArea = getTikTokSafeArea(720, 1280);
assert.deepEqual({
  left: phoneSafeArea.left,
  right: phoneSafeArea.right,
  top: phoneSafeArea.top,
  bottom: phoneSafeArea.bottom,
  contentWidth: phoneSafeArea.contentWidth,
  contentHeight: phoneSafeArea.contentHeight
}, {
  left: 27,
  right: 100,
  top: 87,
  bottom: 200,
  contentWidth: 593,
  contentHeight: 993
});

const topPlacement = getTextOverlayPlacement('top', 1080, 1920);
assert.equal(topPlacement.left, 40);
assert.equal(topPlacement.right, 150);
assert.equal(topPlacement.top, 130);
assert.equal(topPlacement.justifyContent, 'center');
assert.equal(topPlacement.textAlign, 'center');

const topLowerPlacement = getTextOverlayPlacement('top-lower', 1080, 1920);
assert.equal(topLowerPlacement.left, 40);
assert.equal(topLowerPlacement.right, 150);
assert.equal(topLowerPlacement.top, 200);
assert.equal(topLowerPlacement.justifyContent, 'center');
assert.equal(topLowerPlacement.textAlign, 'center');

const bottomPlacement = getTextOverlayPlacement('bottom', 1080, 1920);
assert.equal(bottomPlacement.left, 40);
assert.equal(bottomPlacement.right, 150);
assert.equal(bottomPlacement.bottom, 300);
assert.equal(bottomPlacement.justifyContent, 'center');

const pillStyle = getPillTextStyle('default', 1080, 1920);
assert.equal(pillStyle.background, '#ffffff');
assert.equal(pillStyle.color, '#0b0b0b');
assert.equal(pillStyle.fontSize, 52);
assert.match(pillStyle.fontFamily, /SF Pro Display/);

const smallPillStyle = getPillTextStyle('small', 720, 1280);
assert.equal(smallPillStyle.fontSize, 27);
assert.equal(smallPillStyle.borderRadius, 9);

const captionStyle = getCaptionTextStyle(1080, 1920);
assert.equal(captionStyle.color, '#ffffff');
assert.equal(captionStyle.background, undefined);
assert.equal(captionStyle.fontSize, 40);
assert.match(captionStyle.textShadow, /rgba\(0, 0, 0/);

console.log('tiktok-overlay-style tests passed');
