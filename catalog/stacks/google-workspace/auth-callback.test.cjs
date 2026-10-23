const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const scopes = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'];

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

for (const broader of [false, true]) {
  test(`manual OAuth validates state and ${broader ? 'rejects broader grants' : 'persists the exact read-only account'}`, { timeout: 15000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'google-auth-callback-'));
    let child;
    try {
      const port = await availablePort();
      const preload = path.join(root, 'provider.mjs');
      const granted = broader ? [...scopes, 'https://www.googleapis.com/auth/gmail.send'] : scopes;
      await fs.writeFile(preload, `import {google} from ${JSON.stringify(pathToFileURL(require.resolve('googleapis')).href)};
google.auth.OAuth2.prototype.getToken=async()=>({tokens:{access_token:'fixture-access',refresh_token:'fixture-refresh'}});
google.auth.OAuth2.prototype.getTokenInfo=async()=>({scopes:${JSON.stringify(granted)}});
google.gmail=()=>({users:{getProfile:async()=>({data:{emailAddress:'client@example.com'}})}});`);
      await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ currentAccount: 'global@example.com' }));
      child = spawn(process.execPath, ['--import', 'tsx', '--import', preload, 'src/auth.ts', 'client@example.com'], {
        cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
        env: { HOME: root, PATH: process.env.PATH, RUDI_STACK_STATE_DIR: root,
          RUDI_GOOGLE_AUTH_PROFILE: 'mail-calendar-readonly', RUDI_GOOGLE_AUTH_MANUAL: '1', OAUTH_PORT: String(port),
          GOOGLE_CREDENTIALS: JSON.stringify({ installed: { client_id: 'fixture', client_secret: 'fixture' } }) },
      });
      let output = '';
      child.stderr.on('data', data => { output += data; });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Callback server did not start')), 7000);
        child.stdout.on('data', data => {
          output += data;
          if (output.includes('/authorize to sign in.')) { clearTimeout(timer); resolve(); }
        });
        child.once('error', reject);
      });
      const base = `http://127.0.0.1:${port}`;
      const authorize = await fetch(base + '/authorize', { redirect: 'manual' });
      assert.equal(authorize.status, 302);
      const url = new URL(authorize.headers.get('location'));
      assert.deepEqual(url.searchParams.get('scope').split(' '), scopes);
      const state = url.searchParams.get('state');
      assert.match(state, /^[a-f0-9]{64}$/);
      assert.equal((await fetch(base + '/callback?code=fixture&state=wrong')).status, 400);
      const tokenPath = path.join(root, 'accounts/client@example.com/token.json');
      await assert.rejects(fs.access(tokenPath), { code: 'ENOENT' });
      assert.equal((await fetch(base + '/unknown')).status, 404);
      const response = await fetch(base + '/callback?code=fixture&state=' + state);
      assert.equal(response.status, broader ? 500 : 200);
      if (broader) await assert.rejects(fs.access(tokenPath), { code: 'ENOENT' });
      else {
        const token = JSON.parse(await fs.readFile(tokenPath));
        assert.equal(token.account, 'client@example.com');
        assert.deepEqual(token.scopes, scopes);
      }
      assert.equal(JSON.parse(await fs.readFile(path.join(root, 'state.json'))).currentAccount, 'global@example.com');
      assert.doesNotMatch(output, /fixture-access|fixture-refresh/);
    } finally {
      if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
