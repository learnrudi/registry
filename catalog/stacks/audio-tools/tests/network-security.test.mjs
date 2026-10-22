import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInput } from '../dist/resolve-input.js';

test('base64 byte budget is enforced before decoding', async () => {
  const previous = process.env.AUDIO_TOOLS_MAX_INPUT_BYTES;
  const original = Buffer.from;
  const encoded = original('more than eight bytes').toString('base64');
  let decoded = false;
  process.env.AUDIO_TOOLS_MAX_INPUT_BYTES = '8';
  Buffer.from = function (value, encoding, ...rest) {
    if (value === encoded && encoding === 'base64') decoded = true;
    return original(value, encoding, ...rest);
  };
  try {
    await assert.rejects(resolveInput({ data: encoded, filename: 'oversized-security-test.m4a' }), /exceeds|size/i);
    assert.equal(decoded, false);
  } finally {
    Buffer.from = original;
    if (previous === undefined) delete process.env.AUDIO_TOOLS_MAX_INPUT_BYTES;
    else process.env.AUDIO_TOOLS_MAX_INPUT_BYTES = previous;
  }
});

import { createPublicFetcher, publicHttp } from '../dist/public-http.js';

test('direct audio downloads reject private DNS without writing or connecting', async () => {
  const original = publicHttp.fetch;
  let requests = 0;
  publicHttp.fetch = createPublicFetcher({ resolve: async () => [{ address: '10.0.0.1', family: 4 }],
    request: () => { requests += 1; throw new Error('unexpected transport'); } });
  try {
    await assert.rejects(resolveInput({ url: 'https://127.0.0.1/audio.mp3' }), /public/);
    await assert.rejects(resolveInput({ url: 'https://media.example.com/audio.mp3' }), /public/);
    assert.equal(requests, 0);
  } finally { publicHttp.fetch = original; }
});
