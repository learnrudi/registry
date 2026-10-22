import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { SafeError, accountAlias } from './contracts.js';
import { identifier } from './graph.js';

export async function writeAttachment(outputDirectory, filename, bytes) {
  await validateDestination(outputDirectory, filename);
  const target = path.join(outputDirectory, filename);
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ATTACHMENT) throw new SafeError('ATTACHMENT_LIMIT', 'Attachment exceeds the 5 MiB download limit.');
  let handle;
  try { handle = await fs.open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch { throw new SafeError('OUTPUT', 'Output already exists or cannot be created safely.'); }
  let completed = false;
  try {
    await validateDirectory(outputDirectory);
    await handle.writeFile(bytes);
    await handle.sync();
    completed = true;
    return { path: target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally {
    const original = await handle.stat();
    await handle.close();
    if (!completed) {
      const current = await fs.lstat(target).catch(() => null);
      if (current?.ino === original.ino && current?.dev === original.dev) await fs.unlink(target);
    }
  }
}

const MAX_ATTACHMENT = 5 * 1024 * 1024;

export class Attachments {
  constructor(accounts) { this.accounts = accounts; }

  async download(input) {
    accountAlias(input.account);
    identifier(input.message_id);
    identifier(input.attachment_id);
    await validateDestination(input.output_dir, input.filename);
    const { bytes } = await this.read(input);
    const saved = await writeAttachment(input.output_dir, input.filename, bytes);
    return { account: input.account, ...saved };
  }

  async read(input) {
    accountAlias(input.account);
    const message = identifier(input.message_id);
    const attachment = identifier(input.attachment_id);
    return this.accounts.withAuthorized(input.account, async graph => {
      const data = await graph.get(`/me/messages/${message}/attachments/${attachment}`, {}, null, 8 * 1024 * 1024);
      if (data['@odata.type'] !== '#microsoft.graph.fileAttachment') {
        throw new SafeError('ATTACHMENT_TYPE', 'Only fileAttachment downloads are supported; item and cloud-reference attachments are not downloaded.');
      }
      if (!Number.isSafeInteger(data.size) || data.size < 0 || data.size > MAX_ATTACHMENT ||
          typeof data.contentBytes !== 'string' || data.contentBytes.length > Math.ceil(MAX_ATTACHMENT / 3) * 4 ||
          data.contentBytes.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data.contentBytes)) {
        throw new SafeError('ATTACHMENT_LIMIT', 'Attachment is invalid or exceeds the 5 MiB download limit.');
      }
      const bytes = Buffer.from(data.contentBytes, 'base64');
      if (bytes.toString('base64') !== data.contentBytes) throw new SafeError('GRAPH_PAYLOAD', 'Attachment encoding is invalid.');
      return { bytes, name: typeof data.name === 'string' ? data.name.slice(0,512) : '' };
    });
  }
}

async function validateDestination(directory, filename) {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}$/.test(filename) ||
      /[. ]$/.test(filename) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(filename)) {
    throw new SafeError('OUTPUT', 'An explicit safe basename filename is required.');
  }
  await validateDirectory(directory);
  try { await fs.lstat(path.join(directory, filename)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new SafeError('OUTPUT', 'Output already exists; choose a new filename.');
}

async function validateDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) {
    throw new SafeError('OUTPUT', 'output_dir must be an explicit absolute canonical existing directory.');
  }
  let current = path.parse(directory).root;
  for (const segment of directory.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SafeError('OUTPUT', 'Output directory cannot traverse links.');
  }
  const stat = await fs.stat(directory);
  if ((process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o022)) {
    throw new SafeError('OUTPUT', 'Output directory must be owned by this user and not writable by others.');
  }
}
