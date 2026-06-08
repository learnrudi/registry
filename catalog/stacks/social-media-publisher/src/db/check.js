import { getConfig } from '../config/env.js';
import { makeDatabasePool } from './pool.js';

async function main() {
  const config = getConfig();
  const databaseUrl = config.databaseUrl ?? config.directDatabaseUrl;
  const pool = makeDatabasePool(databaseUrl, config);

  try {
    const result = await pool.query(`
      select
        current_database() as database,
        current_user as role,
        current_setting('server_version_num') as server_version_num
    `);
    const row = result.rows[0];

    console.log(`database=${row.database}`);
    console.log(`role=${row.role}`);
    console.log(`server_version_num=${row.server_version_num}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
