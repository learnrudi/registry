#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../src/config/env.js';
import { makeDatabasePool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import { importLinkedInToken, LINKEDIN_SCOPES } from '../src/domain/import-linkedin-token.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({
  path: path.join(repoRoot, 'platforms/linkedin/.env'),
  quiet: true,
  override: false,
});

function readTokenEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function main() {
  const accessToken = readTokenEnv('LINKEDIN_ACCESS_TOKEN');
  const refreshToken = readTokenEnv('LINKEDIN_REFRESH_TOKEN');

  if (!accessToken) {
    console.log(JSON.stringify({
      event: 'linkedin_token_import_skipped',
      reason: 'local_linkedin_env_is_tokenless',
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
    serviceName: `${config.serviceName}-import-linkedin`,
    dbPoolMax: 1,
  });

  try {
    const result = await withTransaction(pool, (client) => importLinkedInToken(client, {
      config,
      accessToken,
      refreshToken,
      scopes: LINKEDIN_SCOPES,
      importedFrom: 'platforms/linkedin/.env',
    }));

    console.log(JSON.stringify({
      event: 'linkedin_token_imported',
      organization_id: result.organization.id,
      connection_id: result.connection.id,
      asset_id: result.asset.id,
      platform_asset_id: result.asset.platform_asset_id,
      has_refresh_token: Boolean(result.refreshToken),
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
