import assert from 'node:assert/strict';
import test from 'node:test';
import { extractGitHub } from '../src/github.ts';
import { publicHttp } from '../src/public-http.js';

test('provider-returned gist URLs cannot receive a GitHub bearer token', async () => {
  const originalFetch = globalThis.fetch;
  const originalPublic = publicHttp.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  const calls = [];
  process.env.GITHUB_TOKEN = 'fake-test-token';
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://api.github.com/')) {
      return new Response(JSON.stringify({ files: { file: { truncated: true, raw_url: 'https://attacker.example/stolen', filename: 'file.md' } } }));
    }
    return new Response('stolen');
  };
  publicHttp.fetch = async () => { throw new Error('Unexpected public request'); };
  try {
    await assert.rejects(extractGitHub('https://gist.github.com/owner/1234'), /GitHub.*origin|raw.*origin/i);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-test-token');
    assert.equal(calls[0].options.redirect, 'error');
  } finally {
    globalThis.fetch = originalFetch;
    publicHttp.fetch = originalPublic;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
});

test('approved raw GitHub text uses the credential-free public transport', async () => {
  const original = publicHttp.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'fake-test-token';
  let calls = 0;
  publicHttp.fetch = async (url, options) => {
    calls += 1;
    assert.equal(new URL(url).origin, 'https://raw.githubusercontent.com');
    assert.equal(new Headers(options.headers).has('authorization'), false);
    return new Response('# Public README');
  };
  try {
    const result = await extractGitHub('https://raw.githubusercontent.com/owner/repo/main/README.md');
    assert.match(result.content, /Public README/);
    assert.equal(calls, 1);
  } finally {
    publicHttp.fetch = original;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
});
