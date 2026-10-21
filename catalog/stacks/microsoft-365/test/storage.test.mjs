import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountStore, sourceBoundaries } from '../src/storage.js';
import { fileURLToPath } from 'node:url';

test('linked configuration files are rejected before reading', async t => {
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm365-test-')));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  await fs.writeFile(path.join(temp, 'source.json'), '{"accounts":{}}', { mode: 0o600 });
  await fs.symlink(path.join(temp, 'source.json'), path.join(temp, 'config.json'));
  await assert.rejects(new AccountStore(temp).config(), /linked/);
});

test('installed package boundary does not exclude its sibling state directory', () => {
  assert.deepEqual(sourceBoundaries('file:///example/.rudi/stacks/microsoft-365/src/storage.js'), ['/example/.rudi/stacks/microsoft-365']);
  assert.deepEqual(sourceBoundaries('file:///example/registry/catalog/stacks/microsoft-365/src/storage.js'),
    ['/example/registry/catalog/stacks/microsoft-365', '/example/registry']);
});

test('credential state is rejected inside the source checkout before creation', async t => {
  const directory = fileURLToPath(new URL('../.test-state-do-not-create', import.meta.url));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(new AccountStore(directory).config(), error => error.code === 'STORAGE' && /outside source/.test(error.message));
  await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
});

test('account directories cannot inherit a world-writable accounts parent', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm365-parent-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'accounts'), { mode: 0o777 });
  await fs.chmod(path.join(root, 'accounts'), 0o777);
  await assert.rejects(new AccountStore(root).readCache('reader'), /0700/);
});

test('private per-account caches are isolated, hardlinks rejected and locks exclusive', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm365-cache-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new AccountStore(root);
  await store.writeCache('one', { cache: 'ONE' });
  await store.writeCache('two', { cache: 'TWO' });
  assert.deepEqual(await store.readCache('one'), { cache: 'ONE' });
  assert.deepEqual(await store.readCache('two'), { cache: 'TWO' });
  const file = path.join(root, 'accounts/one/cache.json');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  await store.withLock('one', async () => {
    await assert.rejects(store.withLock('one', async () => {}), error => error.code === 'BUSY');
  });
  await fs.link(file, path.join(root, 'other-link'));
  await assert.rejects(store.readCache('one'), /linked/);
  await assert.rejects(store.writeCache('one', { cache: 'overwrite' }), /linked/);
});
