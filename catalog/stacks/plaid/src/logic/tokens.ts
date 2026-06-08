import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
  const storePath = getTokenStorePath();

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

export async function saveTokenStore(store: TokenStore): Promise<void> {
  const parsed = TokenStoreSchema.parse(store);
  const storePath = getTokenStorePath();
  const storeDir = dirname(storePath);
  const tmpPath = `${storePath}.${process.pid}.tmp`;

  await mkdir(storeDir, { recursive: true, mode: 0o700 });
  await writeFile(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, storePath);
  await chmod(storePath, 0o600);
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
  const store = await loadTokenStore();
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
  await saveTokenStore(store);

  return toPublicRecord(record);
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
  const store = await loadTokenStore();
  const record = store.items[itemId];
  if (!record) {
    throw new Error(`Plaid Item not found in local token store: ${itemId}`);
  }

  record.transactionsCursor = cursor;
  record.updatedAt = new Date().toISOString();
  store.items[itemId] = TokenRecordSchema.parse(record);
  await saveTokenStore(store);

  return toPublicRecord(store.items[itemId]);
}

export function redactItem(record: TokenRecord): PublicTokenRecord {
  return toPublicRecord(record);
}
