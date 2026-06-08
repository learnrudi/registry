import assert from 'node:assert/strict';
import test from 'node:test';

import { twitterProfileAdapter } from '../../src/adapters/twitter-profile.js';

const target = Object.freeze({
  asset_type: 'profile',
  platform_asset_id: '1938655497210466304',
});

function post(metadata = {}) {
  return {
    body: 'X smoke caption',
    metadata,
  };
}

test('twitter adapter validates text posts without media', () => {
  const result = twitterProfileAdapter.validatePost({
    post: post(),
    target,
    media: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'text');
});

test('twitter adapter validates image posts', () => {
  const result = twitterProfileAdapter.validatePost({
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

test('twitter adapter validates thread metadata', () => {
  const result = twitterProfileAdapter.validatePost({
    post: post({
      twitter: {
        tweets: [
          { text: 'First tweet' },
          { text: 'Second tweet' },
        ],
      },
    }),
    target,
    media: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'thread');
});

test('twitter adapter rejects non-HTTPS media URLs', () => {
  const result = twitterProfileAdapter.validatePost({
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

test('twitter adapter rejects overlong tweet text', () => {
  const result = twitterProfileAdapter.validatePost({
    post: {
      body: 'x'.repeat(281),
      metadata: {},
    },
    target,
    media: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'tweet_too_long');
});
