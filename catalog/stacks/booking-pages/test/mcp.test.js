import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP advertises the read-only contract and returns structured validation errors', async () => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['src/index.js'], cwd: new URL('..', import.meta.url).pathname, stderr: 'pipe' });
  const client = new Client({ name: 'booking-test', version: '1' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'booking_pages_get_availability');
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.equal(tools[0].inputSchema.additionalProperties, false);
    const bad = await client.callTool({ name: tools[0].name, arguments: { url: 'https://localhost/' } });
    assert.equal(bad.isError, true);
    assert.equal(bad.structuredContent.error.code, 'INVALID_URL');
  } finally { await client.close(); }
});
