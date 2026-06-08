import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../config/env.js';
import { sha256Hex } from '../security/crypto-utils.js';
import { makeDatabasePool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDirectory = path.resolve(__dirname, '../../migrations');

function checksum(sql) {
  return sha256Hex(sql);
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function listMigrations() {
  const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function applyMigration(client, id, sql, sqlChecksum) {
  await client.query('begin');

  try {
    await client.query(sql);
    await client.query(
      'insert into schema_migrations (id, checksum) values ($1, $2)',
      [id, sqlChecksum],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function main() {
  const config = getConfig();
  const databaseUrl = config.directDatabaseUrl ?? config.databaseUrl;
  const pool = makeDatabasePool(databaseUrl, {
    ...config,
    serviceName: `${config.serviceName}-migrate`,
    dbPoolMax: 1,
  });
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);

    for (const id of await listMigrations()) {
      const sql = await fs.readFile(path.join(migrationsDirectory, id), 'utf8');
      const sqlChecksum = checksum(sql);
      const existing = await client.query(
        'select checksum from schema_migrations where id = $1',
        [id],
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== sqlChecksum) {
          throw new Error(`Migration checksum mismatch for ${id}`);
        }

        console.log(`skip ${id}`);
        continue;
      }

      console.log(`apply ${id}`);
      await applyMigration(client, id, sql, sqlChecksum);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
