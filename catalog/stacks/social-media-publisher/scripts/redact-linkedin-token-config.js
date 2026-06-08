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

async function main() {
  const redacted = await redactEnv(
    path.join(repoRoot, 'platforms/linkedin/.env'),
    ['LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_REFRESH_TOKEN'],
  );

  console.log(JSON.stringify({
    event: 'linkedin_secret_config_redacted',
    redacted,
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
