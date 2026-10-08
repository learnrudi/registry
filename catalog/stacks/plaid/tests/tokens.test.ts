import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { saveLinkedItem, updateTransactionsCursor, loadTokenStore } from '../src/logic/tokens.js';

const item = (id: string) => ({ itemId: id, accessToken: `fake-${id}`, environment: 'sandbox' as const, products: [] });

test('concurrent same-process and separate-process updates preserve every item and cursor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plaid-concurrency-'));
  const previous = process.env.PLAID_TOKEN_STORE_PATH;
  process.env.PLAID_TOKEN_STORE_PATH = join(dir, 'tokens.json');
  try {
    await saveLinkedItem(item('existing'));
    await Promise.all([
      ...Array.from({ length: 12 }, (_, i) => saveLinkedItem(item(`local-${i}`))),
      updateTransactionsCursor('existing', 'cursor-next'),
    ]);
    const source = `import { saveLinkedItem } from './src/logic/tokens.ts'; process.send('ready'); process.on('message', async () => { await Promise.all(Array.from({length: 8}, (_, i) => saveLinkedItem({itemId: process.env.TEST_WORKER + '-' + i, accessToken: 'fake', environment: 'sandbox', products: []}))); process.disconnect(); });`;
    const children = Array.from({ length: 3 }, (_, i) => spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: { ...process.env, TEST_WORKER: `worker-${i}` }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }));
    const completions = children.map(child => new Promise<void>((resolve, reject) => { let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk; }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr))); }));
    await Promise.all(children.map(child => new Promise(resolve => child.once('message', resolve))));
    children.forEach(child => child.send('go'));
    await Promise.all(completions);
    const store = await loadTokenStore();
    assert.equal(Object.keys(store.items).length, 37);
    assert.equal(store.items.existing.transactionsCursor, 'cursor-next');
    assert.deepEqual(await readdir(dir), ['tokens.json']);
  } finally {
    if (previous === undefined) delete process.env.PLAID_TOKEN_STORE_PATH;
    else process.env.PLAID_TOKEN_STORE_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
