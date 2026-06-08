#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

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
    const equalsIndex = line.indexOf('=');
    const key = equalsIndex === -1 ? line : line.slice(0, equalsIndex);

    if (keys.includes(key)) {
      changed++;
      return `${key}=`;
    }

    return line;
  });

  await fs.writeFile(filePath, lines.join('\n'));
  return changed;
}

async function redactJsonFile(filePath, tokenKeys) {
  let raw;

  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }

  const data = JSON.parse(raw);
  let changed = 0;

  function visit(value) {
    if (!value || typeof value !== 'object') {
      return;
    }

    for (const key of Object.keys(value)) {
      if (tokenKeys.includes(key)) {
        value[key] = '';
        changed++;
      } else {
        visit(value[key]);
      }
    }
  }

  visit(data);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  return changed;
}

async function main() {
  const redacted = {
    env: await redactEnv(
      path.join(repoRoot, 'platforms/youtube/.env'),
      [
        'OPENAI_API_KEY',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'SECRET_KEY',
        'DATABASE_URL',
      ],
    ),
    clientSecrets: await redactJsonFile(
      path.join(repoRoot, 'platforms/youtube/config/client_secrets.json'),
      ['client_secret'],
    ),
    oauth: await redactJsonFile(
      path.join(repoRoot, 'platforms/youtube/config/oauth2.json'),
      ['token', 'refresh_token', 'client_secret'],
    ),
    expiredOauth: await redactJsonFile(
      path.join(repoRoot, 'platforms/youtube/config/oauth2.json.expired.1776515311'),
      ['token', 'refresh_token', 'client_secret'],
    ),
  };

  console.log(JSON.stringify({
    event: 'youtube_secret_config_redacted',
    redacted,
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
