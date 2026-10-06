import assert from 'node:assert/strict';
import test from 'node:test';
import { withBrowser } from '../src/browser.js';

test('closes the isolated browser after a provider failure', async () => {
  let closed = false;
  const fake = { newContext: async () => ({ newPage: async () => ({}) }),
    close: async () => { closed = true; } };
  await assert.rejects(withBrowser({ timezone: 'America/New_York', timeout_seconds: 1 },
    async () => { throw new Error('provider failed'); }, async () => fake), /provider failed/);
  assert.equal(closed, true);
});

test('cancellation stops a read and closes its isolated browser', async () => {
  let closed = false;
  const controller = new AbortController();
  const fake = { newContext: async () => ({ newPage: async () => ({}) }),
    close: async () => { closed = true; } };
  const cancel = setTimeout(() => controller.abort(), 50);
  try {
    await assert.rejects(withBrowser({ timezone: 'UTC', timeout_seconds: 2 },
      () => new Promise(resolve => setTimeout(resolve, 150)), async () => fake, controller.signal), /cancelled/i);
    assert.equal(closed, true);
  } finally { clearTimeout(cancel); }
});

test('expires a slow provider read and closes its browser', async () => {
  let closed = false;
  const fake = { newContext: async () => ({ newPage: async () => ({}) }),
    close: async () => { closed = true; } };
  await assert.rejects(withBrowser({ timezone: 'UTC', timeout_seconds: 1 },
    () => new Promise(resolve => setTimeout(resolve, 1200)), async () => fake), /timed out/i);
  assert.equal(closed, true);
});
