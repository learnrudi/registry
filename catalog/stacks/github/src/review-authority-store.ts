import { constants } from "node:fs";
import { lstat, realpath, open, link, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { openPublicationJournal } from "./publication-journal.js";
import { hashReviewBytes, parseReviewJson, reviewId, reviewMatch } from "./review-request.js";
import type { ReviewAuthority } from "./review-controller.js";

/** POSIX custody checks are necessary, not proof of host/ACL isolation. The
 * administrator must verify effective access for both roles before deployment. */
export async function openReviewAuthorityStore(directory: string, roles: { authorUid: number; workerUid: number }): Promise<ReviewAuthority & {
  loadAccepted(id: string): Promise<unknown>; writeAccepted(id: string, value: unknown): Promise<void>;
}> {
  const uid = process.geteuid?.();
  if (uid === undefined || uid === 0 || !isAbsolute(directory)
    || [roles.authorUid, roles.workerUid].some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set([uid, roles.authorUid, roles.workerUid]).size !== 3) throw new Error("Review authority requires distinct non-root identities");
  const initial = await lstat(directory);
  if (!initial.isDirectory() || initial.isSymbolicLink() || initial.uid !== uid || (initial.mode & 0o077)) throw new Error("Unsafe review authority root");
  const root = await realpath(directory);
  const journal = await openPublicationJournal(root);
  const held = new Set<string>();
  const validate = async () => {
    const current = await lstat(root);
    if (current.ino !== initial.ino || current.dev !== initial.dev || !current.isDirectory()
      || current.uid !== uid || (current.mode & 0o077)) throw new Error("Review authority root changed");
    await validateAncestors(root, uid);
  };
  const read = async (name: string, optional = false): Promise<string | undefined> => {
    await validate();
    let file;
    try { file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if (optional && code(error) === "ENOENT") return undefined; throw error; }
    try {
      const before = await file.stat();
      if (!before.isFile() || before.uid !== uid || before.nlink !== 1 || (before.mode & 0o077) || before.size > 600000) throw new Error("Unsafe review authority file");
      const buffer = Buffer.alloc(600001);
      let length = 0;
      while (length < buffer.length) {
        const result = await file.read(buffer, length, buffer.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      const after = await file.stat();
      if (length > 600000 || after.size !== before.size || after.mtimeMs !== before.mtimeMs || length !== after.size) throw new Error("Review authority file changed");
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
    } finally { await file.close(); }
  };
  const write = async (id: string, suffix: string, value: unknown) => {
    reviewId(id); await validate();
    if (!held.has(id)) throw new Error("Review authority write requires owned lock");
    const raw = JSON.stringify(value); parseReviewJson(raw);
    const temporary = join(root, `${id}.${randomUUID()}.tmp`);
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      await file.writeFile(raw); await file.sync(); await file.close();
      await validate();
      // link is atomic and refuses an existing target; crash debris never authorizes retry.
      await link(temporary, join(root, `${id}.${suffix}.json`));
      await unlink(temporary);
      const parent = await open(root, constants.O_RDONLY);
      try { await parent.sync(); } finally { await parent.close(); }
    } finally {
      await file.close().catch(() => undefined);
      await unlink(temporary).catch(error => { if (code(error) !== "ENOENT") throw error; });
    }
  };
  const optional = async (id: string, suffix: string) => {
    reviewId(id); const raw = await read(`${id}.${suffix}.json`, true);
    return raw === undefined ? undefined : parseReviewJson(raw);
  };
  await validate();
  return {
    async loadCandidate(id) { reviewId(id); return (await read(`${id}.candidate.json`))!; },
    async loadPolicy() { return (await read("policy.json"))!; },
    async loadProof(digest) { reviewMatch(digest, /^[a-f0-9]{64}$/); return (await read(`${digest}.proof.json`))!; },
    async loadRuntimeProof(digest) { reviewMatch(digest, /^[a-f0-9]{64}$/); return (await read(`${digest}.runtime-proof.json`))!; },
    loadIntent: id => optional(id, "intent"), loadAudit: id => optional(id, "audit"),
    writeIntent: (id, value) => write(id, "intent", value), writeAudit: (id, value) => write(id, "audit", value),
    loadAccepted: id => optional(id, "accepted"),
    writeAccepted: (id, value) => write(id, "accepted", value),
    async withLock(id, operation) {
      reviewId(id); await validate();
      return journal.withLock(hashReviewBytes(`native-review:${id}`), async () => {
        held.add(id);
        try { return await operation(); } finally { held.delete(id); }
      });
    },
  };
}
async function validateAncestors(root: string, uid: number): Promise<void> {
  let path = dirname(root);
  while (true) {
    const stat = await lstat(path);
    const safeSticky = stat.uid === 0 && Boolean(stat.mode & 0o1000);
    if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, uid].includes(stat.uid)
      || ((stat.mode & 0o022) && !safeSticky)) throw new Error("Unsafe review authority ancestry");
    const parent = dirname(path); if (parent === path) return; path = parent;
  }
}
function code(error: unknown): unknown { return error && typeof error === "object" && "code" in error ? error.code : undefined; }
