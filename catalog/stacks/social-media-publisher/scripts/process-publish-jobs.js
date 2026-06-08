#!/usr/bin/env node

import { getConfig } from '../src/config/env.js';
import { runPublishWorkerOnce } from '../src/workers/publish-worker.js';

const DEFAULT_IDLE_MS = 5_000;

function parseArgs(argv) {
  const jobIdIndex = argv.indexOf('--job-id');
  const publishJobId = jobIdIndex >= 0 ? argv[jobIdIndex + 1] : null;

  if (jobIdIndex >= 0 && !publishJobId) {
    throw new Error('--job-id requires a publish job ID');
  }

  return {
    once: argv.includes('--once'),
    publishJobId,
    idleMs: Number.parseInt(process.env.PUBLISH_WORKER_IDLE_MS ?? String(DEFAULT_IDLE_MS), 10),
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = getConfig();
  let stopping = false;

  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  do {
    const result = await runPublishWorkerOnce(config, {
      publishJobId: options.publishJobId,
    });
    if (options.once) {
      return;
    }

    if (!result.claimed) {
      await sleep(options.idleMs);
    }
  } while (!stopping);
}

main().catch((error) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'publish_worker_crashed',
    code: error.code ?? 'publish_worker_crashed',
    message: error.message,
  }));
  process.exit(1);
});
