#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../src/config/env.js';
import { makeDatabasePool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import {
  importTwitterOAuth2Token,
  importTwitterToken,
  TWITTER_OAUTH2_SCOPES,
  TWITTER_SCOPES,
} from '../src/domain/import-twitter-token.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({
  path: path.join(repoRoot, 'platforms/twitter/.env'),
  quiet: true,
  override: false,
});

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function main() {
  const appKey = readEnv('TWITTER_API_KEY');
  const appSecret = readEnv('TWITTER_API_SECRET');
  const accessToken = readEnv('TWITTER_ACCESS_TOKEN');
  const accessSecret = readEnv('TWITTER_ACCESS_SECRET');
  const oauth2AccessToken = readEnv('TWITTER_OAUTH2_ACCESS_TOKEN');
  const oauth2RefreshToken = readEnv('TWITTER_OAUTH2_REFRESH_TOKEN');

  if ((!accessToken || !accessSecret) && !oauth2AccessToken) {
    console.log(JSON.stringify({
      event: 'twitter_token_import_skipped',
      reason: 'local_twitter_env_is_tokenless',
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

  const pool = makeDatabasePool(databaseUrl, {
    ...config,
    serviceName: `${config.serviceName}-import-twitter`,
    dbPoolMax: 1,
  });

  try {
    const result = await withTransaction(pool, (client) => {
      if (oauth2AccessToken) {
        return importTwitterOAuth2Token(client, {
          config,
          accessToken: oauth2AccessToken,
          refreshToken: oauth2RefreshToken,
          scopes: TWITTER_OAUTH2_SCOPES,
          importedFrom: 'platforms/twitter/.env',
        });
      }

      return importTwitterToken(client, {
        config,
        appKey,
        appSecret,
        accessToken,
        accessSecret,
        scopes: TWITTER_SCOPES,
        importedFrom: 'platforms/twitter/.env',
      });
    });

    console.log(JSON.stringify({
      event: oauth2AccessToken ? 'twitter_oauth2_token_imported' : 'twitter_token_imported',
      organization_id: result.organization.id,
      connection_id: result.connection.id,
      asset_id: result.asset.id,
      platform_asset_id: result.asset.platform_asset_id,
      handle: result.asset.handle,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
