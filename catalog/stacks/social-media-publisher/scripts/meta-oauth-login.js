#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? 'v24.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const LOGIN_BASE_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const DEFAULT_ENV_PATH = path.join(os.homedir(), '.rudi', 'secrets', 'social-media-publisher.env');
const DEFAULT_SECRETS_PATH = path.join(os.homedir(), '.rudi', 'secrets.json');
const DEFAULT_PAGES_CONFIG_PATH = path.join(
  os.homedir(),
  '.rudi',
  'state',
  'stacks',
  'social-media-publisher',
  'platforms',
  'meta',
  'pages-config.json'
);
const DEFAULT_INSTAGRAM_CONFIG_PATH = path.join(
  os.homedir(),
  '.rudi',
  'state',
  'stacks',
  'social-media-publisher',
  'platforms',
  'meta',
  'instagram',
  'instagram-config.json'
);
const DEFAULT_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;

    const key = item.slice(2);
    if (['no-open', 'dry-run', 'json', 'help'].includes(key)) {
      args[key] = true;
      continue;
    }

    args[key] = argv[index + 1];
    index += 1;
  }

  return args;
}

function printHelp() {
  console.log(`
meta-oauth-login

Starts a localhost Meta OAuth callback, opens Meta consent, exchanges the
returned authorization code, fetches Page tokens and linked Instagram accounts,
and updates the social publisher Meta config files.

Options:
  --env-path <path>             Env file to read/update (default: ~/.rudi/secrets/social-media-publisher.env)
  --redirect-uri <uri>          Exact redirect URI registered in Meta (default: http://localhost:3000/auth/meta/callback)
  --pages-config-path <path>    Pages config to update
  --instagram-config-path <path> Instagram config to update
  --scopes "<scopes>"           Space/comma separated Meta permissions
  --timeout-ms <ms>             Login timeout (default: 600000)
  --no-open                     Print the URL instead of opening the browser
  --dry-run                     Print a safe authorization URL preview; do not listen or save
  --json                        Print machine-readable status
`);
}

function parseDotenv(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const raw = match[2];
    if (raw.startsWith('"')) {
      try {
        result[match[1]] = JSON.parse(raw);
      } catch {
        result[match[1]] = raw.slice(1, -1);
      }
    } else {
      result[match[1]] = raw;
    }
  }

  return result;
}

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return parseDotenv(fs.readFileSync(envPath, 'utf8'));
}

function normalizeScopes(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_SCOPES;
  }

  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function assertConfig(config) {
  const missing = ['META_APP_ID', 'META_APP_SECRET'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Meta OAuth config: ${missing.join(', ')}`);
  }
}

function makeState() {
  return crypto.randomBytes(24).toString('base64url');
}

function makeAuthUrl(config, redirectUri, scopes, state) {
  const url = new URL(LOGIN_BASE_URL);
  url.searchParams.set('client_id', config.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(','));
  url.searchParams.set('state', state);
  return url;
}

function openBrowser(url) {
  const opener =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];

  const child = spawn(opener[0], opener[1], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function writeHtml(response, statusCode, title, message) {
  response.writeHead(statusCode, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html>
<html>
  <head><title>${title}</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 32px;">
    <h1>${title}</h1>
    <p>${message.replace(/[<>&]/g, '')}</p>
  </body>
</html>`);
}

function waitForCallback({ redirectUri, state, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const callbackUrl = new URL(redirectUri);
    const host = callbackUrl.hostname;
    const port = Number(callbackUrl.port || (callbackUrl.protocol === 'https:' ? 443 : 80));
    const expectedPath = callbackUrl.pathname || '/';
    let settled = false;

    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', redirectUri);
      if (requestUrl.pathname !== expectedPath) {
        writeHtml(response, 404, 'Not found', 'This local callback path is not handled by the Meta login helper.');
        return;
      }

      const returnedState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');

      if (error) {
        writeHtml(response, 400, 'Meta OAuth failed', error);
        settle(() => reject(new Error(`Meta OAuth returned error: ${error}`)));
        return;
      }

      if (!code || returnedState !== state) {
        writeHtml(response, 400, 'Meta OAuth failed', 'Missing authorization code or invalid state.');
        settle(() => reject(new Error('Meta OAuth callback did not include a valid code/state pair')));
        return;
      }

      writeHtml(response, 200, 'Meta is connected.', 'You can close this tab and return to Codex.');
      settle(() => resolve({ code }));
    });

    const timeout = setTimeout(() => {
      settle(() => reject(new Error('Timed out waiting for Meta OAuth callback')));
    }, timeoutMs);

    function settle(done) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close(() => done());
    }

    server.listen(port, host, () => {
      server.emit('ready');
    });

    server.on('error', (error) => {
      settle(() => reject(error));
    });

    server.once('ready', () => {
      // The promise remains pending until the browser redirects back.
    });
  });
}

