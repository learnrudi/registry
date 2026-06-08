import assert from 'node:assert/strict';
import test from 'node:test';

import { facebookPageAdapter } from '../../src/adapters/facebook-page.js';

const target = Object.freeze({
  asset_type: 'page',
  platform_asset_id: '114938395005060',
});

function post(metadata = {}) {
  return {
    title: 'Title',
    body: 'Caption',
    metadata,
  };
}

test('facebook adapter validates text posts without media', () => {
  const result = facebookPageAdapter.validatePost({
    post: post(),
    target,
    media: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'text');
});

test('facebook adapter validates one hosted image post', () => {
  const result = facebookPageAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'https://example.com/image.jpg',
      bytes: 1024,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'image');
});

test('facebook adapter validates one hosted video post', () => {
  const result = facebookPageAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'video',
      source_url: 'https://example.com/video.mp4',
      bytes: 1024,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'video');
});

test('facebook adapter rejects non-HTTPS media URLs', () => {
  const result = facebookPageAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'http://example.com/image.jpg',
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'media_url_not_https');
});

test('facebook adapter validates multi-image posts as carousel mode', () => {
  const result = facebookPageAdapter.validatePost({
    post: post(),
    target,
    media: [
      {
        media_kind: 'image',
        source_url: 'https://example.com/one.jpg',
      },
      {
        media_kind: 'image',
        source_url: 'https://example.com/two.jpg',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'carousel');
});

test('facebook adapter rejects mixed carousel media', () => {
  const result = facebookPageAdapter.validatePost({
    post: post({ facebook: { media_type: 'carousel' } }),
    target,
    media: [
      {
        media_kind: 'image',
        source_url: 'https://example.com/one.jpg',
      },
      {
        media_kind: 'video',
        source_url: 'https://example.com/two.mp4',
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'image_required');
});

test('facebook adapter validates carousel item count', () => {
  const result = facebookPageAdapter.validatePost({
    post: post({ facebook: { media_type: 'carousel' } }),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'https://example.com/one.jpg',
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'invalid_carousel_count');
});
