#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const DEFAULT_TOKEN_URI = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const DEFAULT_ENV_PATH = path.join(os.homedir(), '.rudi', 'secrets', 'social-media-publisher.env');
const DEFAULT_SECRETS_PATH = path.join(os.homedir(), '.rudi', 'secrets.json');
const DEFAULT_SCOPES = ['openid', 'profile', 'w_member_social', 'email'];

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
linkedin-oauth-login

Starts a localhost LinkedIn OAuth callback, opens LinkedIn consent, exchanges the
returned authorization code, validates /v2/userinfo, and stores LINKEDIN_ACCESS_TOKEN.

Options:
  --env-path <path>       Env file to read/update (default: ~/.rudi/secrets/social-media-publisher.env)
  --redirect-uri <uri>    Exact redirect URI registered in LinkedIn (default: LINKEDIN_REDIRECT_URI or http://localhost:3000/auth/linkedin/callback)
  --scopes "<scopes>"     Space/comma separated LinkedIn scopes
  --timeout-ms <ms>       Login timeout (default: 600000)
  --no-open               Print the URL instead of opening the browser
  --dry-run               Print a safe authorization URL preview; do not listen or save
  --json                  Print machine-readable status
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
  const missing = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required LinkedIn OAuth config: ${missing.join(', ')}`);
  }
}

function makeState() {
  return crypto.randomBytes(24).toString('base64url');
}

function makeAuthUrl(config, redirectUri, scopes, state) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.LINKEDIN_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scopes.join(' '));
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
        writeHtml(response, 404, 'Not found', 'This local callback path is not handled by the LinkedIn login helper.');
        return;
      }

      const returnedState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');

      if (error) {
        writeHtml(response, 400, 'LinkedIn OAuth failed', error);
        settle(() => reject(new Error(`LinkedIn OAuth returned error: ${error}`)));
        return;
      }

      if (!code || returnedState !== state) {
        writeHtml(response, 400, 'LinkedIn OAuth failed', 'Missing authorization code or invalid state.');
        settle(() => reject(new Error('LinkedIn OAuth callback did not include a valid code/state pair')));
        return;
      }

      writeHtml(response, 200, 'LinkedIn is connected.', 'You can close this tab and return to Codex.');
      settle(() => resolve({ code }));
    });

    const timeout = setTimeout(() => {
      settle(() => reject(new Error('Timed out waiting for LinkedIn OAuth callback')));
    }, timeoutMs);

    function settle(done) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close(() => done());
    }

    server.listen(port, host);
    server.on('error', (error) => {
      settle(() => reject(error));
    });
  });
}

async function exchangeCode(config, redirectUri, code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET,
  });

  const response = await fetch(config.LINKEDIN_TOKEN_URI ?? DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description ?? data.error ?? 'unknown_error';
    throw new Error(`LinkedIn token exchange failed (${response.status}): ${message}`);
  }

  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new Error('LinkedIn token exchange did not return access_token');
  }

  return data;
}

async function fetchUserInfo(accessToken) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.message ?? data.error_description ?? data.code ?? 'unknown_error';
    throw new Error(`LinkedIn userinfo validation failed (${response.status}): ${message}`);
  }

  if (typeof data.sub !== 'string' || data.sub.length === 0) {
    throw new Error('LinkedIn userinfo response did not include sub');
  }

  return data;
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

  console.log(`LinkedIn OAuth ${payload.status}`);
  if (payload.authUrl) console.log(`Auth URL: ${payload.authUrl}`);
  if (payload.savedKeys) console.log(`Saved keys: ${payload.savedKeys.join(', ')}`);
  if (payload.profile) console.log(`Profile: ${payload.profile}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const envPath = args['env-path'] ? path.resolve(args['env-path']) : DEFAULT_ENV_PATH;
  const envFile = readEnvFile(envPath);
  const config = {
    ...envFile,
    ...process.env,
  };
  const redirectUri =
    args['redirect-uri'] ?? config.LINKEDIN_REDIRECT_URI ?? 'http://localhost:3000/auth/linkedin/callback';
  const scopes = normalizeScopes(args.scopes ?? config.LINKEDIN_SCOPES);
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
  const tokenResponse = await exchangeCode(config, redirectUri, code);
  const userInfo = await fetchUserInfo(tokenResponse.access_token);
  const expiresAt =
    typeof tokenResponse.expires_in === 'number'
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : undefined;
  const values = {
    LINKEDIN_CLIENT_ID: config.LINKEDIN_CLIENT_ID,
    LINKEDIN_CLIENT_SECRET: config.LINKEDIN_CLIENT_SECRET,
    LINKEDIN_REDIRECT_URI: redirectUri,
    LINKEDIN_SCOPES: scopes.join(' '),
    LINKEDIN_ACCESS_TOKEN: tokenResponse.access_token,
    LINKEDIN_ACCESS_TOKEN_EXPIRES_AT: expiresAt,
    LINKEDIN_TOKEN_URI: config.LINKEDIN_TOKEN_URI ?? DEFAULT_TOKEN_URI,
  };

  if (typeof tokenResponse.refresh_token === 'string' && tokenResponse.refresh_token.length > 0) {
    values.LINKEDIN_REFRESH_TOKEN = tokenResponse.refresh_token;
  }

  writeStackEnv(envPath, values);
  writeRudiSecrets(DEFAULT_SECRETS_PATH, values);

  output(
    {
      status: 'complete',
      savedKeys: Object.keys(values),
      profile: userInfo.name ?? userInfo.sub,
      expiresAt,
      refreshTokenReturned: Boolean(values.LINKEDIN_REFRESH_TOKEN),
    },
    args.json
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
