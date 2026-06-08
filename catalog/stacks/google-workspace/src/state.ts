import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const STACK_ID = "google-workspace";
const STATE_DIR_ENV = "RUDI_STACK_STATE_DIR";
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = join(MODULE_DIR, "..");

export type WorkspacePaths = {
  packageRoot: string;
  stateDir: string;
  accountsDir: string;
  stateFile: string;
  tokenFile: string;
  legacyAccountsDir: string;
  legacyStateFile: string;
  legacyTokenFile: string;
};

type PathOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  packageRoot?: string;
  stateDir?: string;
};

export function getWorkspacePaths(options: PathOptions = {}): WorkspacePaths {
  const env = options.env || process.env;
  const homeDir = options.homeDir || homedir();
  const packageRoot = options.packageRoot || DEFAULT_PACKAGE_ROOT;
  const configuredStateDir = env[STATE_DIR_ENV]?.trim();
  const stateDir = options.stateDir || configuredStateDir || join(homeDir, ".rudi", "state", "stacks", STACK_ID);

  return {
    packageRoot,
    stateDir,
    accountsDir: join(stateDir, "accounts"),
    stateFile: join(stateDir, "state.json"),
    tokenFile: join(stateDir, "token.json"),
    legacyAccountsDir: join(packageRoot, "accounts"),
    legacyStateFile: join(packageRoot, "state.json"),
    legacyTokenFile: join(packageRoot, "token.json"),
  };
}

export function ensureWorkspaceState(paths: WorkspacePaths = getWorkspacePaths()): void {
  ensurePrivateDir(paths.stateDir);
  ensurePrivateDir(paths.accountsDir);
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

export function writeJsonFile(filePath: string, data: unknown): void {
  ensurePrivateDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  setPrivateFileMode(filePath);
}

export function migrateLegacyStateIfNeeded(paths: WorkspacePaths = getWorkspacePaths()): string[] {
  const shouldCopyLegacyAccounts = !hasDirectoryEntries(paths.accountsDir);
  ensureWorkspaceState(paths);

  const copied: string[] = [];
  copyMissingFile(paths.legacyStateFile, paths.stateFile, copied);
  copyMissingFile(paths.legacyTokenFile, paths.tokenFile, copied);

  if (shouldCopyLegacyAccounts && existsSync(paths.legacyAccountsDir)) {
    for (const entry of readdirSync(paths.legacyAccountsDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      copyMissingTree(join(paths.legacyAccountsDir, entry.name), join(paths.accountsDir, entry.name), copied);
    }
  }

  return copied;
}

function hasDirectoryEntries(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  return readdirSync(dirPath).some((entry) => !entry.startsWith("."));
}

function copyMissingTree(source: string, destination: string, copied: string[]): void {
  if (!existsSync(source)) return;

  const sourceStats = statSync(source);
  if (sourceStats.isDirectory()) {
    ensurePrivateDir(destination);
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      copyMissingTree(join(source, entry.name), join(destination, entry.name), copied);
    }
    return;
  }

  if (sourceStats.isFile()) {
    copyMissingFile(source, destination, copied);
  }
}

function copyMissingFile(source: string, destination: string, copied: string[]): void {
  if (!existsSync(source) || existsSync(destination)) return;
  ensurePrivateDir(dirname(destination));
  copyFileSync(source, destination);
  setPrivateFileMode(destination);
  copied.push(destination);
}

export function ensurePrivateDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
  try {
    chmodSync(dirPath, 0o700);
  } catch {
    // Best effort only; some filesystems do not support POSIX mode changes.
  }
}

export function setPrivateFileMode(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best effort only; some filesystems do not support POSIX mode changes.
  }
}
