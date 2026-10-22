import test from 'node:test';
import assert from 'node:assert/strict';
import { Outlook } from '../src/outlook.js';
import { createToolkit } from '../src/tools.js';

test('message pages expose continuation and bind it to account, search and page size', async () => {
  const calls = [];
  const outlook = new Outlook({ withAuthorized: async (_account, run) => run({ get: async (endpoint, parameters, next) => {
    calls.push({ endpoint, parameters, next });
    const url = new URL(`https://graph.microsoft.com/v1.0${endpoint}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    url.searchParams.set('$skip', '2');
    return { value: [{ id: 'one' }, { id: 'two' }], '@odata.nextLink': url.href };
  } }) });
  const page = await outlook.list({ account: 'reader', limit: 2, query: 'subject:example' }, true);
  assert.equal(page.has_more, true);
  assert.equal(page.items.length, 2);
  assert.equal(calls[0].parameters.$top, '2');
  assert.equal(calls[0].parameters.$search, '"subject:example"');
  await outlook.list({ account: 'reader', limit: 2, query: 'subject:example', cursor: page.next_cursor }, true);
  assert.ok(calls[1].next.includes('$skip=2') || calls[1].next.includes('%24skip=2'));
  for (const changed of [{ account: 'other' }, { limit: 3 }, { query: 'other' }]) {
    await assert.rejects(outlook.list({ account: 'reader', limit: 2, query: 'subject:example', cursor: page.next_cursor, ...changed }, true), /continuation/);
  }
});

test('message reads report body truncation and cannot accept endpoint overrides', async () => {
  const calls = [];
  const accounts = { withAuthorized: async (_alias, run) => run({ get: async (endpoint, parameters) => {
    calls.push({ endpoint, parameters });
    return { id: 'message', subject: 'subject', body: { contentType: 'text', content: 'abcdef' }, unexpected: 'PRIVATE' };
  } }) };
  const toolkit = createToolkit(accounts);
  const read = await toolkit.call('outlook_mail_read', { account: 'reader', message_id: 'message', max_body_chars: 3 });
  assert.equal(read.message.body.content, 'abc');
  assert.equal(read.body_truncated, true);
  assert.equal(read.body_characters, 6);
  assert.equal(read.message.unexpected, undefined);
  assert.equal(calls[0].endpoint, '/me/messages/message');
  await assert.rejects(toolkit.call('outlook_mail_list', { account: 'reader', url: 'https://attacker.example' }), /documented/);
  await assert.rejects(toolkit.call('outlook_mail_list', {}), /required/);
  await assert.rejects(toolkit.call('outlook_mail_list', { account: 'reader', limit: 51 }), /limit/);
  assert.equal(calls.length, 1);
});
