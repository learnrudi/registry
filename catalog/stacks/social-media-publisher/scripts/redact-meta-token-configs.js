#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDefaultMetaConfigPaths } from '../src/domain/import-meta-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function redactJsonArray(filePath, arrayKey, tokenKeys) {
  const raw = await fs.readFile(filePath, 'utf8');
  const config = JSON.parse(raw);
  const items = Array.isArray(config[arrayKey]) ? config[arrayKey] : [];
  let removed = 0;

  for (const item of items) {
    for (const tokenKey of tokenKeys) {
      if (Object.hasOwn(item, tokenKey)) {
        delete item[tokenKey];
        removed++;
      }
    }
  }

  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`);
  return removed;
}

async function redactEnv(filePath, keys) {
  let raw;

  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }

  let changed = 0;
  const lines = raw.split(/\r?\n/).map((line) => {
    const key = line.split('=')[0];

    if (keys.includes(key)) {
      changed++;
      return `${key}=`;
    }

    return line;
  });

  await fs.writeFile(filePath, lines.join('\n'));
  return changed;
}

async function main() {
  const paths = getDefaultMetaConfigPaths();
  const removed = {
    pages: await redactJsonArray(
      paths.pagesConfigPath,
      'pages',
      ['access_token'],
    ),
    instagram: await redactJsonArray(
      paths.instagramConfigPath,
      'accounts',
      ['access_token'],
    ),
    env: await redactEnv(
      path.join(repoRoot, 'platforms/meta/.env'),
      ['FACEBOOK_USER_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN'],
    ),
  };

  console.log(JSON.stringify({
    event: 'meta_token_configs_redacted',
    removed,
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
