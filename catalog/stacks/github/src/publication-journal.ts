import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import type { PublicationJournal, PublicationRecord } from "./review-publisher.js";

export async function openPublicationJournal(directory: string): Promise<PublicationJournal> {
  if (!isAbsolute(directory) || !process.geteuid) throw new Error("Journal requires a private POSIX directory");
  const uid = process.geteuid();
  const initial = await lstat(directory);
  if (!initial.isDirectory() || initial.isSymbolicLink() || initial.uid !== uid || (initial.mode & 0o077)) {
    throw new Error("Journal directory must be private and owned by the publisher");
  }
  const root = await realpath(directory);
  const held = new Set<string>();
  const validateRoot = async () => {
    const current = await lstat(root);
    if (!current.isDirectory() || current.dev !== initial.dev || current.ino !== initial.ino
      || current.uid !== uid || (current.mode & 0o077)) throw new Error("Journal directory changed");
  };
  const pathFor = (key: string) => {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid publication operation ID");
    return join(root, `${key}.json`);
  };
  const read = async (key: string): Promise<PublicationRecord | undefined> => {
    await validateRoot();
    const path = pathFor(key);
    let file;
    try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if (code(error) === "ENOENT") return undefined; throw error; }
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o077) || stat.size > 4096 || stat.nlink !== 1) {
        throw new Error("Unsafe publication record");
      }
      return validateRecord(JSON.parse(await file.readFile("utf8")), key);
    } finally { await file.close(); }
  };
  return {
    read,
    async write(key, record) {
      await validateRoot();
      const target = pathFor(key);
      if (!held.has(key)) throw new Error("Publication write requires an owned lock");
      const value = validateRecord(record, key);
      const previous = await read(key);
      if (previous?.phase === "complete") throw new Error("Completed publication records are immutable");
      const temporary = join(root, `${key}.${randomUUID()}.tmp`);
      const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try {
        await file.writeFile(`${JSON.stringify(value)}\n`);
        await file.sync();
        await file.close();
        await rename(temporary, target);
        const parent = await open(root, constants.O_RDONLY);
        try { await parent.sync(); } finally { await parent.close(); }
      } finally {
        await file.close().catch(() => undefined);
        await unlink(temporary).catch(error => { if (code(error) !== "ENOENT") throw error; });
      }
    },
    async withLock(key, operation) {
      await validateRoot();
      pathFor(key);
      const lock = join(root, `${key}.lock`);
      try { await mkdir(lock, { mode: 0o700 }); }
      catch (error) {
        if (code(error) === "EEXIST") throw new Error("Publication lock exists; reconcile before recovery");
        throw error;
      }
      const owned = await lstat(lock);
      held.add(key);
      try { return await operation(); }
      finally {
        held.delete(key);
        const current = await lstat(lock);
        if (current.dev !== owned.dev || current.ino !== owned.ino) throw new Error("Publication lock changed");
        await rmdir(lock);
      }
    },
  };
}

function code(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

function validateRecord(value: unknown, key: string): PublicationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid publication record");
  const record = value as PublicationRecord;
  const allowed = record.phase === "complete" ? ["phase", "operationId", "checkIds", "reviewId"] : ["phase", "operationId"];
  if (record.operationId !== key || !["uncertain", "complete"].includes(record.phase)
    || Object.keys(record).length !== allowed.length || allowed.some(name => !Object.hasOwn(record, name))) {
    throw new Error("Invalid publication record");
  }
  if (record.phase === "complete") {
    const ids = [...(Array.isArray(record.checkIds) ? record.checkIds : []), record.reviewId];
    if (ids.length !== 3 || new Set(record.checkIds).size !== 2
      || ids.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error("Invalid publication identities");
    }
  }
  return structuredClone(record);
}
