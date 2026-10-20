import { chmod, mkdir, open, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import {
  TokenRecordSchema,
  TokenStoreSchema,
  type PlaidEnvironment,
  type TokenRecord,
  type TokenStore,
} from "../schemas.js";

export interface PublicTokenRecord {
  itemId: string;
  environment: PlaidEnvironment;
  label?: string;
  institutionId?: string;
  institutionName?: string;
  products: string[];
  linkedAt: string;
  updatedAt: string;
  transactionsCursor?: string | null;
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

export function getTokenStorePath(): string {
  return resolve(
    expandHome(process.env.PLAID_TOKEN_STORE_PATH || "~/.plaid/tokens.json")
  );
}

function emptyStore(): TokenStore {
  return { version: 1, items: {} };
}

export async function loadTokenStore(): Promise<TokenStore> {
  return readTokenStore(getTokenStorePath());
}

async function readTokenStore(storePath: string): Promise<TokenStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    return TokenStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
}

// The lock covers the entire read/modify/replace transaction across processes.
// Never steal a lock by age: a paused live writer could otherwise overwrite data.
async function mutateTokenStore<T>(mutate: (store: TokenStore) => T): Promise<T> {
  const requestedPath = getTokenStorePath();
  await mkdir(dirname(requestedPath), { recursive: true, mode: 0o700 });
  const storePath = join(await realpath(dirname(requestedPath)), basename(requestedPath));
  const lockPath = `${storePath}.lock`;
  const deadline = Date.now() + 10_000;
  let lock;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error("Plaid token store is locked. If a writer crashed, stop all Plaid processes before removing the .lock file.");
      }
      await delay(25);
    }
  }
  try {
    const store = await readTokenStore(storePath);
    const result = mutate(store);
    await saveTokenStore(storePath, store);
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function saveTokenStore(storePath: string, store: TokenStore): Promise<void> {
  const parsed = TokenStoreSchema.parse(store);
  const tmpPath = `${storePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(tmpPath, storePath);
    await chmod(storePath, 0o600);
  } finally {
    await unlink(tmpPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function toPublicRecord(record: TokenRecord): PublicTokenRecord {
  return {
    itemId: record.itemId,
    environment: record.environment,
    label: record.label,
    institutionId: record.institutionId,
    institutionName: record.institutionName,
    products: record.products,
    linkedAt: record.linkedAt,
    updatedAt: record.updatedAt,
    transactionsCursor: record.transactionsCursor,
  };
}

export async function listLinkedItems(): Promise<PublicTokenRecord[]> {
  const store = await loadTokenStore();
  return Object.values(store.items).map(toPublicRecord);
}

export async function listLinkedTokenRecords(): Promise<TokenRecord[]> {
  const store = await loadTokenStore();
  return Object.values(store.items);
}

export async function saveLinkedItem(
  input: Omit<TokenRecord, "linkedAt" | "updatedAt"> &
    Partial<Pick<TokenRecord, "linkedAt" | "updatedAt">>
): Promise<PublicTokenRecord> {
  return mutateTokenStore((store) => {
    const now = new Date().toISOString();
    const existing = store.items[input.itemId];
    const record = TokenRecordSchema.parse({
      ...existing,
      ...input,
      linkedAt: input.linkedAt || existing?.linkedAt || now,
      updatedAt: now,
    });

    store.items[record.itemId] = record;
    store.defaultItemId = store.defaultItemId || record.itemId;
    return toPublicRecord(record);
  });
}

export async function getLinkedItem(itemId?: string): Promise<TokenRecord> {
  const store = await loadTokenStore();
  const resolvedItemId =
    itemId || store.defaultItemId || Object.keys(store.items)[0];

  if (!resolvedItemId) {
    throw new Error(
      "No Plaid Items are linked. Run `plaid link` or call plaid_create_link first."
    );
  }

  const record = store.items[resolvedItemId];
  if (!record) {
    throw new Error(`Plaid Item not found in local token store: ${resolvedItemId}`);
  }

  return record;
}

export async function updateTransactionsCursor(
  itemId: string,
  cursor: string | null
): Promise<PublicTokenRecord> {
  return mutateTokenStore((store) => {
    const record = store.items[itemId];
    if (!record) {
      throw new Error(`Plaid Item not found in local token store: ${itemId}`);
    }

    record.transactionsCursor = cursor;
    record.updatedAt = new Date().toISOString();
    store.items[itemId] = TokenRecordSchema.parse(record);
    return toPublicRecord(store.items[itemId]);
  });
}

export function redactItem(record: TokenRecord): PublicTokenRecord {
  return toPublicRecord(record);
}
