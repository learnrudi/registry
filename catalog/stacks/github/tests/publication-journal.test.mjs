import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPublicationJournal } from "../dist/publication-journal.js";

test("journal retains uncertain writes across process restarts and excludes overlapping publishers", async () => {
  const root = await mkdtemp(join(tmpdir(), "reviewer-journal-test-"));
  await chmod(root, 0o700);
  try {
    const key = "a".repeat(64);
    const first = await openPublicationJournal(root);
    const second = await openPublicationJournal(root);
    await first.withLock(key, async () => {
      await first.write(key, { phase: "uncertain", operationId: key });
      await assert.rejects(second.withLock(key, async () => {}), /Publication lock exists/);
    });
    assert.deepEqual(await second.read(key), { phase: "uncertain", operationId: key });
    await second.withLock(key, async () => {
      await second.write(key, { phase: "complete", operationId: key, checkIds: [10, 11], reviewId: 12 });
    });
    assert.equal((await (await openPublicationJournal(root)).read(key)).phase, "complete");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("journal rejects unsafe modes, symlink records, unlocked writes and mutation of completed records", async () => {
  const { symlink, writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "reviewer-journal-test-"));
  const key = "b".repeat(64);
  try {
    await chmod(root, 0o755);
    await assert.rejects(openPublicationJournal(root), /must be private/);
    await chmod(root, 0o700);
    const journal = await openPublicationJournal(root);
    await assert.rejects(journal.write(key, { phase: "uncertain", operationId: key }), /requires an owned lock/);
    await writeFile(join(root, "target"), "{}", { mode: 0o600 });
    await symlink(join(root, "target"), join(root, `${key}.json`));
    await assert.rejects(journal.read(key));
    await rm(join(root, `${key}.json`));
    await journal.withLock(key, async () => {
      await journal.write(key, { phase: "complete", operationId: key, checkIds: [1, 2], reviewId: 3 });
      await assert.rejects(journal.write(key, { phase: "uncertain", operationId: key }), /immutable/);
    });
    await assert.rejects(journal.read("../escape"), /Invalid publication operation ID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
