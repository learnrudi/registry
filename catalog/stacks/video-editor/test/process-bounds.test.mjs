import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand } from '../src/lib/process.js';

test('captured media process output is bounded before accumulating a large buffer', async () => {
  await assert.rejects(() => runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(65536))'], { capture: true, maxBuffer: 1024 }), /output limit/);
});

test('a stuck media process is terminated at its deadline', async () => {
  await assert.rejects(() => runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 250)'], { capture: true, timeoutMs: 50 }), /timed out/);
});
