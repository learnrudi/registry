import assert from 'node:assert/strict';
import {
  buildApplyOverlaysFilter,
  getFormatDimensions,
  normalizeOverlayRequest
} from '../src/operations/apply-overlays.js';

const request = normalizeOverlayRequest({
  video_path: '/tmp/source.mov',
  format: 'story',
  overlays: [
    { image_path: '/tmp/card-1.png', start: 1, end: 4, transition: 'fade' },
    { image_path: '/tmp/card-2.png', start: 4, end: 6 }
  ],
  output_path: '/tmp/output.mp4'
}, {
  duration: 10,
  imageDimensions: [
    { width: 1080, height: 1920 },
    { width: 1080, height: 1920 }
  ]
});

assert.deepEqual(getFormatDimensions('story'), { width: 1080, height: 1920 });
assert.equal(request.overlays[1].transition, 'fade');
assert.equal(request.overlays.length, 2);

const filter = buildApplyOverlaysFilter(request);
assert.match(filter, /\[0:v\]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1\[base0\]/);
assert.match(filter, /\[1:v\]format=rgba,scale=1080:1920,fade=t=in:st=1\.000:d=0\.300:alpha=1\[ov0\]/);
assert.match(filter, /\[base0\]\[ov0\]overlay=0:0:enable='between\(t,1\.000,4\.000\)'\[base1\]/);
assert.match(filter, /\[2:v\]format=rgba,scale=1080:1920,fade=t=out:st=5\.700:d=0\.300:alpha=1\[ov1\]/);
assert.match(filter, /\[base1\]\[ov1\]overlay=0:0:enable='between\(t,4\.000,6\.000\)'\[vout\]/);
assert.doesNotMatch(filter, /fade=t=out:st=3\.700/);
assert.doesNotMatch(filter, /fade=t=in:st=4\.000/);

const pipRequest = normalizeOverlayRequest({
  video_path: '/tmp/source.mov',
  format: 'story',
  overlays: [
    { image_path: '/tmp/card-1.png', start: 1, end: 4, transition: 'fade' },
    { image_path: '/tmp/card-2.png', start: 4, end: 6, show_pip: false }
  ],
  presenter_pip: {
    enabled: true,
    shape: 'circle',
    size: 260,
    position: 'top-right',
    margin: 56,
    show: 'during_overlays',
    crop: { x: 0, y: 120, width: 720, height: 720 }
  },
  output_path: '/tmp/output-pip.mp4'
}, {
  duration: 10,
  videoDimensions: { width: 720, height: 1280 },
  imageDimensions: [
    { width: 1080, height: 1920 },
    { width: 1080, height: 1920 }
  ]
});

assert.equal(pipRequest.presenter_pip.enabled, true);
assert.equal(pipRequest.overlays[0].show_pip, true);
assert.equal(pipRequest.overlays[1].show_pip, false);

const pipFilter = buildApplyOverlaysFilter(pipRequest);
assert.match(pipFilter, /\[0:v\]split=2\[baseSource\]\[pipSource\]/);
assert.match(pipFilter, /\[baseSource\]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1\[base0\]/);
assert.match(pipFilter, /\[pipSource\]crop=720:720:0:120,scale=260:260,setsar=1,format=rgba,geq=/);
assert.match(pipFilter, /\[cardsout\]\[pip\]overlay=764:56:enable='between\(t,1\.000,4\.000\)'\[vout\]/);
assert.doesNotMatch(pipFilter, /\[cardsout\]\[pip\]overlay=764:56:enable='.*between\(t,4\.000,6\.000\).*'\[vout\]/);

assert.throws(
  () => normalizeOverlayRequest({
    video_path: '/tmp/source.mov',
    format: 'story',
    overlays: [
      { image_path: '/tmp/card-1.png', start: 1, end: 4 },
      { image_path: '/tmp/card-2.png', start: 3.9, end: 6 }
    ],
    output_path: '/tmp/output.mp4'
  }, {
    duration: 10,
    imageDimensions: [
      { width: 1080, height: 1920 },
      { width: 1080, height: 1920 }
    ]
  }),
  /Overlay at index 1 overlaps previous overlay/
);

assert.throws(
  () => normalizeOverlayRequest({
    video_path: '/tmp/source.mov',
    format: 'story',
    overlays: [{ image_path: '/tmp/card-1.png', start: 1, end: 11 }],
    output_path: '/tmp/output.mp4'
  }, {
    duration: 10,
    imageDimensions: [{ width: 1080, height: 1920 }]
  }),
  /extends past video duration/
);

assert.throws(
  () => normalizeOverlayRequest({
    video_path: '/tmp/source.mov',
    format: 'story',
    overlays: [{ image_path: '/tmp/card-1.png', start: 1, end: 4 }],
    output_path: '/tmp/output.mp4'
  }, {
    duration: 10,
    imageDimensions: [{ width: 720, height: 1280 }]
  }),
  /must match story output dimensions/
);

assert.throws(
  () => normalizeOverlayRequest({
    video_path: '/tmp/source.mov',
    format: 'story',
    overlays: [{ image_path: '/tmp/card-1.png', start: 1, end: 4 }],
    presenter_pip: {
      enabled: true,
      crop: { x: 0, y: 900, width: 720, height: 720 }
    },
    output_path: '/tmp/output.mp4'
  }, {
    duration: 10,
    videoDimensions: { width: 720, height: 1280 },
    imageDimensions: [{ width: 1080, height: 1920 }]
  }),
  /presenter_pip.crop extends beyond source video dimensions/
);

console.log('apply-overlays tests passed');
