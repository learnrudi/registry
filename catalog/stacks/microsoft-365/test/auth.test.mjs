import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../src/auth.js';

const config = { clientId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', expectedUsername: 'reader@example.com' };
const result = { accessToken: 'TOKEN', tenantId: config.tenantId, account: { username: config.expectedUsername, tenantId: config.tenantId, localAccountId: 'user-id', homeAccountId: 'home-id' }, scopes: ['User.Read', 'Mail.Read'] };

test('device authentication never persists credentials when Graph identity differs', async () => {
  let writes = 0;
  const accounts = new Accounts({
    store: { account: async () => config, writeCache: async () => { writes++; }, withLock: async (_alias, run) => run() },
    applicationFactory: () => ({ acquireTokenByDeviceCode: async () => result, getTokenCache: () => ({ serialize: () => 'CACHE' }) }),
    graphFactory: () => ({ get: async () => ({ id: 'wrong-id', mail: 'other@example.com' }) }),
  });
  await assert.rejects(accounts.authenticate('reader', () => {}), /identity/);
  assert.equal(writes, 0);
});

export { config, result };

test('official login.microsoft.com/device sign-in projects only safe user fields', async () => {
  let shown;
  let saved;
  const accounts = new Accounts({
    store: { account: async () => config, writeCache: async (_alias, data) => { saved = data; }, withLock: async (_alias, run) => run() },
    applicationFactory: () => ({ acquireTokenByDeviceCode: async request => {
      request.deviceCodeCallback({ verificationUri: 'https://login.microsoft.com/device', userCode: 'ABCD-EFGH', expiresIn: 900,
        deviceCode: 'PRIVATE-DEVICE-CODE', message: 'raw provider message' });
      return result;
    }, getTokenCache: () => ({ serialize: () => 'CACHE' }) }),
    graphFactory: () => ({ get: async () => ({ id: 'user-id', mail: config.expectedUsername }) }),
  });
  await accounts.authenticate('reader', code => { shown = code; });
  assert.deepEqual(shown, { verificationUri: 'https://login.microsoft.com/device', userCode: 'ABCD-EFGH', expiresIn: 900 });
  assert.equal(saved.binding.clientId, config.clientId);
});

test('silent credentials are bound to client, tenant and expected identity before MSAL use', async () => {
  let applications = 0;
  for (const key of ['clientId', 'tenantId', 'expectedUsername']) {
    const accounts = new Accounts({ store: { account: async () => config,
      readCache: async () => ({ binding: { ...config, [key]: 'changed' }, cache: 'CACHE' }),
      withLock: async (_alias, run) => run() }, applicationFactory: () => { applications++; } });
    await assert.rejects(accounts.withAuthorized('reader', () => {}), /binding/);
  }
  assert.equal(applications, 0);
});

test('silent refresh rechecks identity and permissions before persisting or returning mail', async () => {
  let writes = 0;
  let reads = 0;
  const saved = { binding: { ...config, homeAccountId: 'home-id', localAccountId: 'user-id' }, cache: 'CACHE' };
  const refreshed = { ...result };
  const accounts = new Accounts({ store: { account: async () => config, readCache: async () => saved,
    writeCache: async () => { writes++; }, withLock: async (_alias, run) => run() },
    applicationFactory: () => ({ getTokenCache: () => ({ deserialize: () => {}, serialize: () => 'NEW', getAllAccounts: async () => [result.account] }),
      acquireTokenSilent: async () => refreshed }), graphFactory: () => ({ get: async () => ({ id: 'user-id', mail: config.expectedUsername }) }) });
  assert.equal(await accounts.withAuthorized('reader', () => { reads++; return 'verified'; }), 'verified');
  assert.equal(writes, 1);
  refreshed.scopes = [...result.scopes, 'Mail.Send'];
  await assert.rejects(accounts.withAuthorized('reader', () => { reads++; }), /permissions/);
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});
