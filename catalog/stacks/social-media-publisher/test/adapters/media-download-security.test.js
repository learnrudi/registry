import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { downloadImage } from '../../src/adapters/twitter-profile.js';
import { downloadMedia as linkedinDownload } from '../../src/adapters/linkedin-profile.js';
import { downloadMedia as youtubeDownload } from '../../src/adapters/youtube-channel.js';

const downloads = [
  ['twitter', item => downloadImage(item)],
  ['linkedin', item => linkedinDownload(item, 10 * 1024 * 1024)],
  ['youtube', item => youtubeDownload(item, 2 * 1024 * 1024, 'Thumbnail')],
];

test('all three adapters reject private media before any HTTP download', async () => {
  const original = axios.get;
  let requests = 0;
  axios.get = async () => { requests += 1; return { data: Buffer.from('secret') }; };
  try {
    for (const [name, download] of downloads) {
      await assert.rejects(download({ source_url: 'https://127.0.0.1/private', media_kind: 'image', mime_type: 'image/png' }), /public/i, name);
    }
    assert.equal(requests, 0);
  } finally { axios.get = original; }
});

import { createPublicFetcher, publicHttp } from '../../src/security/public-http.js';
import { mediaByteBudget } from '../../src/security/media-download.js';

test('every adapter uses vetted DNS and a bounded public fetch', async () => {
  const original = publicHttp.fetch;
  let transportCalls = 0;
  publicHttp.fetch = createPublicFetcher({ resolve: async () => [{ address: '10.0.0.1', family: 4 }],
    request: () => { transportCalls += 1; throw new Error('unexpected connection'); } });
  try {
    for (const [, download] of downloads) {
      await assert.rejects(download({ source_url: 'https://media.example.com/image.png', media_kind: 'image', mime_type: 'image/png' }), /public/);
    }
    assert.equal(transportCalls, 0);
    const budgets = [];
    publicHttp.fetch = async (url, options) => { budgets.push(options.maxBytes); return new Response('media'); };
    for (const [, download] of downloads) {
      assert.equal((await download({ source_url: 'https://media.example.com/image.png', media_kind: 'image', mime_type: 'image/png' })).toString(), 'media');
    }
    assert.deepEqual(budgets, [5 * 1024 * 1024, 10 * 1024 * 1024, 2 * 1024 * 1024]);
  } finally { publicHttp.fetch = original; }
});

test('trusted media cap is finite and cannot be bypassed by provider size claims', () => {
  const previous = process.env.SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES;
  try {
    process.env.SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES = '1024';
    assert.equal(mediaByteBudget(5 * 1024 ** 3), 1024);
    for (const invalid of ['Infinity', 'NaN', '-1', '0', String(1024 ** 3)]) {
      process.env.SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES = invalid;
      assert.throws(() => mediaByteBudget(500), /must be/);
    }
  } finally {
    if (previous === undefined) delete process.env.SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES;
    else process.env.SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES = previous;
  }
});
