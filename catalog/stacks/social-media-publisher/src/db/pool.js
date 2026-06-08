import pg from 'pg';

const { Pool } = pg;

let pool;

export function makeDatabasePool(databaseUrl, config = {}) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_DATABASE_URL is required');
  }

  return new Pool({
    connectionString: databaseUrl,
    max: config.dbPoolMax ?? 5,
    idleTimeoutMillis: config.dbIdleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs ?? 5_000,
    application_name: config.serviceName ?? 'social-api',
  });
}

export function getDatabasePool(config) {
  if (!pool) {
    pool = makeDatabasePool(config.databaseUrl, config);
  }

  return pool;
}

export async function closePool() {
  if (!pool) {
    return;
  }

  const poolToClose = pool;
  pool = undefined;
  await poolToClose.end();
}
