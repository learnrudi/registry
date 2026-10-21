#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm365-verify-')));
const client = new Client({ name: 'microsoft-365-verifier', version: '0.1.0' });
try {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/index.js')], cwd: root,
    env: { PATH: process.env.PATH ?? '', HOME: temporary, RUDI_HOME: path.join(temporary, '.rudi') }, stderr: 'pipe' });
  await client.connect(transport, { timeout: 15000 });
  const actual = (await client.listTools(undefined, { timeout: 15000 })).tools;
  assert.deepEqual(actual.map(tool => tool.name).sort(), [...manifest.provides.tools].sort());
  const listed = await client.callTool({ name: 'account_list', arguments: {} }, undefined, { timeout: 15000 });
  assert.deepEqual(JSON.parse(listed.content[0].text), []);
  process.stdout.write(`Verified ${manifest.id} isolated stdio MCP surface (${actual.length} tools).\n`);
} catch {
  process.stderr.write('Microsoft 365 isolated MCP verification failed.\n');
  process.exitCode = 1;
} finally {
  await client.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
