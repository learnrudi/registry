const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('every account override rejects traversal before credential lookup', async () => {
  const { resolveRequestedAccount } = await import('./src/gmail.ts');
  for (const account of ['..', '../a@example.com', '/tmp/a@example.com', 'a\\b@example.com']) {
    assert.throws(() => resolveRequestedAccount({ account }, null));
    assert.throws(() => resolveRequestedAccount(undefined, account));
  }
  assert.equal(resolveRequestedAccount({ account: ' User@Example.com ' }, null), 'user@example.com');
});

test('runtime inventory preserves valid accounts and rejects missing, redirected, or mismatched credentials', async () => {
  const { listStoredGoogleAccounts, readStoredGoogleToken } = await import('./src/accountStorage.ts');
  const { loadGoogleCredentials } = await import('./src/oauthCredentials.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'google-account-boundary-'));
  const accounts = path.join(root, 'accounts');
  fs.mkdirSync(accounts);
  const add = (name, token) => { fs.mkdirSync(path.join(accounts, name)); fs.writeFileSync(path.join(accounts, name, 'token.json'), JSON.stringify(token)); };
  try {
    add('user@example.com', { account: 'USER@example.com', refresh_token: 'fake' });
    add('legacy@example.com', { refresh_token: 'fake-legacy' });
    add('mismatch@example.com', { account: 'different@example.com' });
    fs.mkdirSync(path.join(root, 'outside'));
    fs.writeFileSync(path.join(root, 'outside', 'token.json'), '{}');
    fs.symlinkSync(path.join(root, 'outside'), path.join(accounts, 'linked@example.com'));
    add('token-link@example.com', {});
    fs.unlinkSync(path.join(accounts, 'token-link@example.com', 'token.json'));
    fs.symlinkSync(path.join(root, 'outside', 'token.json'), path.join(accounts, 'token-link@example.com', 'token.json'));
    assert.deepEqual(listStoredGoogleAccounts(accounts).sort(), ['legacy@example.com', 'user@example.com']);
    assert.equal(readStoredGoogleToken(accounts, 'USER@example.com').refresh_token, 'fake');
    assert.equal(readStoredGoogleToken(accounts, 'legacy@example.com').refresh_token, 'fake-legacy');
    for (const name of ['missing@example.com', 'linked@example.com', 'token-link@example.com', 'mismatch@example.com', '..']) assert.throws(() => readStoredGoogleToken(accounts, name));
    fs.symlinkSync(path.join(root, 'outside', 'token.json'), path.join(accounts, 'user@example.com', 'credentials.json'));
    const previous = process.env.GOOGLE_CREDENTIALS;
    delete process.env.GOOGLE_CREDENTIALS;
    try { assert.throws(() => loadGoogleCredentials({ accountsDir: accounts }, 'user@example.com')); }
    finally { if (previous != null) process.env.GOOGLE_CREDENTIALS = previous; }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
