import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseCli } from '../src/cli-options.js';

test('CLI accepts documented options and rejects unknown or missing values', () => {
  const parsed = parseCli(['--url','https://calendar.app.google/example', '--duration','30',
    '--from','2026-10-05','--through','2026-10-11','--timezone','America/New_York','--json']);
  assert.equal(parsed.input.duration_minutes, 30);
  assert.equal(parsed.json, true);
  assert.throws(() => parseCli(['--url']));
  assert.throws(() => parseCli(['--secret','abc']));
  assert.throws(() => parseCli(['--duration','30','--duration','60']));
});

test('installed MCP entry handles RUDI runner input and reports CLI validation failures', () => {
  const result = spawnSync(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, RUDI_INPUTS: JSON.stringify({ url: 'https://localhost/' }) },
    input: JSON.stringify({ url: 'https://localhost/' }),
  });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_URL');
  assert.equal(result.stdout, '');
});
