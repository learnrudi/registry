import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SafeError, accountAlias, validateConfig } from './contracts.js';

export class AccountStore {
  constructor(root = path.join(process.env.RUDI_HOME || path.join(os.homedir(), '.rudi'), 'state/stacks/microsoft-365')) {
    if (!path.isAbsolute(root)) throw new SafeError('CONFIG', 'State path must be absolute.');
    this.root = path.resolve(root);
  }

  async config() {
    await secureDirectory(this.root);
    let value;
    try { value = JSON.parse(await readPrivateFile(path.join(this.root, 'config.json'))); }
    catch (error) {
      if (error.code === 'ENOENT') return { accounts: {} };
      if (error instanceof SafeError) throw error;
      throw new SafeError('CONFIG', 'Configuration must be valid JSON.');
    }
    return validateConfig(value);
  }

  async account(alias) {
    accountAlias(alias);
    const config = await this.config();
    if (!Object.hasOwn(config.accounts, alias)) throw new SafeError('ACCOUNT', 'Named account is not configured.');
    return config.accounts[alias];
  }

  async directory(alias) {
    accountAlias(alias);
    await secureDirectory(this.root);
    await secureDirectory(path.join(this.root, 'accounts'));
    const directory = path.join(this.root, 'accounts', alias);
    await secureDirectory(directory);
    return directory;
  }

  async readCache(alias) {
    const directory = await this.directory(alias);
    try { return JSON.parse(await readPrivateFile(path.join(directory, 'cache.json'))); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      if (error instanceof SafeError) throw error;
      throw new SafeError('AUTH_REQUIRED', 'Credential cache is invalid; authenticate this named account again.');
    }
  }

  async writeCache(alias, value) {
    const directory = await this.directory(alias);
    const target = path.join(directory, 'cache.json');
    await checkPrivateFile(target, true);
    const temporary = path.join(directory, `cache-${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
      finally { await handle.close(); }
      await secureDirectory(directory);
      await checkPrivateFile(target, true);
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }); }
  }

  async withLock(alias, operation) {
    const directory = await this.directory(alias);
    const lock = path.join(directory, 'credential.lock');
    let handle;
    try { handle = await fs.open(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
    catch { throw new SafeError('BUSY', 'Account credentials are busy. Finish the other operation; inspect a stale credential.lock only after its process exits.'); }
    try { return await operation(); }
    finally { await handle.close(); await fs.unlink(lock); }
  }
}

// State must never land in the shipped source checkout, including caller-selected paths.
export function sourceBoundaries(moduleUrl = import.meta.url) {
  const packageRoot = path.resolve(fileURLToPath(new URL('../', moduleUrl)));
  const stacks = path.dirname(packageRoot);
  const catalog = path.dirname(stacks);
  return path.basename(stacks) === 'stacks' && path.basename(catalog) === 'catalog' ?
    [packageRoot, path.dirname(catalog)] : [packageRoot];
}
const forbiddenRoots = sourceBoundaries();

export async function secureDirectory(directory) {
  const absolute = path.resolve(directory);
  if (forbiddenRoots.some(root => absolute === root || absolute.startsWith(`${root}${path.sep}`))) {
    throw new SafeError('STORAGE', 'Credential state must be outside source.');
  }
  const segments = absolute.split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try { await fs.mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SafeError('STORAGE', 'State directory cannot be linked or non-directory.');
  }
  const stat = await fs.stat(absolute);
  if ((process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0) {
    throw new SafeError('STORAGE', 'Private state directories require current ownership and mode 0700.');
  }
}

async function checkPrivateFile(file, allowMissing = false) {
  let stat;
  try { stat = await fs.lstat(file); }
  catch (error) { if (allowMissing && error.code === 'ENOENT') return; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
      (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0) {
    throw new SafeError('STORAGE', 'Credential/configuration files must be private regular files, never linked.');
  }
  if (stat.size > 4 * 1024 * 1024) throw new SafeError('STORAGE', 'State file exceeds the size limit.');
}

async function readPrivateFile(file) {
  await checkPrivateFile(file);
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4 * 1024 * 1024 ||
        (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0) {
      throw new SafeError('STORAGE', 'Invalid private state file.');
    }
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
