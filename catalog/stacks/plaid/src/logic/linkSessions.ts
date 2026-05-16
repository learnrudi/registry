import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export interface StoredLinkSession {
  linkToken: string;
  hostedLinkUrl: string;
  expiration: string;
  requestId?: string;
  createdAt: string;
}

interface LinkSessionStore {
  version: 1;
  latestKey?: string;
  sessions: Record<string, StoredLinkSession>;
}

function expandHome(pathValue: string): string {
  if (pathValue === "~") {
    return homedir();
  }
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

export function getLinkSessionStorePath(): string {
  return resolve(
    expandHome(
      process.env.PLAID_LINK_SESSION_STORE_PATH ||
        "~/.plaid/link-sessions.json"
    )
  );
}

function emptyStore(): LinkSessionStore {
  return { version: 1, sessions: {} };
}

async function loadStore(): Promise<LinkSessionStore> {
  try {
    const raw = await readFile(getLinkSessionStorePath(), "utf8");
    const parsed = JSON.parse(raw) as LinkSessionStore;
    return {
      version: 1,
      latestKey: parsed.latestKey,
      sessions: parsed.sessions || {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
}

async function saveStore(store: LinkSessionStore): Promise<void> {
  const storePath = getLinkSessionStorePath();
  const tmpPath = `${storePath}.${process.pid}.tmp`;

  await mkdir(dirname(storePath), { recursive: true, mode: 0o700 });
  await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, storePath);
  await chmod(storePath, 0o600);
}

function sessionKey(session: StoredLinkSession): string {
  return session.requestId || session.linkToken;
}

export async function saveLinkSession(
  session: Omit<StoredLinkSession, "createdAt"> &
    Partial<Pick<StoredLinkSession, "createdAt">>
): Promise<StoredLinkSession> {
  const store = await loadStore();
  const stored: StoredLinkSession = {
    ...session,
    createdAt: session.createdAt || new Date().toISOString(),
  };
  const key = sessionKey(stored);

  store.sessions[key] = stored;
  store.latestKey = key;
  await saveStore(store);

  return stored;
}

export async function listLinkSessions(): Promise<StoredLinkSession[]> {
  const store = await loadStore();
  return Object.values(store.sessions).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function getLinkSession(
  selector?: string
): Promise<StoredLinkSession> {
  const store = await loadStore();
  const key = selector || store.latestKey;
  if (!key) {
    throw new Error("No stored Plaid Link sessions found.");
  }

  const session =
    store.sessions[key] ||
    Object.values(store.sessions).find(
      (candidate) =>
        candidate.linkToken === key ||
        candidate.requestId === key ||
        candidate.hostedLinkUrl === key
    );

  if (!session) {
    throw new Error(`Stored Plaid Link session not found: ${key}`);
  }

  return session;
}
