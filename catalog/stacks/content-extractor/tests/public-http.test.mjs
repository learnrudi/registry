import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHttpUrl } from '../src/url-policy.ts';

test('URL boundary rejects private literals, credentials and unsupported protocols', () => {
  for (const url of ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/',
    'https://10.0.0.1/', 'http://169.254.169.254/', 'https://[::1]/',
    'https://[::ffff:127.0.0.1]/', 'https://user:password@example.com/', 'file:///etc/passwd']) {
    assert.throws(() => parseHttpUrl(url), /public|credential|http/i, url);
  }
  assert.equal(parseHttpUrl('https://example.com/path').hostname, 'example.com');
});

import * as publicHttpModule from '../src/public-http.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

function transport(responses, calls) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    request.end = () => {
      const result = responses.shift();
      calls.push({ url: url.toString(), options });
      options.lookup(url.hostname, {}, (error, address, family) => {
        assert.ifError(error);
        assert.equal(address, '93.184.216.34');
        assert.equal(family, 4);
      });
      const response = Readable.from(result.chunks ?? [Buffer.from('ok')]);
      Object.assign(response, { statusCode: result.status ?? 200, statusMessage: 'OK', headers: result.headers ?? {} });
      queueMicrotask(() => callback(response));
    };
    request.destroy = error => { if (error) queueMicrotask(() => request.emit('error', error)); };
    return request;
  };
}

test('DNS boundary denies mixed/private answers before request and pins vetted connect address', async () => {
  const calls = [];
  let addresses = [{ address: '127.0.0.1', family: 4 }];
  let lookups = 0;
  const fetchPublic = publicHttpModule.createPublicFetcher({
    resolve: async () => { lookups += 1; return addresses; },
    request: transport([{}], calls),
  });
  await assert.rejects(fetchPublic('https://example.com/'), /public/);
  addresses = [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.2', family: 4 }];
  await assert.rejects(fetchPublic('https://example.com/'), /public/);
  assert.equal(calls.length, 0);
  addresses = [{ address: '93.184.216.34', family: 4 }];
  assert.equal(await (await fetchPublic('https://example.com/')).text(), 'ok');
  assert.equal(calls.length, 1);
  assert.equal(lookups, 3, 'Connect did not perform a second DNS lookup');
  assert.equal(calls[0].options.agent, false, 'No unvetted pooled connection');
});

test('redirect hops are independently vetted with a finite redirect budget', async () => {
  const calls = [];
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }];
  const fetchPrivateRedirect = publicHttpModule.createPublicFetcher({ resolve,
    request: transport([{ status: 302, headers: { location: 'http://169.254.169.254/latest' } }], calls) });
  await assert.rejects(fetchPrivateRedirect('https://example.com/start'), /public/);
  assert.equal(calls.length, 1);
  const loopCalls = [];
  const fetchLoop = publicHttpModule.createPublicFetcher({ resolve,
    request: transport(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: '/loop' } })), loopCalls) });
  await assert.rejects(fetchLoop('https://example.com/start'), /redirect/i);
  assert.equal(loopCalls.length, 6);
});

test('streamed byte cap stops missing or dishonest lengths before buffering the full body', async () => {
  let consumed = 0;
  async function* body() {
    for (let n = 0; n < 100; n += 1) { consumed += 1; yield Buffer.alloc(3); }
  }
  const fetchPublic = publicHttpModule.createPublicFetcher({
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    request: transport([{ chunks: body(), headers: { 'content-length': '1' } }], []),
  });
  await assert.rejects(fetchPublic('https://example.com/', { maxBytes: 4 }), /exceeds|bytes/i);
  assert.ok(consumed < 10, `Stopped near the cap, consumed ${consumed} chunks`);
});

test('total timeout bounds DNS and forbids a later connection', { timeout: 1000 }, async () => {
  let finishLookup;
  const calls = [];
  const fetchPublic = publicHttpModule.createPublicFetcher({
    resolve: () => new Promise(resolve => { finishLookup = resolve; }),
    request: transport([{}], calls),
  });
  await assert.rejects(fetchPublic('https://example.com/', { timeoutMs: 10 }), /timeout/i);
  finishLookup([{ address: '93.184.216.34', family: 4 }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 0);
});

test('all blocked address classes make zero transport requests', async () => {
  let requests = 0;
  const fetchPublic = publicHttpModule.createPublicFetcher({
    resolve: async () => [{ address: '10.1.2.3', family: 4 }],
    request: () => { requests += 1; throw new Error('unexpected transport'); },
  });
  for (const address of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '192.168.0.1', '192.0.2.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '[::]', '[::1]', '[::ffff:127.0.0.1]', '[64:ff9b::7f00:1]', '[fc00::1]',
    '[fe80::1]', '[ff02::1]', '[2001:db8::1]', '[2002:7f00:1::]']) {
    await assert.rejects(fetchPublic(`https://${address}/`), /public/, address);
  }
  await assert.rejects(fetchPublic('https://dns-private.example/'), /public/);
  await assert.rejects(fetchPublic('https://user:pass@example.com/'), /credential/);
  await assert.rejects(fetchPublic('file:///etc/passwd'), /http/);
  assert.equal(requests, 0);
});

test('compressed and oversized advertised bodies fail without draining the stream', async () => {
  for (const headers of [{ 'content-length': '999' }, { 'content-encoding': 'gzip' }]) {
    let read = false;
    async function* body() { read = true; yield Buffer.alloc(999); }
    const fetchPublic = publicHttpModule.createPublicFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: transport([{ headers, chunks: body() }], []),
    });
    await assert.rejects(fetchPublic('https://example.com/', { maxBytes: 4 }), /bytes|Encoded/);
    assert.equal(read, false);
  }
});
