import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeAttachment, Attachments } from '../src/attachments.js';

test('attachment output never overwrites existing files or follows linked paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'm365-output-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = await fs.realpath(root);
  await fs.writeFile(path.join(directory, 'existing.txt'), 'original');
  await assert.rejects(writeAttachment(directory, 'existing.txt', Buffer.from('replacement')));
  assert.equal(await fs.readFile(path.join(directory, 'existing.txt'), 'utf8'), 'original');
  await fs.symlink(path.join(directory, 'existing.txt'), path.join(directory, 'linked.txt'));
  await assert.rejects(writeAttachment(directory, 'linked.txt', Buffer.from('replacement')));
  await assert.rejects(writeAttachment(directory, '../escaped.txt', Buffer.from('replacement')), /filename/);
});

test('a valid 5 MiB file downloads and an oversized attachment is rejected before output', async t => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm365-max-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const content = Buffer.alloc(5 * 1024 * 1024, 'a');
  const data = { '@odata.type': '#microsoft.graph.fileAttachment', size: content.length, contentBytes: content.toString('base64') };
  const attachments = new Attachments({ withAuthorized: async (_alias, run) => run({ get: async () => data }) });
  const input = { account: 'reader', message_id: 'message', attachment_id: 'attachment', output_dir: directory, filename: 'max.bin' };
  const saved = await attachments.download(input);
  assert.equal(saved.bytes, content.length);
  assert.deepEqual(await fs.readFile(saved.path), content);
  data.size++;
  await assert.rejects(attachments.download({ ...input, filename: 'too-large.bin' }), /5 MiB/);
  await assert.rejects(fs.stat(path.join(directory, 'too-large.bin')), { code: 'ENOENT' });
});
