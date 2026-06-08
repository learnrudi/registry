#!/usr/bin/env node

import dotenv from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../src/config/env.js';
import { makeDatabasePool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import { importYouTubeToken } from '../src/domain/import-youtube-token.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultOauthPath = path.join(repoRoot, 'platforms/youtube/config/oauth2.json');

dotenv.config({
  path: path.join(repoRoot, 'platforms/youtube/.env'),
  quiet: true,
  override: false,
});

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function main() {
  const oauthPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultOauthPath;
  const oauth = await readJsonIfExists(oauthPath);

  if (!oauth?.refresh_token) {
    console.log(JSON.stringify({
      event: 'youtube_token_import_skipped',
      reason: 'local_youtube_oauth_file_is_missing_refresh_token',
    }));
    return;
  }

  const config = getConfig();
  const databaseUrl = config.databaseUrl ?? config.directDatabaseUrl;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_DATABASE_URL is required');
  }

  if (!config.tokenEncryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required');
  }

  const clientId = readEnv('GOOGLE_CLIENT_ID') ?? oauth.client_id;
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET') ?? oauth.client_secret;
  const tokenUri = oauth.token_uri ?? 'https://oauth2.googleapis.com/token';
  const scopes = Array.isArray(oauth.scopes) ? oauth.scopes : undefined;
  const pool = makeDatabasePool(databaseUrl, {
    ...config,
    serviceName: `${config.serviceName}-import-youtube`,
    dbPoolMax: 1,
  });

  try {
    const result = await withTransaction(pool, (client) => importYouTubeToken(client, {
      config,
      refreshToken: oauth.refresh_token,
      clientId,
      clientSecret,
      tokenUri,
      scopes,
      importedFrom: path.relative(repoRoot, oauthPath),
    }));

    console.log(JSON.stringify({
      event: 'youtube_token_imported',
      organization_id: result.organization.id,
      connection_id: result.connection.id,
      asset_id: result.asset.id,
      platform_asset_id: result.asset.platform_asset_id,
      channel_name: result.asset.name,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
