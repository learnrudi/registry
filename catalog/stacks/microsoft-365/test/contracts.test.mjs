import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, verifyIdentity } from '../src/contracts.js';

const config = {
  clientId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  expectedUsername: 'reader@example.com',
};

test('an account is not accepted without explicit tenant and expected identity', () => {
  assert.throws(() => validateConfig({ accounts: { reader: { clientId: config.clientId } } }), /tenantId/);
});

test('configuration rejects hidden permission/endpoint overrides instead of persisting them', () => {
  assert.throws(() => validateConfig({ accounts: { reader: { ...config, scopes: ['Mail.Send'] } } }), /fields/);
  assert.throws(() => validateConfig({ accounts: { reader: config }, graphUrl: 'https://other.example' }), /fields/);
});

export { config };

test('credentials from a wrong tenant or mailbox never pass identity verification', () => {
  const result = { tenantId: config.tenantId, account: { username: config.expectedUsername, tenantId: config.tenantId, localAccountId: 'user-id' }, scopes: ['User.Read', 'Mail.Read'] };
  const profile = { id: 'user-id', mail: config.expectedUsername, userPrincipalName: config.expectedUsername };
  assert.equal(verifyIdentity(config, result, profile), profile);
  assert.throws(() => verifyIdentity(config, { ...result, tenantId: config.clientId }, profile), /identity/);
  assert.throws(() => verifyIdentity(config, result, { ...profile, id: 'other-id' }), /identity/);
  assert.throws(() => verifyIdentity(config, result, { ...profile, mail: 'other@example.com', userPrincipalName: 'other@example.com' }), /identity/);
  assert.throws(() => verifyIdentity(config, { ...result, scopes: [...result.scopes, 'Mail.ReadWrite'] }, profile), /permissions/);
});
