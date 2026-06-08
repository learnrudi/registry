#!/usr/bin/env node

import { promises as fs } from 'node:fs';

import { getConfig } from '../src/config/env.js';
import { makeDatabasePool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import { getDefaultMetaConfigPaths, importMetaConfig } from '../src/domain/import-meta-config.js';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function configsContainTokens(paths) {
  const [pagesConfig, instagramConfig] = await Promise.all([
    readJson(paths.pagesConfigPath),
    readJson(paths.instagramConfigPath),
  ]);
  const pages = Array.isArray(pagesConfig.pages) ? pagesConfig.pages : [];
  const accounts = Array.isArray(instagramConfig.accounts) ? instagramConfig.accounts : [];

  return pages.some((page) => page.access_token) || accounts.some((account) => account.access_token);
}

async function main() {
  const config = getConfig();
  const paths = getDefaultMetaConfigPaths();

  if (!(await configsContainTokens(paths))) {
    console.log(JSON.stringify({
      event: 'meta_config_import_skipped',
      reason: 'local_meta_configs_are_tokenless',
    }));
    return;
  }

  const databaseUrl = config.databaseUrl ?? config.directDatabaseUrl;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_DATABASE_URL is required');
  }

  if (!config.tokenEncryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required');
  }

  const pool = makeDatabasePool(databaseUrl, {
    ...config,
    serviceName: `${config.serviceName}-import-meta`,
    dbPoolMax: 1,
  });

  try {
    const result = await withTransaction(pool, (client) => importMetaConfig(client, {
      config,
      pagesConfigPath: paths.pagesConfigPath,
      instagramConfigPath: paths.instagramConfigPath,
    }));

    console.log(JSON.stringify({
      event: 'meta_config_imported',
      organization_id: result.organization.id,
      connection_id: result.connection.id,
      facebook_assets: result.facebookAssets.length,
      instagram_assets: result.instagramAssets.length,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
