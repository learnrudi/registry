export class SafeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SafeError';
    this.code = code;
  }
}

export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.accounts ||
      typeof value.accounts !== 'object' || Array.isArray(value.accounts)) {
    throw new SafeError('CONFIG', 'Configuration requires an accounts object.');
  }
  if (Object.keys(value).some(key => key !== 'accounts') || Object.keys(value.accounts).length > 20) {
    throw new SafeError('CONFIG', 'Configuration supports only accounts fields and at most 20 accounts.');
  }
  for (const [alias, account] of Object.entries(value.accounts)) {
    accountAlias(alias);
    if (!account || typeof account !== 'object') throw new SafeError('CONFIG', 'Invalid account configuration.');
    if (Object.keys(account).some(key => !['clientId', 'tenantId', 'expectedUsername'].includes(key))) {
      throw new SafeError('CONFIG', 'Account supports only clientId, tenantId and expectedUsername fields.');
    }
    for (const key of ['clientId', 'tenantId']) {
      if (typeof account[key] !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(account[key])) {
        throw new SafeError('CONFIG', `${key} must be an explicit UUID.`);
      }
    }
    if (typeof account.expectedUsername !== 'string' ||
        !/^[^\s@]{1,128}@[^\s@]{1,128}$/.test(account.expectedUsername)) {
      throw new SafeError('CONFIG', 'expectedUsername must be an explicit sign-in email.');
    }
  }
  return value;
}

export function accountAlias(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) {
    throw new SafeError('INPUT', 'account must be a configured lowercase alias.');
  }
  return value;
}

export function verifyIdentity(config, result, profile) {
  const expected = config.expectedUsername.toLowerCase();
  if (!result?.account || result.tenantId?.toLowerCase() !== config.tenantId.toLowerCase() ||
      result.account.tenantId?.toLowerCase() !== config.tenantId.toLowerCase() ||
      result.account.username?.toLowerCase() !== expected ||
      typeof profile?.id !== 'string' || !profile.id || result.account.localAccountId !== profile.id ||
      ![profile.mail, profile.userPrincipalName].some(value => typeof value === 'string' && value.toLowerCase() === expected)) {
    throw new SafeError('IDENTITY', 'Authenticated identity does not match the configured tenant and mailbox.');
  }
  const scopes = (result.scopes ?? []).map(scope => scope.toLowerCase().replace(/^https:\/\/graph.microsoft.com\//, ''));
  const allowed = new Set(['user.read', 'mail.read', 'offline_access', 'openid', 'profile', 'email']);
  if (!scopes.includes('user.read') || !scopes.includes('mail.read') || scopes.some(scope => !allowed.has(scope))) {
    throw new SafeError('PERMISSIONS', 'Token permissions must be limited to User.Read, Mail.Read and sign-in scopes.');
  }
  return profile;
}

export const SCOPES = Object.freeze(['User.Read', 'Mail.Read', 'offline_access']);

export function publicError(error) {
  return error instanceof SafeError ? { code: error.code, message: error.message } :
    { code: 'UNAVAILABLE', message: 'Operation failed. Check configuration, account authorization and service availability.' };
}
