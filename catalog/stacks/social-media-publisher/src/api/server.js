import { serve } from '@hono/node-server';

import { getConfig } from '../config/env.js';
import { closePool } from '../db/pool.js';
import { createApp } from './app.js';

const config = getConfig();

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required to start the API server');
}

const app = createApp(config);
const server = serve({
  fetch: app.fetch,
  port: config.port,
}, (info) => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    service: config.serviceName,
    port: info.port,
    environment: config.nodeEnv,
  }));
});

async function shutdown(signal) {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_shutdown_started',
    signal,
  }));

  server.close(async (error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    await closePool();
    console.log(JSON.stringify({
      level: 'info',
      event: 'server_shutdown_complete',
    }));
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
