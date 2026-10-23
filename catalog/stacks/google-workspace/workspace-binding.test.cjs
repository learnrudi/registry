const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

test('real Google servers attest and use distinct pinned accounts with a conflicting active default', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'google-binding-'));
  const clients = [];
  try {
    for (const account of ['alpha', 'beta', 'global', 'impostor']) {
      const folder = path.join(root, 'accounts', `${account}@example.com`);
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, 'token.json'), JSON.stringify({ token: account === 'impostor' ? 'beta' : account, account: `${account}@example.com`, client_id: 'fixture', client_secret: 'fixture' }));
    }
    await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ currentAccount: 'global@example.com' }));
    const preload = path.join(root, 'provider.mjs');
    await fs.writeFile(preload, `import {google} from ${JSON.stringify(pathToFileURL(require.resolve('googleapis')).href)};
google.gmail=({auth})=>({users:{getProfile:async()=>({data:{emailAddress:auth.credentials.access_token+'@example.com'}})}});`);
    for (const name of ['alpha', 'beta', 'impostor']) {
      const binding = { version: 1, workspaceId: `wsp_${name}`, runId: name, account: `${name}@example.com`, tools: ['gmail_profile'] };
      const client = new Client({ name: 'binding-test', version: '1' }, { capabilities: {} });
      clients.push(client);
      await client.connect(new StdioClientTransport({ command: process.execPath,
        args: ['--import', 'tsx', '--import', preload, 'src/index.ts'], cwd: process.cwd(),
        env: { HOME: root, PATH: process.env.PATH, RUDI_STACK_STATE_DIR: root, RUDI_WORKSPACE_BINDING: JSON.stringify(binding) }, stderr: 'pipe' }));
      assert.deepEqual(client.getServerCapabilities()?.experimental?.['rudi.workspaceBinding'], binding);
      assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['gmail_profile']);
    }
    const results = await Promise.all(clients.slice(0, 2).map(client => client.callTool({ name: 'gmail_profile', arguments: {} })));
    assert.deepEqual(results.map(result => JSON.parse(result.content[0].text).emailAddress), ['alpha@example.com', 'beta@example.com']);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'state.json'))).currentAccount, 'global@example.com');
    const denied = await clients[0].callTool({ name: 'gmail_profile', arguments: { account: 'beta@example.com' } });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /conflicts with workspace binding/);
    assert.equal((await clients[0].callTool({ name: 'account_switch', arguments: { account: 'beta@example.com' } })).isError, true);
    const mismatched = await clients[2].callTool({ name: 'gmail_profile', arguments: {} });
    assert.equal(mismatched.isError, true);
    assert.match(mismatched.content[0].text, /identity does not match/);
  } finally { await Promise.all(clients.map(client => client.close())); await fs.rm(root, { recursive: true, force: true }); }
});
