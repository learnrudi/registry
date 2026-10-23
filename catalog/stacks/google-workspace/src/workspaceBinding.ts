import { normalizeRequestedGoogleAccount } from './authIdentity.js';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export type WorkspaceBinding = { version: 1; workspaceId: string; runId: string; account: string; tools: string[] };

export function readWorkspaceBinding(raw: string | undefined): WorkspaceBinding | null {
  if (raw === undefined) return null;
  let value: WorkspaceBinding;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid workspace binding'); }
  if (!value || value.version !== 1 || !/^wsp_[a-z0-9][a-z0-9_]{2,95}$/.test(value.workspaceId)
    || typeof value.runId !== 'string' || !/^[a-zA-Z0-9-]{1,96}$/.test(value.runId)
    || !Array.isArray(value.tools) || value.tools.length > 100
    || value.tools.some(tool => typeof tool !== 'string' || !/^[a-z][a-z0-9_]*$/.test(tool) || tool.startsWith('account_'))
    || new Set(value.tools).size !== value.tools.length
    || Object.keys(value).some(key => !['version', 'workspaceId', 'runId', 'account', 'tools'].includes(key))) {
    throw new Error('Invalid workspace binding');
  }
  normalizeRequestedGoogleAccount(value.account);
  if (value.account !== value.account.toLowerCase().trim()) throw new Error('Invalid workspace account');
  return Object.freeze(value);
}

export function assertBoundCall(binding: WorkspaceBinding | null, name: string, args?: Record<string, unknown>) {
  if (!binding) return;
  if (!binding.tools.includes(name)) throw new Error('Tool is not activated for this workspace');
  if (args && Object.hasOwn(args, 'account') && normalizeRequestedGoogleAccount(args.account) !== binding.account) {
    throw new Error('Account conflicts with workspace binding');
  }
}

export function readBoundToken<T>(accountsRoot: string, account: string): T {
  normalizeRequestedGoogleAccount(account);
  const root = realpathSync(accountsRoot);
  if (lstatSync(accountsRoot).isSymbolicLink()) throw new Error('Invalid bound account storage');
  const folder = join(root, account);
  if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) throw new Error('Invalid bound account storage');
  const tokenPath = join(folder, 'token.json');
  const stat = lstatSync(tokenPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw new Error('Invalid bound account token');
  let token;
  try { token = JSON.parse(readFileSync(tokenPath, 'utf8')); }
  catch { throw new Error('Invalid bound account token'); }
  if (!token || typeof token !== 'object' || Array.isArray(token)) throw new Error('Invalid bound account token');
  if (token.account !== account) throw new Error('Stored token identity does not match the workspace account; verify this connection');
  return token as T;
}
