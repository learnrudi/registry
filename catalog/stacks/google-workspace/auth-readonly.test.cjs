const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

async function probeAuth(profile) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'google-readonly-auth-'));
  try {
    const preload = path.join(root, 'provider.mjs');
    await fs.writeFile(preload, `import {google} from ${JSON.stringify(pathToFileURL(require.resolve('googleapis')).href)};
google.auth.OAuth2.prototype.generateAuthUrl = function(options) {
  console.log('AUTH_OPTIONS:' + JSON.stringify(options)); process.exit(0);
};`);
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', '--import', preload, 'src/auth.ts', 'client@example.com'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'],
      env: { HOME: root, PATH: process.env.PATH, RUDI_STACK_STATE_DIR: root,
        ...(profile === undefined ? {} : { RUDI_GOOGLE_AUTH_PROFILE: profile }),
        GOOGLE_CREDENTIALS: JSON.stringify({ installed: { client_id: 'fixture', client_secret: 'fixture' } }) },
    });
    return JSON.parse(stdout.split('\n').find(line => line.startsWith('AUTH_OPTIONS:')).slice(13));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('read-only sign-in requests only Gmail and Calendar reads without combining prior grants', async () => {
  const options = await probeAuth('mail-calendar-readonly');
  assert.deepEqual(options.scope, ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly']);
  assert.equal(options.include_granted_scopes, false);
  assert.equal(options.login_hint, 'client@example.com');
});

test('standard sign-in requests filter settings while the read-only profile remains narrow', async () => {
  const options = await probeAuth(undefined);
  assert.ok(options.scope.includes('https://www.googleapis.com/auth/gmail.settings.basic'));
  assert.ok(options.scope.includes('https://www.googleapis.com/auth/gmail.modify'));
});

test('misspelled auth profile refuses authorization instead of falling back to broad access', async () => {
  await assert.rejects(probeAuth('mail-calendar-readonyl'), /Unknown Google auth profile/);
});

test('read-only token acceptance rejects broader or incomplete provider grants', async () => {
  const { assertReadOnlyAuthGrant } = await import('./src/authGrant.ts');
  const required = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'];
  assert.throws(() => assertReadOnlyAuthGrant([...required, 'https://www.googleapis.com/auth/gmail.send'], required), /read-only scopes/);
  assert.throws(() => assertReadOnlyAuthGrant([required[0]], required), /read-only scopes/);
  assert.throws(() => assertReadOnlyAuthGrant(undefined, required), /read-only scopes/);
  assert.doesNotThrow(() => assertReadOnlyAuthGrant([...required].reverse(), required));
});
