import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";
import { updateRootPolicy } from "../src/core.js";

const git = (repo, ...args) => execFileSync("git", ["-C", repo, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "repo-steward-policy-"));
  const repo = join(root, "repo"), stateRoot = join(root, "state");
  execFileSync("git", ["init", "-b", "main", repo], { stdio: "ignore" });
  git(repo, "config", "user.name", "Policy Fixture");
  git(repo, "config", "user.email", "policy@example.invalid");
  await writeFile(join(repo, "source.md"), "source\n");
  git(repo, "add", "source.md");
  git(repo, "commit", "-m", "test: initial source");
  const server = createServer({ stateRoot });
  const client = new Client({ name: "policy-test", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  t.after(async () => {
    await client.close(); await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const call = (name, args) => client.callTool({ name, arguments: args });
  const enrolled = await call("repo_steward_enroll_root", {
    root_id: "fixture", root_path: repo, owner: "test", max_depth: 3,
  });
  assert.equal(enrolled.isError, undefined);
  const parsed = JSON.parse(enrolled.content[0].text);
  const args = { root_id: "fixture", root_path: parsed.root.path, owner: "test",
    fetch_allowed: true, expected_version: 1, confirm_update: true,
    approval_reference: "Owner approved bounded source updates" };
  return { root, repo, stateRoot, call, args };
}

test("MCP explicitly updates one enrolled root policy without changing Git", async (t) => {
  const f = await fixture(t);
  const before = git(f.repo, "rev-parse", "HEAD");
  const result = await f.call("repo_steward_update_root_policy", f.args);
  assert.equal(result.isError, undefined, result.content[0].text);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.enrollment_version, 2);
  assert.equal(body.idempotent, false);
  assert.deepEqual(body.root, { root_id: "fixture", path: f.args.root_path,
    fetch_allowed: true, max_depth: 3 });
  const discovery = JSON.parse((await f.call("repo_steward_discover_repositories", {
    root_ids: ["fixture"],
  })).content[0].text);
  assert.equal(discovery.repositories[0].fetch_allowed, true);
  const state = JSON.parse(await readFile(join(f.stateRoot, "enrollment.json"), "utf8"));
  assert.equal(state.history.at(-1).event, "root_policy_updated");
  assert.equal(state.history.at(-1).previous_fetch_allowed, false);
  assert.equal(state.history.at(-1).fetch_allowed, true);
  assert.equal(state.history.at(-1).approval_reference, f.args.approval_reference);
  assert.equal(git(f.repo, "rev-parse", "HEAD"), before);
  assert.equal(git(f.repo, "status", "--porcelain"), "");
  assert.equal(git(f.repo, "remote"), "");
});

test("an exact immediate policy retry is idempotent but stale intent is rejected", async (t) => {
  const f = await fixture(t);
  const first = await f.call("repo_steward_update_root_policy", f.args);
  assert.equal(first.isError, undefined);
  const file = join(f.stateRoot, "enrollment.json");
  const beforeRetry = await readFile(file, "utf8");
  const retry = await f.call("repo_steward_update_root_policy", f.args);
  assert.equal(retry.isError, undefined, retry.content[0].text);
  assert.equal(JSON.parse(retry.content[0].text).idempotent, true);
  assert.equal(await readFile(file, "utf8"), beforeRetry);
  const stale = await f.call("repo_steward_update_root_policy", {
    ...f.args, owner: "different-owner",
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /version conflict/);
  const disabled = await f.call("repo_steward_update_root_policy", {
    ...f.args, expected_version: 2, fetch_allowed: false,
  });
  assert.equal(disabled.isError, undefined);
  const superseded = await f.call("repo_steward_update_root_policy", f.args);
  assert.equal(superseded.isError, true);
  assert.match(superseded.content[0].text, /version conflict/);
});

test("invalid policy requests preserve enrollment bytes", async (t) => {
  const f = await fixture(t);
  const file = join(f.stateRoot, "enrollment.json");
  const before = await readFile(file, "utf8");
  const invalid = [
    { confirm_update: false }, { confirm_update: undefined },
    { fetch_allowed: undefined }, { fetch_allowed: "true" },
    { expected_version: undefined }, { expected_version: 0 }, { expected_version: 9 },
    { approval_reference: "" }, { owner: "" }, { root_id: "missing" },
    { root_path: f.root }, { root_path: "relative" }, { max_depth: 32 },
  ];
  for (const patch of invalid) {
    const result = await f.call("repo_steward_update_root_policy", { ...f.args, ...patch });
    assert.equal(result.isError, true, JSON.stringify(patch));
    assert.equal(await readFile(file, "utf8"), before);
  }
});

test("policy updates retain prior evidence and no-op requests do not write", async (t) => {
  const f = await fixture(t);
  const file = join(f.stateRoot, "enrollment.json");
  const before = JSON.parse(await readFile(file, "utf8"));
  const noOp = await f.call("repo_steward_update_root_policy", { ...f.args, fetch_allowed: false });
  assert.equal(noOp.isError, undefined);
  assert.equal(JSON.parse(noOp.content[0].text).enrollment_version, 1);
  const approved = await f.call("repo_steward_update_root_policy", {
    ...f.args, approval_reference: "Approved at https://user:password@example.invalid/review",
  });
  assert.equal(approved.isError, undefined);
  const state = JSON.parse(await readFile(file, "utf8"));
  assert.equal(state.history[1].approval_reference, "Approved at https://[redacted]@example.invalid/review");
  const history = await readdir(join(f.stateRoot, "enrollment-history"));
  assert.equal(history.length, 1);
  assert.deepEqual(JSON.parse(await readFile(join(f.stateRoot, "enrollment-history", history[0]), "utf8")), before);
});

test("external roots and active enrollment locks cannot be bypassed", async (t) => {
  const f = await fixture(t);
  const external = join(f.root, "external");
  await mkdir(external);
  const configPath = join(f.root, "config.json");
  await writeFile(configPath, JSON.stringify({ schemaVersion: 1,
    roots: [{ id: "external", path: external, fetchAllowed: false, maxDepth: 1 }] }));
  await assert.rejects(() => updateRootPolicy({ ...f.args, root_id: "external", root_path: external }, {
    stateRoot: f.stateRoot, configPath,
  }), /external configuration is read-only/);
  const file = join(f.stateRoot, "enrollment.json"), lock = join(f.stateRoot, ".enrollment.lock");
  const before = await readFile(file, "utf8");
  const locked = JSON.stringify({ owner: "another-operator", expires_at: new Date(Date.now() + 60_000).toISOString() });
  await writeFile(lock, locked);
  const result = await f.call("repo_steward_update_root_policy", f.args);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /already in progress/);
  assert.equal(await readFile(lock, "utf8"), locked);
  assert.equal(await readFile(file, "utf8"), before);
});

test("concurrent policy writers admit one versioned transition", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([
    f.call("repo_steward_update_root_policy", f.args),
    f.call("repo_steward_update_root_policy", { ...f.args, owner: "second-operator" }),
  ]);
  assert.equal(results.filter((r) => !r.isError).length, 1);
  assert.equal(results.filter((r) => r.isError).length, 1);
  const state = JSON.parse(await readFile(join(f.stateRoot, "enrollment.json"), "utf8"));
  assert.equal(state.version, 2);
  assert.equal(state.history.filter((r) => r.event === "root_policy_updated").length, 1);
});

test("policy transition preserves other enrolled roots and discovery limits", async (t) => {
  const f = await fixture(t);
  const other = join(f.root, "other");
  await mkdir(other);
  const enrolled = await f.call("repo_steward_enroll_root", {
    root_id: "other", root_path: other, owner: "test", max_depth: 7,
  });
  assert.equal(enrolled.isError, undefined);
  const file = join(f.stateRoot, "enrollment.json");
  const before = JSON.parse(await readFile(file, "utf8"));
  const result = await f.call("repo_steward_update_root_policy", { ...f.args, expected_version: 2 });
  assert.equal(result.isError, undefined);
  const after = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(after.roots, before.roots.map((r) => r.root_id === "fixture"
    ? { ...r, fetch_allowed: true } : r));
});

test("failed enrollment preservation leaves active policy unchanged and releases its lock", async (t) => {
  const f = await fixture(t);
  const file = join(f.stateRoot, "enrollment.json");
  const before = await readFile(file, "utf8");
  await writeFile(join(f.stateRoot, "enrollment-history"), "blocking fixture\n");
  const result = await f.call("repo_steward_update_root_policy", f.args);
  assert.equal(result.isError, true);
  assert.equal(await readFile(file, "utf8"), before);
  assert.equal((await readdir(f.stateRoot)).includes(".enrollment.lock"), false);
});
