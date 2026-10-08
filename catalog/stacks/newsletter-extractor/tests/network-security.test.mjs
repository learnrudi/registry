import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchFeed } from '../src/index.ts';
import { createPublicFetcher, publicHttp } from '../src/public-http.js';

test('RSS fetching enforces the public DNS boundary before connecting', async () => {
  const original = publicHttp.fetch;
  let requests = 0;
  publicHttp.fetch = createPublicFetcher({ resolve: async () => [{ address: '10.0.0.1', family: 4 }],
    request: () => { requests += 1; throw new Error('unexpected transport'); } });
  try {
    await assert.rejects(fetchFeed('http://127.0.0.1/feed', 1000), /public/);
    await assert.rejects(fetchFeed('https://feed.example.com/rss', 1000), /public/);
    assert.equal(requests, 0);
  } finally { publicHttp.fetch = original; }
});

test('RSS uses the streamed five MiB budget and caller-bounded timeout', async () => {
  const original = publicHttp.fetch;
  publicHttp.fetch = async (url, options) => {
    assert.equal(url, 'https://feed.example.com/rss');
    assert.equal(options.maxBytes, 5 * 1024 * 1024);
    assert.equal(options.timeoutMs, 1000);
    return new Response('<rss/>');
  };
  try { assert.equal(await fetchFeed('https://feed.example.com/rss', 1000), '<rss/>'); }
  finally { publicHttp.fetch = original; }
});
