import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const DEFAULT_PORT = 3000;
const DEFAULT_DB_POOL_MAX = 5;
const DEFAULT_DB_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_DB_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_BOOTSTRAP_ORGANIZATION_SUBJECT = 'rudi_social_media';
const DEFAULT_BOOTSTRAP_USER_SUBJECT = 'rudi-local-user';

function readEnv(name, { required = false, defaultValue } = {}) {
  const value = process.env[name];

  if (value === undefined || value === '') {
    if (required) {
      throw new Error(`Missing required environment variable: ${name}`);
    }

    return defaultValue;
  }

  return value;
}

function readIntegerEnv(name, { defaultValue, min, max } = {}) {
  const rawValue = readEnv(name, { defaultValue: String(defaultValue) });
  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }

  if (min !== undefined && parsedValue < min) {
    throw new Error(`Environment variable ${name} must be >= ${min}`);
  }

  if (max !== undefined && parsedValue > max) {
    throw new Error(`Environment variable ${name} must be <= ${max}`);
  }

  return parsedValue;
}

export function getConfig() {
  const nodeEnv = readEnv('NODE_ENV', { defaultValue: 'development' });

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    serviceName: readEnv('RAILWAY_SERVICE_NAME', { defaultValue: 'social-api' }),
    port: readIntegerEnv('PORT', { defaultValue: DEFAULT_PORT, min: 1, max: 65_535 }),
    logLevel: readEnv('LOG_LEVEL', { defaultValue: 'info' }),
    databaseUrl: readEnv('DATABASE_URL'),
    directDatabaseUrl: readEnv('DIRECT_DATABASE_URL'),
    internalApiKey: readEnv('INTERNAL_API_KEY'),
    tokenEncryptionKey: readEnv('TOKEN_ENCRYPTION_KEY'),
    tokenEncryptionKeyVersion: readEnv('TOKEN_ENCRYPTION_KEY_VERSION', { defaultValue: 'v1' }),
    bootstrapOrganizationSubject: readEnv('BOOTSTRAP_ORGANIZATION_SUBJECT', {
      defaultValue: DEFAULT_BOOTSTRAP_ORGANIZATION_SUBJECT,
    }),
    bootstrapOrganizationName: readEnv('BOOTSTRAP_ORGANIZATION_NAME', {
      defaultValue: 'RUDI Social Media Publisher',
    }),
    bootstrapOrganizationSlug: readEnv('BOOTSTRAP_ORGANIZATION_SLUG', {
      defaultValue: 'rudi-social-media-publisher',
    }),
    bootstrapUserSubject: readEnv('BOOTSTRAP_USER_SUBJECT', {
      defaultValue: DEFAULT_BOOTSTRAP_USER_SUBJECT,
    }),
    bootstrapUserEmail: readEnv('BOOTSTRAP_USER_EMAIL', {
      defaultValue: 'user@rudi.local',
    }),
    bootstrapUserDisplayName: readEnv('BOOTSTRAP_USER_DISPLAY_NAME', {
      defaultValue: 'RUDI Local User',
    }),
    dbPoolMax: readIntegerEnv('DB_POOL_MAX', { defaultValue: DEFAULT_DB_POOL_MAX, min: 1, max: 20 }),
    dbIdleTimeoutMs: readIntegerEnv('DB_IDLE_TIMEOUT_MS', {
      defaultValue: DEFAULT_DB_IDLE_TIMEOUT_MS,
      min: 1_000,
      max: 300_000,
    }),
    dbConnectionTimeoutMs: readIntegerEnv('DB_CONNECTION_TIMEOUT_MS', {
      defaultValue: DEFAULT_DB_CONNECTION_TIMEOUT_MS,
      min: 1_000,
      max: 60_000,
    }),
  };
}
