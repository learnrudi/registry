import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphClient } from '../src/graph.js';

test('pagination cannot send credentials outside the same signed-in mailbox endpoint', async () => {
  let calls = 0;
  const graph = new GraphClient('secret', { fetchImpl: async () => { calls++; return Response.json({ value: [] }); } });
  for (const link of ['https://attacker.example/v1.0/me/messages', 'https://graph.microsoft.com/v1.0/users/other/messages',
    'https://graph.microsoft.com/v1.0/me/messages/abc/attachments', 'https://graph.microsoft.com/beta/me/messages',
    'https://graph.microsoft.com/v1.0/me/messages?$expand=attachments']) {
    await assert.rejects(graph.get('/me/messages', { '$select': 'id', '$top': '10' }, link), /continuation/);
  }
  assert.equal(calls, 0);
});

test('provider errors and oversized payloads do not leak response bodies', async () => {
  const denied = new GraphClient('secret', { fetchImpl: async () => new Response('access_token=PRIVATE', { status: 403 }) });
  await assert.rejects(denied.get('/me'), error => error.code === 'GRAPH_HTTP_403' && !error.message.includes('PRIVATE'));
  const oversized = new GraphClient('secret', { fetchImpl: async () => Response.json({ value: ['x'.repeat(200)] }) });
  await assert.rejects(oversized.get('/me', {}, null, 100), /size limit/);
});

test('attachment pagination accepts equivalent ID encoding within the same exact endpoint', async () => {
  const graph = new GraphClient('secret', { fetchImpl: async () => Response.json({ value: [] }) });
  assert.deepEqual(await graph.get('/me/messages/AAM%3D%3D/attachments', { '$select': 'id', '$top': '2' },
    'https://graph.microsoft.com/v1.0/me/messages/AAM==/attachments?%24select=id&%24top=2&%24skip=2'), { value: [] });
});

test('Graph uses GET without redirects, bounded retries and sanitized network errors', async () => {
  const requests = [];
  const waits = [];
  const graph = new GraphClient('secret', { fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return requests.length < 3 ? new Response('PRIVATE', { status: 429, headers: { 'retry-after': '1' } }) : Response.json({ id: 'user' });
  }, sleep: async ms => { waits.push(ms); } });
  assert.deepEqual(await graph.get('/me'), { id: 'user' });
  assert.equal(requests.length, 3);
  assert.deepEqual(waits, [1000, 1000]);
  assert.ok(requests.every(request => request.options.method === 'GET' && request.options.redirect === 'error' && request.options.signal));
  let attempts = 0;
  const delayed = new GraphClient('secret', { fetchImpl: async () => { attempts++; return new Response('PRIVATE', { status: 503, headers: { 'retry-after': '99' } }); } });
  await assert.rejects(delayed.get('/me'), error => error.code === 'GRAPH_HTTP_503' && !error.message.includes('PRIVATE'));
  assert.equal(attempts, 1);
  const offline = new GraphClient('secret', { fetchImpl: async () => { throw new Error('secret=PRIVATE'); } });
  await assert.rejects(offline.get('/me'), error => error.code === 'GRAPH_UNAVAILABLE' && !error.message.includes('PRIVATE'));
});

test('stream size is bounded even without Content-Length', async () => {
  const graph = new GraphClient('secret', { fetchImpl: async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(101)); controller.close();
  } })) });
  await assert.rejects(graph.get('/me', {}, null, 100), error => error.code === 'PAYLOAD_LIMIT');
});
