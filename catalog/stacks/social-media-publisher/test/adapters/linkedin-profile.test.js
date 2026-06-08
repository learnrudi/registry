import assert from 'node:assert/strict';
import test from 'node:test';

import { linkedinProfileAdapter } from '../../src/adapters/linkedin-profile.js';

const target = Object.freeze({
  asset_type: 'profile',
  platform_asset_id: 'SKshVsi6uX',
});

function post(metadata = {}) {
  return {
    title: 'Title',
    body: 'LinkedIn smoke caption',
    metadata,
  };
}

test('linkedin adapter validates text posts without media', () => {
  const result = linkedinProfileAdapter.validatePost({
    post: post(),
    target,
    media: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'text');
});

test('linkedin adapter validates image posts', () => {
  const result = linkedinProfileAdapter.validatePost({
    post: post(),
    target,
    media: [{
      media_kind: 'image',
      source_url: 'https://example.com/image.jpg',
      mime_type: 'image/jpeg',
      bytes: 1024,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'image');
});

test('linkedin adapter validates video posts', () => {
  const result = linkedinProfileAdapter.validatePost({
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
  assert.equal(result.mode, 'video');
});

test('linkedin adapter rejects non-HTTPS media URLs', () => {
  const result = linkedinProfileAdapter.validatePost({
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

test('linkedin adapter rejects too many images', () => {
  const media = Array.from({ length: 10 }, (_, index) => ({
    media_kind: 'image',
    source_url: `https://example.com/${index}.jpg`,
    mime_type: 'image/jpeg',
  }));

  const result = linkedinProfileAdapter.validatePost({
    post: post(),
    target,
    media,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'invalid_image_count');
});
