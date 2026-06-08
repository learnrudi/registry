#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_ENV_PATH = path.join(os.homedir(), '.rudi', 'secrets', 'social-media-publisher.env');
const DEFAULT_SECRETS_PATH = path.join(os.homedir(), '.rudi', 'secrets.json');
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
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
youtube-oauth-login

Starts a localhost OAuth callback, opens Google consent, exchanges the returned
authorization code, and stores YOUTUBE_REFRESH_TOKEN for the social publisher.

Options:
  --client-secret-json <path>  Optional downloaded Google OAuth desktop client JSON
  --env-path <path>            Env file to update (default: ~/.rudi/secrets/social-media-publisher.env)
  --host <host>                Loopback host (default: 127.0.0.1)
  --port <port>                Callback port (default: random available port)
  --scopes "<scopes>"          Space/comma separated scopes
  --timeout-ms <ms>            Login timeout (default: 600000)
  --no-open                    Print the URL instead of opening the browser
  --dry-run                    Print a safe authorization URL preview; do not listen or save
  --json                       Print machine-readable status
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

function readClientSecretJson(filePath) {
  if (!filePath) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  const config = parsed.installed ?? parsed.web;
  if (!config || typeof config !== 'object') {
    throw new Error('Google client secret JSON must contain an installed or web object');
  }

  return {
    GOOGLE_CLIENT_ID: config.client_id,
    GOOGLE_CLIENT_SECRET: config.client_secret,
    YOUTUBE_TOKEN_URI: config.token_uri,
  };
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
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Google OAuth config: ${missing.join(', ')}`);
  }
}

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makePkcePair() {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function makeAuthUrl(config, redirectUri, scopes, state, codeChallenge) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', config.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
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

function writeSuccessPage(response) {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html>
<html>
  <head><title>YouTube OAuth Complete</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 32px;">
    <h1>YouTube is connected.</h1>
    <p>You can close this tab and return to Codex.</p>
  </body>
</html>`);
}

function writeFailurePage(response, message) {
  response.writeHead(400, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html>
<html>
  <head><title>YouTube OAuth Failed</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 32px;">
    <h1>YouTube OAuth failed.</h1>
    <p>${message.replace(/[<>&]/g, '')}</p>
  </body>
</html>`);
}

function waitForCallback({ host, port, state, timeoutMs, onReady }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let redirectUri;
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', `http://${host}`);
      const returnedState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');

      if (error) {
        writeFailurePage(response, error);
        settle(() => reject(new Error(`Google OAuth returned error: ${error}`)));
        return;
      }

      if (!code || returnedState !== state) {
        writeFailurePage(response, 'Missing authorization code or invalid state.');
        settle(() => reject(new Error('OAuth callback did not include a valid code/state pair')));
        return;
      }

      writeSuccessPage(response);
      settle(() => resolve({ code, redirectUri }));
    });

    const timeout = setTimeout(() => {
      settle(() => reject(new Error('Timed out waiting for Google OAuth callback')));
    }, timeoutMs);

    function settle(done) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close(() => done());
    }

    server.listen(port, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        settle(() => reject(new Error('Could not determine OAuth callback address')));
        return;
      }

      redirectUri = `http://${host}:${address.port}`;
      onReady(redirectUri);
    });

    server.on('error', (error) => {
      settle(() => reject(error));
    });

  });
}

async function exchangeCode({ config, code, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    client_secret: config.GOOGLE_CLIENT_SECRET,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch(config.YOUTUBE_TOKEN_URI ?? DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const codeOrMessage = data.error_description ?? data.error ?? 'unknown_error';
    throw new Error(`Google token exchange failed (${response.status}): ${codeOrMessage}`);
  }

  if (typeof data.refresh_token !== 'string' || data.refresh_token.length === 0) {
    throw new Error('Google did not return a refresh token. Re-run login and approve consent for offline access.');
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
    // Best-effort permission repair; write mode handles new files.
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
    // Best-effort permission repair; write mode handles new files.
  }
}

function output(payload, json) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`YouTube OAuth ${payload.status}`);
  if (payload.authUrl) console.log(`Auth URL: ${payload.authUrl}`);
  if (payload.savedKeys) console.log(`Saved keys: ${payload.savedKeys.join(', ')}`);
  if (payload.envPath) console.log(`Env file: ${payload.envPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const envPath = args['env-path'] ? path.resolve(args['env-path']) : DEFAULT_ENV_PATH;
  const envFile = readEnvFile(envPath);
  const clientJson = readClientSecretJson(args['client-secret-json']);
  const config = {
    ...envFile,
    ...process.env,
    ...clientJson,
  };
  const scopes = normalizeScopes(args.scopes ?? config.YOUTUBE_SCOPES);
  const host = args.host ?? '127.0.0.1';
  const port = Number(args.port ?? (args['dry-run'] ? 53682 : 0));
  const timeoutMs = Number(args['timeout-ms'] ?? 600_000);
  const state = base64Url(crypto.randomBytes(24));
  const pkce = makePkcePair();

  assertConfig(config);

  const dryRunRedirectUri = `http://${host}:${port}`;
  if (args['dry-run']) {
    output(
      {
        status: 'dry_run',
        authUrl: makeAuthUrl(config, dryRunRedirectUri, scopes, state, pkce.challenge).toString(),
        redirectUri: dryRunRedirectUri,
        scopes,
      },
      args.json
    );
    return;
  }

  const callbackPromise = waitForCallback({
    host,
    port,
    state,
    timeoutMs,
    onReady: (redirectUri) => {
      const authUrl = makeAuthUrl(config, redirectUri, scopes, state, pkce.challenge).toString();
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
    },
  });

  const { code, redirectUri } = await callbackPromise;
  const tokens = await exchangeCode({
    config,
    code,
    redirectUri,
    codeVerifier: pkce.verifier,
  });

  const values = {
    GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET,
    YOUTUBE_REFRESH_TOKEN: tokens.refresh_token,
    YOUTUBE_TOKEN_URI: config.YOUTUBE_TOKEN_URI ?? DEFAULT_TOKEN_URI,
    YOUTUBE_SCOPES: scopes.join(' '),
  };

  writeStackEnv(envPath, values);
  writeRudiSecrets(DEFAULT_SECRETS_PATH, values);

  output(
    {
      status: 'complete',
      savedKeys: Object.keys(values),
      envPath,
      secretsPath: DEFAULT_SECRETS_PATH,
      scopes,
      accessTokenReturned: typeof tokens.access_token === 'string',
      expiresInSeconds: tokens.expires_in ?? null,
    },
    args.json
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
