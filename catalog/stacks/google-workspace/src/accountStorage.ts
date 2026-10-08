import { lstatSync, realpathSync, readdirSync, readFileSync, type Stats } from "fs";
import { dirname, join } from "path";
import { normalizeRequestedGoogleAccount, assertAuthorizedGoogleAccount } from "./authIdentity.js";
import { ensurePrivateDir } from "./state.js";

function lstatIfPresent(entryPath: string): Stats | null {
  try {
    return lstatSync(entryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function ensureIsolatedGoogleAccountDirectory(
  accountsDir: string,
  requestedAccount: unknown
): string {
  const account = normalizeRequestedGoogleAccount(requestedAccount);
  ensurePrivateDir(accountsDir);
  const accountDir = join(accountsDir, account);
  const accountEntry = lstatIfPresent(accountDir);

  if (!accountEntry) {
    ensurePrivateDir(accountDir);
    return accountDir;
  }

  if (accountEntry.isSymbolicLink()) {
    throw new Error(
      `Google account directory '${account}' must not be a symbolic link. ` +
      "Replace it with a dedicated directory before authenticating."
    );
  }
  if (!accountEntry.isDirectory()) {
    throw new Error(`Google account storage '${account}' must be a directory.`);
  }

  const accountsRoot = realpathSync(accountsDir);
  const resolvedAccountDir = realpathSync(accountDir);
  if (dirname(resolvedAccountDir) !== accountsRoot) {
    throw new Error(`Google account directory '${account}' resolves outside the accounts root.`);
  }

  ensurePrivateDir(accountDir);
  return accountDir;
}

// Runtime selection must never create directories or follow account/file aliases.
export function storedGoogleAccountFile(accountsDir: string, requestedAccount: unknown, filename: "token.json" | "credentials.json"): string {
  const account = normalizeRequestedGoogleAccount(requestedAccount);
  const accountDir = join(accountsDir, account);
  const entry = lstatIfPresent(accountDir);
  if (!entry?.isDirectory() || entry.isSymbolicLink() || dirname(realpathSync(accountDir)) !== realpathSync(accountsDir)) {
    throw new Error(`Google account '${account}' is not an isolated stored account.`);
  }
  const filePath = join(accountDir, filename);
  const file = lstatIfPresent(filePath);
  if (file && (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || dirname(realpathSync(filePath)) !== realpathSync(accountDir))) {
    throw new Error(`Google account ${filename} must be an isolated regular file.`);
  }
  return filePath;
}

export function readStoredGoogleToken<T extends { account?: string }>(accountsDir: string, requestedAccount: unknown): T {
  const account = normalizeRequestedGoogleAccount(requestedAccount);
  const token = JSON.parse(readFileSync(storedGoogleAccountFile(accountsDir, account, "token.json"), "utf8")) as T;
  if (!token || typeof token !== "object" || Array.isArray(token)) throw new Error("Invalid Google account token.");
  // Legacy tokens have no identity field; preserve these isolated stored accounts.
  if (token.account != null) assertAuthorizedGoogleAccount(account, token.account);
  return token;
}

export function listStoredGoogleAccounts(accountsDir: string): string[] {
  if (!lstatIfPresent(accountsDir)) return [];
  return readdirSync(accountsDir).filter((name) => {
    try {
      if (normalizeRequestedGoogleAccount(name) !== name) return false;
      readStoredGoogleToken(accountsDir, name);
      return true;
    } catch {
      return false;
    }
  });
}