async function graphGet(pathname, params) {
  const url = new URL(`${GRAPH_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message ?? data.error?.type ?? 'unknown_error';
    throw new Error(`Meta Graph API request failed (${response.status}): ${message}`);
  }

  return data;
}

async function exchangeCode(config, redirectUri, code) {
  return graphGet('/oauth/access_token', {
    client_id: config.META_APP_ID,
    client_secret: config.META_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });
}

async function exchangeLongLivedUserToken(config, shortLivedToken) {
  return graphGet('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: config.META_APP_ID,
    client_secret: config.META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
}

async function fetchAllPages(userAccessToken) {
  const pages = [];
  let nextUrl = null;
  let data = await graphGet('/me/accounts', {
    fields: 'id,name,category,access_token,instagram_business_account{id,username}',
    limit: '100',
    access_token: userAccessToken,
  });

  while (true) {
    if (Array.isArray(data.data)) {
      pages.push(...data.data);
    }

    nextUrl = data.paging?.next;
    if (!nextUrl) break;

    const response = await fetch(nextUrl);
    data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message ?? data.error?.type ?? 'unknown_error';
      throw new Error(`Meta Page pagination failed (${response.status}): ${message}`);
    }
  }

  return pages;
}

function readJsonObject(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
}

function mergePagesConfig(filePath, pages) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const config = readJsonObject(filePath, { pages: [] });
  const existingPages = Array.isArray(config.pages) ? config.pages : [];
  const byId = new Map(existingPages.map((page) => [String(page.page_id), { ...page }]));

  for (const page of pages) {
    if (!page.id || !page.access_token) continue;

    const existing = byId.get(String(page.id)) ?? {};
    byId.set(String(page.id), {
      ...existing,
      name: page.name ?? existing.name ?? `Page ${page.id}`,
      page_id: String(page.id),
      category: page.category ?? existing.category,
      access_token: page.access_token,
      active: typeof existing.active === 'boolean' ? existing.active : true,
    });
  }

  const next = { ...config, pages: Array.from(byId.values()) };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort permission repair.
  }

  return next.pages.filter((page) => page.access_token).length;
}

function mergeInstagramConfig(filePath, pages) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const config = readJsonObject(filePath, { accounts: [] });
  const existingAccounts = Array.isArray(config.accounts) ? config.accounts : [];
  const byId = new Map(existingAccounts.map((account) => [String(account.instagram_account_id), { ...account }]));

  for (const page of pages) {
    const instagram = page.instagram_business_account;
    if (!instagram?.id || !page.access_token) continue;

    const existing = byId.get(String(instagram.id)) ?? {};
    byId.set(String(instagram.id), {
      ...existing,
      facebook_page_name: page.name ?? existing.facebook_page_name ?? `Page ${page.id}`,
      facebook_page_id: String(page.id),
      instagram_username: instagram.username ?? existing.instagram_username ?? '',
      instagram_account_id: String(instagram.id),
      access_token: page.access_token,
      active: typeof existing.active === 'boolean' ? existing.active : true,
    });
  }

  const next = { ...config, accounts: Array.from(byId.values()) };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort permission repair.
  }

  return next.accounts.filter((account) => account.access_token).length;
}

function writeStackEnv(envPath, values) {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !(match[1] in values)) return line;
    seen.add(match[1]);
    return `${match[1]}=${JSON.stringify(values[match[1]])}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (value && !seen.has(key)) {
      nextLines.push(`${key}=${JSON.stringify(value)}`);
    }
  }

  fs.writeFileSync(
    envPath,
    `${nextLines.filter((line, index) => index < nextLines.length - 1 || line.length > 0).join('\n')}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );

  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Best-effort permission repair.
  }
}

function writeRudiSecrets(secretsPath, values) {
  fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
  const current = fs.existsSync(secretsPath) ? JSON.parse(fs.readFileSync(secretsPath, 'utf8')) : {};
  const next = { ...current, ...values };
  const tempPath = `${secretsPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, secretsPath);
  try {
    fs.chmodSync(secretsPath, 0o600);
  } catch {
    // Best-effort permission repair.
  }
}

function output(payload, json) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Meta OAuth ${payload.status}`);
  if (payload.authUrl) console.log(`Auth URL: ${payload.authUrl}`);
  if (payload.savedKeys) console.log(`Saved keys: ${payload.savedKeys.join(', ')}`);
  if (payload.pagesConfigured !== undefined) console.log(`Facebook pages configured: ${payload.pagesConfigured}`);
  if (payload.instagramAccountsConfigured !== undefined) {
    console.log(`Instagram accounts configured: ${payload.instagramAccountsConfigured}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const envPath = args['env-path'] ? path.resolve(args['env-path']) : DEFAULT_ENV_PATH;
  const pagesConfigPath = args['pages-config-path'] ? path.resolve(args['pages-config-path']) : DEFAULT_PAGES_CONFIG_PATH;
  const instagramConfigPath = args['instagram-config-path']
    ? path.resolve(args['instagram-config-path'])
    : DEFAULT_INSTAGRAM_CONFIG_PATH;
  const envFile = readEnvFile(envPath);
  const config = {
    ...envFile,
    ...process.env,
  };
  const redirectUri = args['redirect-uri'] ?? config.META_REDIRECT_URI ?? 'http://localhost:3000/auth/meta/callback';
  const scopes = normalizeScopes(args.scopes ?? config.META_SCOPES);
  const timeoutMs = Number(args['timeout-ms'] ?? 600_000);
  const state = makeState();

  assertConfig(config);

  const authUrl = makeAuthUrl(config, redirectUri, scopes, state).toString();
  if (args['dry-run']) {
    output(
      {
        status: 'dry_run',
        authUrl,
        redirectUri,
        scopes,
      },
      args.json
    );
    return;
  }

  const callbackPromise = waitForCallback({ redirectUri, state, timeoutMs });
  if (!args['no-open']) {
    openBrowser(authUrl);
  }

  output(
    {
      status: 'waiting_for_browser_login',
      authUrl: args['no-open'] ? authUrl : undefined,
      redirectUri,
      scopes,
    },
    args.json
  );

  const { code } = await callbackPromise;
  const shortLived = await exchangeCode(config, redirectUri, code);
  if (typeof shortLived.access_token !== 'string' || shortLived.access_token.length === 0) {
    throw new Error('Meta OAuth code exchange did not return access_token');
  }

  const longLived = await exchangeLongLivedUserToken(config, shortLived.access_token);
  const userAccessToken = longLived.access_token ?? shortLived.access_token;
  if (typeof userAccessToken !== 'string' || userAccessToken.length === 0) {
    throw new Error('Meta long-lived token exchange did not return access_token');
  }

  const pages = await fetchAllPages(userAccessToken);
  const pagesConfigured = mergePagesConfig(pagesConfigPath, pages);
  const instagramAccountsConfigured = mergeInstagramConfig(instagramConfigPath, pages);
  const values = {
    META_APP_ID: config.META_APP_ID,
    META_APP_SECRET: config.META_APP_SECRET,
    META_REDIRECT_URI: redirectUri,
    META_SCOPES: scopes.join(' '),
    META_USER_ACCESS_TOKEN: userAccessToken,
  };

  writeStackEnv(envPath, values);
  writeRudiSecrets(DEFAULT_SECRETS_PATH, values);

  output(
    {
      status: 'complete',
      savedKeys: Object.keys(values),
      pagesConfigured,
      instagramAccountsConfigured,
      pagesDiscovered: pages.length,
      pagesConfigPath,
      instagramConfigPath,
    },
    args.json
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
