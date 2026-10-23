const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'gmail-filters-'));
  const mock = join(dir, 'mock.mjs');
  const calls = join(dir, 'calls.jsonl');
  writeFileSync(calls, '');
  const accountDir = join(dir, 'accounts', 'owner@example.com');
  mkdirSync(accountDir, { recursive: true });
  writeFileSync(join(accountDir, 'token.json'), JSON.stringify({ token: 'fixture', client_id: 'fixture', client_secret: 'fixture' }));
  writeFileSync(mock, `import { appendFileSync } from 'node:fs';
import { google } from ${JSON.stringify(pathToFileURL(require.resolve('googleapis')).href)};
const record = (method, args, options) => appendFileSync(${JSON.stringify(calls)}, JSON.stringify({method,args,options})+'\\n');
const rule = {id:'filter-1',criteria:{from:'sender@example.com'},action:{addLabelIds:['Label_1'],removeLabelIds:['INBOX']}};
const rules = new Map([[rule.id, rule]]);
google.gmail = () => ({users:{getProfile:async(args,options)=>{record('profile',args,options);return {data:{emailAddress:'owner@example.com'}}},settings:{filters:{
list:async(args,options)=>{record('list',args,options);return {data:{filter:[...rules.values()]}}},
get:async(args,options)=>{record('get',args,options);if(!rules.has(args.id))throw {response:{status:404}};return {data:rules.get(args.id)}},
create:async(args,options)=>{record('create',args,options);const saved={id:'new-filter',...args.requestBody};rules.set(saved.id,saved);return {data:saved}},
delete:async(args,options)=>{record('delete',args,options);rules.delete(args.id);return {data:''}}
}},labels:{list:async(args,options)=>{record('labels.list',args,options);return {data:{labels:[{id:'INBOX',type:'system'},{id:'Label_1',type:'user'}]}}}},
messages:{list:async(args,options)=>{record('messages.list',args,options);return {data:{messages:[{id:'m1',threadId:'t1'}],resultSizeEstimate:1}}}}
}});`);
  const client = new Client({ name: 'filter-test', version: '1' }, { capabilities: {} });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: ['--import', 'tsx', '--import', mock, 'src/index.ts'],
      cwd: process.cwd(), env: { RUDI_STACK_STATE_DIR: dir }, stderr: 'pipe',
    }));
    await run(client, () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('MCP lists filters only after verifying the explicit mailbox', async () => {
  await fixture(async (client, calls) => {
    const result = await client.callTool({ name: 'gmail_filter_list', arguments: { account: 'owner@example.com' } });
    assert.notEqual(result.isError, true, result.content[0].text);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.account, 'owner@example.com');
    assert.equal(body.filters[0].id, 'filter-1');
    assert.deepEqual(calls().map(x => x.method), ['profile', 'list']);
    const advertised = (await client.listTools()).tools.find(x => x.name === 'gmail_filter_list');
    assert.deepEqual(advertised.inputSchema.required, ['account']);
  });
});

test('MCP advertises and routes preview, create, get and delete using only the mock provider', async () => {
  await fixture(async (client, calls) => {
    const tools = (await client.listTools()).tools.filter(x => x.name.startsWith('gmail_filter_'));
    assert.equal(tools.length, 5);
    for (const tool of tools) {
      assert.ok(tool.inputSchema.required.includes('account'));
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.equal(tool.annotations.readOnlyHint, !['gmail_filter_create', 'gmail_filter_delete'].includes(tool.name));
    }
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: { account: 'owner@example.com', ...args } });
      assert.notEqual(result.isError, true, result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    const preview = await call('gmail_filter_preview', { query: 'from:sender@example.com' });
    assert.equal(preview.messages.length, 1);
    assert.equal(preview.approximate, true);
    const created = await call('gmail_filter_create', { criteria: { query: 'from:sender@example.com' }, action: { addLabelIds: ['Label_1'], removeLabelIds: ['INBOX'] } });
    assert.equal(created.verified, true);
    assert.equal((await call('gmail_filter_get', { filter_id: created.filter.id })).filter.id, created.filter.id);
    assert.equal((await call('gmail_filter_delete', { filter_id: created.filter.id })).verified, true);
    assert.equal(calls().filter(x => x.method === 'create').length, 1);
    assert.equal(calls().filter(x => x.method === 'delete').length, 1);
    assert.ok(calls().every(x => x.options?.timeout === 30000 && x.options?.retry === false));
  });
});
