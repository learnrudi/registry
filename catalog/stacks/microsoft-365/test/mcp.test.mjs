import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/index.js';

test('MCP initializes and offers only the nine bounded Outlook/account tools', async t => {
  const server = createServer();
  const client = new Client({ name: 'test', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(right);
  await client.connect(left);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['account_list', 'account_status', 'outlook_profile', 'outlook_mail_list', 'outlook_mail_search', 'outlook_mail_read', 'outlook_attachment_list', 'outlook_attachment_download', 'outlook_attachment_extract'].sort());
  for (const tool of listed.tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, tool.name !== 'outlook_attachment_download');
  }
});

test('MCP errors do not echo provider or credential details', async t => {
  const server = createServer({ withAuthorized: async () => { throw new Error('access_token=PRIVATE'); } });
  const client = new Client({ name: 'test', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(right); await client.connect(left);
  const response = await client.callTool({ name: 'outlook_profile', arguments: { account: 'reader' } });
  assert.equal(response.isError, true);
  assert.equal(JSON.stringify(response).includes('PRIVATE'), false);
  const unknown = await client.callTool({ name: 'send', arguments: {} });
  assert.equal(unknown.isError, true);
});
