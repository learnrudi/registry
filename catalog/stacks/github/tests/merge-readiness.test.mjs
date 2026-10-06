import { nativeProvenance } from './fixtures/native-acceptance.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createMergeReadiness } from "../dist/merge-readiness.js";
import { createReviewPublisher } from "../dist/review-publisher.js";

const keys = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-03T12:00:00Z");
function fixture() {
  const binding = { repositoryId: 101, pullNumber: 7, baseSha: "a".repeat(40), headSha: "b".repeat(40), contractDigest: "c".repeat(64), proofDigest: "d".repeat(64), policyDigest: "e".repeat(64), model: "gpt-6-astra", effort: "xhigh", reviewerHostId: "review-host", authorHostId: "author-host" };
  const evidence = { ...binding, schemaVersion: 2, provenance: nativeProvenance(), executionId: "run-1", issuedAt: now - 1000, expiresAt: now + 300000, access: "read-only", verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" }, findings: [] };
  const payload = Buffer.from(JSON.stringify(evidence)).toString("base64url");
  const request = { binding, risk: "low", envelope: { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString("base64url") } };
  const publication = { phase: "complete", operationId: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"), checkIds: [1000, 1001], reviewId: 2000 };
  const policy = { appId: 123, botUserId: 321, repositories: [{ id: 101, owner: "example", repo: "project", baseBranch: "main" }], evidenceKey: keys.publicKey, model: "gpt-6-astra", effort: "xhigh", reviewerHostId: "review-host", requirePrivate: true, policyDigest: binding.policyDigest };
  const protection = { required_status_checks: { strict: true, checks: [{ context: "rudi/review", app_id: 123 }, { context: "rudi/proof", app_id: 123 }] }, enforce_admins: { enabled: true }, required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 1, bypass_pull_request_allowances: { users: [], teams: [], apps: [] } }, required_conversation_resolution: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, lock_branch: { enabled: false } };
  const pr = { number: 7, state: "OPEN", isDraft: false, baseRefName: "main", baseRefOid: binding.baseSha, headRefOid: binding.headSha, isCrossRepository: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", reviewThreads: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false } } };
  const state = { enabled: true, inspections: 0, branch: { name: "main", protected: true, commit: { sha: binding.baseSha } }, comparison: { status: "ahead", behind_by: 0, base_commit: { sha: binding.baseSha }, merge_base_commit: { sha: binding.baseSha } }, repo: { id: 101, full_name: "example/project", private: true, archived: false, disabled: false }, graph: { data: { repository: { databaseId: 101, isPrivate: true, pullRequest: pr } } }, reviews: [] };
  const calls = [];
  const deps = { now: () => now, loadRequest: async () => request, mergeEnabled: async () => state.enabled,
    inspectPublication: async () => { state.inspections += 1; return publication; },
    readTokenForRepository: async () => "synthetic-read-token",
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      calls.push({ path, method: init.method, body: init.body });
      assert.ok(init.method === "GET" || (path === "/graphql" && JSON.parse(init.body).query.trimStart().startsWith("query ")));
      let data;
      if (path === "/graphql") data = state.graph;
      else if (path.endsWith("/protection")) data = protection;
      else if (path.endsWith("/branches/main")) data = state.branch;
      else if (path.includes("/compare/")) data = state.comparison;
      else if (path.endsWith("/reviews")) data = state.reviews;
      else if (path === "/repos/example/project") data = state.repo;
      else throw new Error(`Unexpected read ${path}`);
      return Response.json(data);
    },
  };
  return { binding, policy, deps, request, publication, state, pr, protection, calls };
}

test("collects current GitHub rules and exact-revision acceptance without any mutation", async () => {
  const f = fixture();
  const result = await createMergeReadiness(f.policy, f.deps).inspect("request-1");
  assert.equal(result.status, "ready-at-observation");
  assert.equal(result.mergeAuthorized, false);
  assert.equal(result.headSha, f.binding.headSha);
  assert.equal(result.operationId, f.publication.operationId);
  assert.ok(f.calls.some(call => call.path.endsWith("/protection")));
  assert.ok(f.calls.some(call => call.path === "/graphql"));
  assert.equal(f.state.inspections, 2);
});

const rejected = /Merge readiness rejected; current authority, rules, revisions and acceptance must all be verified/;
test("requires accepted risk, current policy, authentic evidence and enabled merging before API reads", async () => {
  for (const change of [
    f => { f.request.risk = "high"; },
    f => { f.request.risk = "unknown"; },
    f => { f.policy.policyDigest = "f".repeat(64); },
    f => { f.policy.model = "another-model"; },
    f => { f.policy.repositories[0].id = 999; },
    f => { f.request.envelope.signature = "x".repeat(86); },
    f => { f.deps.now = () => now + 300001; },
    f => { f.state.enabled = false; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
    assert.equal(f.calls.length, 0);
  }
});

test("rejects weakened, unpinned, bypassed, locked or incomplete branch protection", async () => {
  for (const change of [
    p => { p.required_status_checks.strict = false; },
    p => { p.required_status_checks.checks[0].app_id = -1; },
    p => { p.required_status_checks.checks.pop(); },
    p => { p.required_status_checks.checks.push(p.required_status_checks.checks[0]); },
    p => { p.enforce_admins.enabled = false; },
    p => { p.required_conversation_resolution.enabled = false; },
    p => { p.allow_force_pushes.enabled = true; },
    p => { p.allow_deletions.enabled = true; },
    p => { p.lock_branch.enabled = true; },
    p => { p.required_pull_request_reviews.dismiss_stale_reviews = false; },
    p => { p.required_pull_request_reviews.required_approving_review_count = 0; },
    p => { p.required_pull_request_reviews.bypass_pull_request_allowances.apps.push({ id: 123 }); },
    p => { delete p.required_status_checks; },
  ]) {
    const f = fixture(); change(f.protection);
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
  }
});

test("rejects changed repository identity, revisions and base ancestry", async () => {
  for (const change of [
    f => { f.state.repo.id = 999; },
    f => { f.state.repo.private = false; },
    f => { f.state.repo.archived = true; },
    f => { f.state.branch.commit.sha = "f".repeat(40); },
    f => { f.state.branch.protected = false; },
    f => { f.state.comparison.merge_base_commit.sha = "f".repeat(40); },
    f => { f.state.comparison.behind_by = 1; },
    f => { f.state.comparison.status = "diverged"; },
    f => { f.pr.headRefOid = "f".repeat(40); },
    f => { f.pr.baseRefOid = "f".repeat(40); },
    f => { f.pr.isCrossRepository = true; },
    f => { f.state.graph.data.repository.databaseId = 999; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
  }
});

test("rejects unknown mergeability, unmet native approval and unresolved or truncated discussions", async () => {
  for (const change of [
    f => { f.pr.mergeable = "UNKNOWN"; },
    f => { f.pr.mergeStateStatus = "UNSTABLE"; },
    f => { f.pr.reviewDecision = "REVIEW_REQUIRED"; },
    f => { f.pr.isDraft = true; },
    f => { f.pr.state = "MERGED"; },
    f => { f.pr.reviewThreads.nodes.push({ isResolved: false }); f.pr.reviewThreads.totalCount = 1; },
    f => { f.pr.reviewThreads.totalCount = 101; f.pr.reviewThreads.pageInfo.hasNextPage = true; },
    f => { f.pr.reviewThreads = null; },
    f => { f.state.graph.errors = [{ message: "private synthetic diagnostic" }]; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
  }
});

test("a later comment cannot clear a review veto and incomplete review history cannot prove acceptance", async () => {
  for (const reviews of [
    [{ user: { id: 42 }, state: "CHANGES_REQUESTED" }, { user: { id: 42 }, state: "COMMENTED" }],
    [{ user: { id: 42 }, state: "CHANGES_REQUESTED" }, { user: { id: 43 }, state: "APPROVED" }],
    [{ user: { id: 42 }, state: "UNKNOWN" }],
    Array.from({ length: 100 }, () => ({ user: { id: 42 }, state: "APPROVED" })),
  ]) {
    const f = fixture(); f.state.reviews = reviews;
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
  }
  const f = fixture();
  f.state.reviews = [{ user: { id: 42 }, state: "CHANGES_REQUESTED" }, { user: { id: 42 }, state: "APPROVED" }];
  f.pr.reviewThreads = { totalCount: 1, nodes: [{ isResolved: true }], pageInfo: { hasNextPage: false } };
  assert.equal((await createMergeReadiness(f.policy, f.deps).inspect("request-1")).status, "ready-at-observation");
});

test("rejects historical or mismatched publication receipts", async () => {
  for (const change of [
    p => { p.phase = "uncertain"; },
    p => { p.operationId = "f".repeat(64); },
    p => { p.auditOnly = true; },
  ]) {
    const f = fixture(); change(f.publication);
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
    assert.equal(f.calls.length, 0);
  }
});

test("rechecks revisions, rules, reviews, enable control, evidence expiry and publication identity before returning", async () => {
  for (const change of [
    f => { f.state.branch.commit.sha = "f".repeat(40); },
    f => { f.protection.enforce_admins.enabled = false; },
    f => { f.pr.reviewDecision = "CHANGES_REQUESTED"; },
    f => { f.state.enabled = false; },
    f => { f.state.elapsed = 300001; },
    f => { f.publication.reviewId += 1; },
    f => { f.publication.checkIds[0] += 100; },
  ]) {
    const f = fixture();
    f.deps.now = () => now + (f.state.elapsed ?? 0);
    const inspect = f.deps.inspectPublication;
    f.deps.inspectPublication = async id => {
      const record = await inspect(id);
      if (f.state.inspections === 2) change(f);
      return record;
    };
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), rejected);
  }
});

test("redacts dependency failures and malformed upstream responses", async () => {
  for (const change of [
    f => { f.deps.loadRequest = async () => { throw new Error("private request text"); }; },
    f => { f.deps.readTokenForRepository = async () => { throw new Error("synthetic-secret-token"); }; },
    f => { f.state.graph = null; },
    f => { f.deps.fetchImpl = async () => Response.json({ message: "private upstream body" }, { status: 403 }); },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(createMergeReadiness(f.policy, f.deps).inspect("request-1"), error => {
      assert.match(error.message, rejected);
      assert.equal(Object.keys(error).length, 0);
      return true;
    });
  }
});

test("composes the canonical publisher inspector and rejects a revoked live check despite a complete journal", async () => {
  const f = fixture();
  const checks = ["rudi/review", "rudi/proof"].map((name, i) => ({
    name, id: f.publication.checkIds[i], app: { id: f.policy.appId }, head_sha: f.binding.headSha,
    external_id: f.publication.operationId, status: "completed", conclusion: "success",
  }));
  const review = { id: f.publication.reviewId, user: { id: f.policy.botUserId, type: "Bot" },
    commit_id: f.binding.headSha, state: "APPROVED", body: `Independent review passed: Standards, Spec and Proof.\n\nEvidence: ${f.publication.operationId}\nAssurance: verified native session configuration. Effective provider execution is not attested.` };
  f.state.reviews = [review];
  const baseFetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.includes("/check-runs") || path.endsWith("/reviews/2000") || path.endsWith("/pulls/7")) {
      assert.equal(init.method, "GET");
      f.calls.push({ path, method: init.method });
      if (path.endsWith("/check-runs")) return Response.json({ total_count: 2, check_runs: checks });
      if (path.includes("/check-runs/")) return Response.json(checks.find(c => c.id === Number(path.split("/").at(-1))));
      if (path.endsWith("/reviews/2000")) return Response.json(review);
      return Response.json({ number: 7, state: "open", draft: false, merged: false, auto_merge: null,
        base: { ref: "main", sha: f.binding.baseSha, repo: { id: 101 } }, head: { sha: f.binding.headSha, repo: { id: 101 } } });
    }
    return baseFetch(url, init);
  };
  const publisher = createReviewPublisher(f.policy, {
    loadRequest: f.deps.loadRequest, enabled: f.deps.mergeEnabled,
    tokenForRepository: f.deps.readTokenForRepository, fetchImpl: f.deps.fetchImpl, now: f.deps.now,
    journal: { withLock: async (_id, fn) => fn(), read: async () => f.publication,
      write: async () => assert.fail("Read-only inspection must not update the journal") },
  });
  f.deps.inspectPublication = publisher.inspect;
  const readiness = createMergeReadiness(f.policy, f.deps);
  assert.equal((await readiness.inspect("request-1")).status, "ready-at-observation");
  checks[0].conclusion = "failure";
  await assert.rejects(readiness.inspect("request-1"), rejected);
  assert.ok(f.calls.some(c => c.path.endsWith("/check-runs/1000")));
});
