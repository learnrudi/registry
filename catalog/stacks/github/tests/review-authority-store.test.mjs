import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openReviewAuthorityStore } from "../dist/review-authority-store.js";

const roles = { authorUid: process.geteuid() + 1, workerUid: process.geteuid() + 2 };
async function directory() { const path = await mkdtemp(join(tmpdir(), "review-authority-")); await chmod(path, 0o700); return path; }
test("protected authority stores immutable intent/audit and reads only exact private files", async () => {
  const root = await directory();
  try {
    await writeFile(join(root, "request-1.candidate.json"), '{"fixture":"private source"}', { mode: 0o600 });
    const store = await openReviewAuthorityStore(root, roles);
    assert.equal(await store.loadCandidate("request-1"), '{"fixture":"private source"}');
    await writeFile(join(root, `${"a".repeat(64)}.runtime-proof.json`), '{"proof":"runtime"}', {mode:0o600});
    assert.equal(await store.loadRuntimeProof("a".repeat(64)), '{"proof":"runtime"}');
    await assert.rejects(store.loadRuntimeProof("../escape"));
    assert.equal(await store.loadIntent("request-1"), undefined);
    await assert.rejects(store.writeIntent("request-1", { status: "started" }), /lock/);
    await store.withLock("request-1", async () => {
      await store.writeIntent("request-1", { status: "started" });
      await assert.rejects(store.writeIntent("request-1", { status: "overwrite" }));
      await store.writeAudit("request-1", { status: "held" });
      await store.writeAccepted("request-1", { fixture: "signed evidence" });
      await assert.rejects(store.writeAccepted("request-1", { fixture: "replacement" }));
    });
    assert.deepEqual(await store.loadIntent("request-1"), { status: "started" });
    assert.deepEqual(await store.loadAccepted("request-1"), { fixture: "signed evidence" });
    assert.equal((await stat(join(root, "request-1.audit.json"))).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(join(root, "request-1.audit.json"), "utf8")), { status: "held" });
    await assert.rejects(store.loadCandidate("../escape"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("authority store rejects same-UID roles and group-readable roots or records", async () => {
  const root = await directory();
  try {
    await assert.rejects(openReviewAuthorityStore(root, { ...roles, authorUid: process.geteuid() }), /distinct/);
    await chmod(root, 0o750);
    await assert.rejects(openReviewAuthorityStore(root, roles), /Unsafe/);
    await chmod(root, 0o700);
    const store = await openReviewAuthorityStore(root, roles);
    await writeFile(join(root, "policy.json"), "{}", { mode: 0o640 });
    await assert.rejects(store.loadPolicy(), /Unsafe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("authority store rejects symlinks, hard links and competing locks", async () => {
  const { symlink, link } = await import("node:fs/promises");
  const root = await directory();
  try {
    const store = await openReviewAuthorityStore(root, roles);
    await writeFile(join(root, "target.json"), "{}", { mode: 0o600 });
    await symlink(join(root, "target.json"), join(root, "policy.json"));
    await assert.rejects(store.loadPolicy());
    await link(join(root, "target.json"), join(root, "request-1.candidate.json"));
    await assert.rejects(store.loadCandidate("request-1"), /Unsafe/);
    await store.withLock("request-1", async () => {
      await assert.rejects(store.withLock("request-1", async () => { throw new Error("Should not execute"); }), /lock exists/);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
