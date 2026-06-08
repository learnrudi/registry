import assert from 'node:assert/strict';
import test from 'node:test';

import { instagramProfileAdapter } from '../../src/adapters/instagram-profile.js';

const target = Object.freeze({
  asset_type: 'profile',
  platform_asset_id: '17841401750110537',
});

function post(metadata = {}) {
  return {
    body: 'Caption',
    metadata,
  };
}

test('instagram adapter validates a single hosted image post', () => {
  const result = instagramProfileAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'https://example.com/image.jpg',
      mime_type: 'image/jpeg',
      width: 1080,
      bytes: 1024,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'image');
});

test('instagram adapter validates a single hosted video as a reel', () => {
  const result = instagramProfileAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'video',
      source_url: 'https://example.com/video.mp4',
      mime_type: 'video/mp4',
      bytes: 1024,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'reel');
});

test('instagram adapter rejects non-HTTPS media URLs', () => {
  const result = instagramProfileAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'http://example.com/image.jpg',
      mime_type: 'image/jpeg',
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'media_url_not_https');
});

test('instagram adapter validates carousel item count', () => {
  const result = instagramProfileAdapter.validatePost({
    post: post({ instagram: { media_type: 'carousel' } }),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'https://example.com/image.jpg',
      mime_type: 'image/jpeg',
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'invalid_carousel_count');
});
