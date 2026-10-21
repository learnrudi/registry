import { PublicClientApplication } from '@azure/msal-node';
import { SCOPES, SafeError, verifyIdentity } from './contracts.js';
import { GraphClient, readJson } from './graph.js';
import { AccountStore } from './storage.js';

export class Accounts {
  constructor({ store = new AccountStore(), applicationFactory, graphFactory = token => new GraphClient(token) } = {}) {
    this.store = store;
    this.applicationFactory = applicationFactory || createApplication;
    this.graphFactory = graphFactory;
  }

  async authenticate(alias, onCode) {
    const config = await this.store.account(alias);
    return this.store.withLock(alias, async () => {
      // Fresh in-memory cache: a failed or mismatched login never changes the existing credential file.
      const application = this.applicationFactory(config);
      const result = await application.acquireTokenByDeviceCode({ scopes: [...SCOPES], timeout: 900,
        deviceCodeCallback: code => onCode(safeDeviceCode(code)) });
      const graph = this.graphFactory(result?.accessToken);
      const profile = await graph.get('/me', PROFILE_QUERY);
      verifyIdentity(config, result, profile);
      await this.persist(alias, config, application, result);
      return { account: alias, profile, authenticated: true };
    });
  }

  async withAuthorized(alias, operation) {
    const config = await this.store.account(alias);
    const authorized = await this.store.withLock(alias, async () => {
      const saved = await this.store.readCache(alias);
      if (!saved) throw new SafeError('AUTH_REQUIRED', 'Authenticate the named account with the auth CLI first.');
      if (!bindingMatches(saved.binding, config) || typeof saved.cache !== 'string') {
        throw new SafeError('AUTH_REQUIRED', 'Credential binding differs from account configuration; authenticate again.');
      }
      const application = this.applicationFactory(config);
      application.getTokenCache().deserialize(saved.cache);
      const all = await application.getTokenCache().getAllAccounts();
      const selected = all.filter(account => account.homeAccountId === saved.binding.homeAccountId &&
        account.localAccountId === saved.binding.localAccountId && account.tenantId?.toLowerCase() === config.tenantId.toLowerCase() &&
        account.username?.toLowerCase() === config.expectedUsername.toLowerCase());
      if (selected.length !== 1 || all.length !== 1) throw new SafeError('AUTH_REQUIRED', 'Credential account is ambiguous or mismatched; authenticate again.');
      let result;
      try { result = await application.acquireTokenSilent({ account: selected[0], scopes: [...SCOPES] }); }
      catch { throw new SafeError('AUTH_REQUIRED', 'Silent authentication failed; authenticate this named account again.'); }
      const graph = this.graphFactory(result?.accessToken);
      const profile = await graph.get('/me', PROFILE_QUERY);
      verifyIdentity(config, result, profile);
      await this.persist(alias, config, application, result);
      return { graph, profile };
    });
    return operation(authorized.graph, authorized.profile);
  }

  async persist(alias, config, application, result) {
    if (!result.account.homeAccountId) throw new SafeError('IDENTITY', 'Authenticated identity has no stable account identifier.');
    await this.store.writeCache(alias, { version: 1, binding: { ...config,
      homeAccountId: result.account.homeAccountId, localAccountId: result.account.localAccountId }, cache: application.getTokenCache().serialize() });
  }

  async list() {
    const config = await this.store.config();
    return Object.entries(config.accounts).map(([account, value]) => ({ account, expectedUsername: value.expectedUsername, tenantId: value.tenantId }));
  }

  async status(alias) {
    const config = await this.store.account(alias);
    const saved = await this.store.readCache(alias);
    return { account: alias, expectedUsername: config.expectedUsername, tenantId: config.tenantId,
      credential_state: saved && bindingMatches(saved.binding, config) ? 'cached_unverified' : 'authentication_required',
      note: 'Offline status only. outlook_profile verifies the current provider identity.' };
  }
}

const PROFILE_QUERY = Object.freeze({ '$select': 'id,displayName,mail,userPrincipalName' });

function bindingMatches(binding, config) {
  return binding && ['clientId', 'tenantId', 'expectedUsername'].every(key =>
    typeof binding[key] === 'string' && binding[key].toLowerCase() === config[key].toLowerCase());
}

function safeDeviceCode(code) {
  const url = new URL(code.verificationUri);
  const approved = new Set(['https://microsoft.com/devicelogin', 'https://www.microsoft.com/devicelogin',
    'https://login.microsoft.com/device', 'https://login.microsoftonline.com/common/oauth2/deviceauth']);
  if (!approved.has(`${url.origin}${url.pathname}`) || url.search ||
      url.username || url.password || url.port || url.hash ||
      typeof code.userCode !== 'string' || !/^[A-Z0-9-]{4,32}$/i.test(code.userCode) ||
      !Number.isFinite(code.expiresIn) || code.expiresIn <= 0 || code.expiresIn > 1800) {
    throw new SafeError('AUTH', 'Unexpected device sign-in response.');
  }
  return { verificationUri: url.href, userCode: code.userCode, expiresIn: code.expiresIn };
}

function createApplication(config) {
  return new PublicClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}` },
    system: { disableInternalRetries: true, loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
      networkClient: { sendGetRequestAsync: (url, options) => identityRequest('GET', url, options),
        sendPostRequestAsync: (url, options) => identityRequest('POST', url, options) } } });
}

async function identityRequest(method, rawUrl, options = {}) {
  const url = new URL(rawUrl);
  if (url.origin !== 'https://login.microsoftonline.com' || url.username || url.password || url.hash) {
    throw new SafeError('AUTH', 'Unsupported authentication endpoint.');
  }
  try {
    const response = await fetch(url.href, { method, headers: options.headers, body: method === 'POST' ? options.body : undefined,
      redirect: 'error', signal: AbortSignal.timeout(15000) });
    return { headers: Object.fromEntries(response.headers), status: response.status, body: await readJson(response, 1024 * 1024) };
  } catch { throw new SafeError('AUTH', 'Microsoft authentication failed or timed out.'); }
}
