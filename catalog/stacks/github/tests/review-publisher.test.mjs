import { nativeProvenance } from './fixtures/native-acceptance.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createReviewPublisher } from "../dist/review-publisher.js";

const keys = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-03T12:00:00Z");
function fixture() {
  const binding = { repositoryId: 101, pullNumber: 7, baseSha: "a".repeat(40), headSha: "b".repeat(40), contractDigest: "c".repeat(64), proofDigest: "d".repeat(64), policyDigest: "e".repeat(64), model: "gpt-6-astra", effort: "xhigh", reviewerHostId: "review-host", authorHostId: "author-host" };
  const evidence = { ...binding, schemaVersion: 2, provenance: nativeProvenance(), executionId: "execution-123", issuedAt: now - 1000, expiresAt: now + 300000, access: "read-only", verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" }, findings: [] };
  const payload = Buffer.from(JSON.stringify(evidence)).toString("base64url");
  const request = { binding, envelope: { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString("base64url") } };
  const records = new Map();
  const checks = new Map();
  const reviews = [];
  const writes = [];
  const policy = { appId: 123, botUserId: 321, repositories: [{ id: 101, owner: "example", repo: "project", baseBranch: "main" }], evidenceKey: keys.publicKey, model: "gpt-6-astra", effort: "xhigh", reviewerHostId: "review-host" };
  const state = { enabled: true, headSha: binding.headSha, baseSha: binding.baseSha, autoMerge: null };
  const deps = {
    now: () => now, enabled: async () => state.enabled,
    loadRequest: async () => request, tokenForRepository: async () => "synthetic-installation-token",
    journal: { withLock: async (_key, fn) => fn(), read: async key => records.get(key), write: async (key, record) => { records.set(key, structuredClone(record)); } },
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      const body = init.body ? JSON.parse(init.body) : undefined;
      let data;
      if (init.method === "GET" && path.endsWith("/pulls/7")) data = { number: 7, state: "open", draft: false, merged: false, auto_merge: state.autoMerge, base: { ref: "main", sha: state.baseSha, repo: { id: 101 } }, head: { sha: state.headSha, repo: { id: 101 } } };
      else if (init.method === "GET" && path.endsWith("/branches/main")) data = { commit: { sha: state.baseSha } };
      else if (init.method === "GET" && path.includes("/check-runs/")) data = checks.get(Number(path.split("/").at(-1)));
      else if (init.method === "GET" && path.endsWith("/check-runs")) {
        const values = new URL(url).searchParams.get("filter") === "latest"
          ? [...new Map([...checks.values()].map(check => [check.name, check])).values()] : [...checks.values()];
        data = { total_count: values.length, check_runs: values };
      }
      else if (init.method === "GET" && path.endsWith("/reviews")) data = reviews;
      else if (init.method === "GET" && path.includes("/reviews/")) data = reviews.find(r => r.id === Number(path.split("/").at(-1)));
      else if (init.method === "POST" && path.endsWith("/check-runs")) {
        data = { ...body, id: 1000 + checks.size, app: { id: 123 } }; checks.set(data.id, data); writes.push({ method: init.method, path, body });
      } else if (init.method === "POST" && path.endsWith("/reviews")) {
        data = { ...body, id: 2000, user: { id: 321, type: "Bot" }, state: "APPROVED" }; reviews.push(data); writes.push({ method: init.method, path, body });
      } else if (init.method === "PATCH" && path.includes("/check-runs/")) {
        const id = Number(path.split("/").at(-1)); data = { ...checks.get(id), ...body }; checks.set(id, data); writes.push({ method: init.method, path, body });
      } else throw new Error(`Unexpected route: ${init.method} ${path}`);
      return new Response(JSON.stringify(data), { status: init.method === "POST" ? 201 : 200 });
    },
  };
  return { policy, deps, state, writes, checks, reviews, records, request };
}

test("publishes revision-bound approval with pending checks before marking acceptance successful", async () => {
  const f = fixture();
  const result = await createReviewPublisher(f.policy, f.deps).publish("request-1");
  assert.equal(result.phase, "complete");
  assert.deepEqual(f.writes.map(w => w.method), ["POST", "POST", "POST", "PATCH", "PATCH"]);
  assert.deepEqual(f.writes.slice(0, 2).map(w => w.body.status), ["in_progress", "in_progress"]);
  assert.equal(f.reviews[0].commit_id, f.request.binding.headSha);
  assert.equal(f.reviews[0].event, "APPROVE");
  assert.deepEqual([...f.checks.values()].map(c => c.conclusion), ["success", "success"]);
  assert.equal(JSON.stringify(result).includes("synthetic-installation-token"), false);
});

test("enabled or unknown auto-merge blocks publication before any write", async () => {
  for (const autoMerge of [{ merge_method: "squash" }, undefined, false]) {
    const f = fixture();
    f.state.autoMerge = autoMerge;
    await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"));
    assert.equal(f.writes.length, 0);
    assert.equal(f.records.size, 0);
  }
});

test("published reviews and checks disclose native configuration assurance", async () => {
  const f=fixture();
  await createReviewPublisher(f.policy,f.deps).publish('request-1');
  assert.match(f.reviews[0].body,/native session configuration/i);
  assert.match(f.reviews[0].body,/provider execution is not attested/i);
  for(const check of f.checks.values()) {
    assert.match(check.output.summary,/native session configuration/i);
    assert.match(check.output.summary,/provider execution is not attested/i);
  }
});

test("auto-merge enabled during publication or token refresh stops the next mutation", async () => {
  for (const afterWrites of [0, 1, 2, 3, 4]) {
    const f = fixture();
    f.deps.tokenForRepository = async () => {
      if (f.records.size && f.writes.length === afterWrites) f.state.autoMerge = { merge_method: "squash" };
      return "synthetic-installation-token";
    };
    await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"));
    assert.equal(f.writes.length, afterWrites);
    assert.equal([...f.records.values()][0].phase, "uncertain");
  }
});

test("enabling auto-merge revokes live inspection while historical reconciliation remains read-only", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  await publisher.publish("request-1");
  f.state.autoMerge = { merge_method: "squash" };
  await assert.rejects(publisher.inspect("request-1"));
  assert.equal((await publisher.reconcile("request-1")).auditOnly, true);
  assert.equal(f.writes.length, 5);
});

test("duplicate delivery does not duplicate approvals or check runs", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  const first = await publisher.publish("request-1");
  assert.deepEqual(await publisher.publish("request-1"), first);
  assert.equal(f.writes.length, 5);
});

test("disabled publishing, forged evidence and advanced revisions make no writes", async () => {
  for (const change of [
    f => { f.state.enabled = false; },
    f => { f.state.headSha = "f".repeat(40); },
    f => { f.state.baseSha = "f".repeat(40); },
    f => { f.request.envelope.signature = "x".repeat(86); },
    f => { f.policy.model = "other-model"; },
    f => { f.policy.repositories[0].id = 999; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"), /Review publication stopped/);
    assert.equal(f.writes.length, 0);
  }
});

test("unknown write outcome is retained and a repeated trigger cannot retry mutations", async () => {
  const f = fixture();
  const baseFetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, init) => {
    const response = await baseFetch(url, init);
    if (init.method === "POST" && String(url).endsWith("/reviews")) throw new Error("response lost");
    return response;
  };
  const publisher = createReviewPublisher(f.policy, f.deps);
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  assert.equal(f.reviews.length, 1);
  assert.equal([...f.records.values()][0].phase, "uncertain");
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  assert.equal(f.reviews.length, 1);
  assert.equal(f.writes.length, 3);
  assert.deepEqual([...f.checks.values()].map(c => c.status), ["in_progress", "in_progress"]);
});

test("head movement after check creation blocks approval and successful checks", async () => {
  const f = fixture();
  const baseFetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, init) => {
    const response = await baseFetch(url, init);
    if (f.writes.length === 2) f.state.headSha = "f".repeat(40);
    return response;
  };
  await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"), /Review publication stopped/);
  assert.equal(f.reviews.length, 0);
  assert.equal(f.writes.length, 2);
});


test("reconciliation recognizes a final response lost after GitHub accepted both checks, without repeating writes", async () => {
  const f = fixture();
  const baseFetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, init) => {
    const response = await baseFetch(url, init);
    if (init.method === "PATCH" && String(url).endsWith("/1001")) throw new Error("response lost");
    return response;
  };
  const publisher = createReviewPublisher(f.policy, f.deps);
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  assert.equal([...f.records.values()][0].phase, "uncertain");
  assert.equal((await publisher.reconcile("request-1")).phase, "complete");
  assert.equal(f.writes.length, 5);
});

test("reconciliation rejects partial, foreign, duplicate or truncated evidence without writes", async () => {
  for (const change of [
    f => { [...f.checks.values()][0].status = "in_progress"; },
    f => { [...f.checks.values()][0].app.id = 999; },
    f => { f.reviews[0].state = "DISMISSED"; },
    f => { f.reviews.push({ ...f.reviews[0], id: 2001 }); },
    f => { while (f.reviews.length < 100) f.reviews.push({ id: f.reviews.length, user: { id: 999 } }); },
  ]) {
    const f = fixture();
    const publisher = createReviewPublisher(f.policy, f.deps);
    const result = await publisher.publish("request-1");
    f.records.set(result.operationId, { phase: "uncertain", operationId: result.operationId });
    change(f);
    await assert.rejects(publisher.reconcile("request-1"), /Review publication stopped/);
    assert.equal(f.writes.length, 5);
    assert.equal(f.records.get(result.operationId).phase, "uncertain");
  }
});

test("completed local journal cannot override revoked live acceptance", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  await publisher.publish("request-1");
  f.reviews[0].state = "DISMISSED";
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  assert.equal(f.writes.length, 5);
});

test("disable or expiry during token acquisition stops the mutation before dispatch", async () => {
  for (const mode of ["disable", "expire"]) {
    const f = fixture();
    let tick = now;
    f.deps.now = () => tick;
    f.deps.tokenForRepository = async () => {
      // Initial current-state reads finish before the first check creation.
      if (f.records.size) {
        if (mode === "disable") f.state.enabled = false;
        else tick += 3600000;
      }
      return "synthetic-installation-token";
    };
    await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"), /Review publication stopped/);
    assert.equal(f.writes.length, 0);
  }
});

test("read-only reconciliation works after shutdown and evidence expiry without authorizing another publication", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  const result = await publisher.publish("request-1");
  f.records.set(result.operationId, { phase: "uncertain", operationId: result.operationId });
  f.state.enabled = false;
  f.deps.now = () => now + 3600000;
  const stoppedPublisher = createReviewPublisher(f.policy, f.deps);
  assert.equal((await stoppedPublisher.reconcile("request-1")).phase, "complete");
  assert.equal(f.writes.length, 5);
  await assert.rejects(stoppedPublisher.publish("request-1"), /Review publication stopped/);
});

test("reconciliation can audit an old completed publication after the branch advances, but cannot publish it again", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  const result = await publisher.publish("request-1");
  f.records.set(result.operationId, { phase: "uncertain", operationId: result.operationId });
  f.state.headSha = "f".repeat(40);
  assert.equal((await publisher.reconcile("request-1")).phase, "complete");
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  assert.equal(f.writes.length, 5);
});

test("a newer request-changes review from the configured bot revokes the old publication", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  await publisher.publish("request-1");
  f.reviews.push({ ...f.reviews[0], id: 2001, state: "CHANGES_REQUESTED", body: "New blocker" });
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  await assert.rejects(publisher.reconcile("request-1"), /Review publication stopped/);
  assert.equal(f.writes.length, 5);
});

test("process-crash recovery preserves the uncertain journal and performs GET-only reconciliation after a verified drain", async () => {
  const { mkdtemp, chmod, rm, rename } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { openPublicationJournal } = await import("../dist/publication-journal.js");
  const root = await mkdtemp(join(tmpdir(), "reviewer-crash-test-"));
  await chmod(root, 0o700);
  try {
    const f = fixture();
    const completed = await createReviewPublisher(f.policy, f.deps).publish("request-1");
    const key = completed.operationId;
    const moduleUrl = new URL("../dist/publication-journal.js", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { openPublicationJournal } from ${JSON.stringify(moduleUrl)};
      const journal = await openPublicationJournal(${JSON.stringify(root)});
      await journal.withLock(${JSON.stringify(key)}, async () => {
        await journal.write(${JSON.stringify(key)}, { phase: "uncertain", operationId: ${JSON.stringify(key)} });
        process.exit(17);
      });
    `], { timeout: 3000 });
    assert.equal(child.status, 17); // Known sole writer is dead, not a TTL assumption.
    const journal = await openPublicationJournal(root);
    await assert.rejects(journal.withLock(key, async () => {}), /Publication lock exists/);
    const before = await journal.read(key);
    // Operator-only recovery: after all writers are drained, preserve the orphan lock.
    await rename(join(root, `${key}.lock`), join(root, `${key}.orphan-lock`));
    assert.deepEqual(await journal.read(key), before);
    f.deps.journal = journal;
    const result = await createReviewPublisher(f.policy, f.deps).reconcile("request-1");
    assert.equal(result.phase, "complete");
    assert.equal(result.auditOnly, true);
    assert.equal(f.writes.length, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("base movement between successful check updates stops the remaining update", async () => {
  const f = fixture();
  const original = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, init) => {
    const response = await original(url, init);
    if (init.method === "PATCH") f.state.baseSha = "f".repeat(40);
    return response;
  };
  await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"), /Review publication stopped/);
  assert.deepEqual([...f.checks.values()].map(check => check.status), ["completed", "in_progress"]);
});


test("a newer same-App named check invalidates live replay of historical acceptance", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  await publisher.publish("request-1");
  f.checks.set(3000, { ...f.checks.get(1000), id: 3000, external_id: "another-operation", conclusion: "failure" });
  await assert.rejects(publisher.publish("request-1"), /Review publication stopped/);
  assert.equal(f.writes.length, 5);
});

test("pending competing checks block live acceptance even if latest-completed filtering omits them", async () => {
  const f = fixture();
  await createReviewPublisher(f.policy, f.deps).publish("request-1");
  f.checks.set(3000, { ...f.checks.get(1000), id: 3000, external_id: "another-operation", status: "in_progress", conclusion: null });
  const original = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, init) => {
    if (init.method === "GET" && new URL(url).searchParams.get("filter") === "latest") {
      return Response.json({ total_count: 2, check_runs: [f.checks.get(1000), f.checks.get(1001)] });
    }
    return original(url, init);
  };
  await assert.rejects(createReviewPublisher(f.policy, f.deps).publish("request-1"), /Review publication stopped/);
  assert.equal(f.writes.length, 5);
});

test("inspection never creates publication writes and requires an existing live completed record", async () => {
  const f = fixture();
  const publisher = createReviewPublisher(f.policy, f.deps);
  await assert.rejects(publisher.inspect("request-1"), /Review publication stopped/);
  assert.equal(f.writes.length, 0);
  const published = await publisher.publish("request-1");
  assert.deepEqual(await publisher.inspect("request-1"), published);
  assert.equal(f.writes.length, 5);
  f.state.headSha = "f".repeat(40);
  await assert.rejects(publisher.inspect("request-1"), /Review publication stopped/);
});


test("an unresolved human veto rejects publication before any GitHub write", async () => {
  const f=fixture();
  f.reviews.push({id:901,user:{id:99,type:'User'},state:'CHANGES_REQUESTED',commit_id:f.state.headSha});
  await assert.rejects(createReviewPublisher(f.policy,f.deps).publish('request-1'));
  assert.equal(f.writes.length,0);
});

test("human veto arriving during credential refresh stops subsequent writes", async () => {
  const f=fixture();
  f.deps.tokenForRepository=async()=>{
    if(f.writes.length===1 && !f.reviews.length)f.reviews.push({id:901,user:{id:99,type:'User'},state:'CHANGES_REQUESTED'});
    return 'synthetic-installation-token';
  };
  await assert.rejects(createReviewPublisher(f.policy,f.deps).publish('request-1'));
  assert.equal(f.writes.length,1);
  assert.equal([...f.records.values()][0].phase,'uncertain');
});

test("human veto before successful checks or after completion holds current acceptance", async () => {
  for(const during of [true,false]) {
    const f=fixture();const fetch=f.deps.fetchImpl;
    if(during)f.deps.fetchImpl=async(url,init)=>{
      const result=await fetch(url,init);
      if(init.method==='POST' && new URL(url).pathname.endsWith('/reviews'))f.reviews.push({id:901,user:{id:99,type:'User'},state:'CHANGES_REQUESTED'});
      return result;
    };
    const publisher=createReviewPublisher(f.policy,f.deps);
    if(during) {
      await assert.rejects(publisher.publish('request-1'));
      assert.equal(f.writes.length,3);
      assert.equal([...f.checks.values()].some(c=>c.conclusion==='success'),false);
    } else {
      await publisher.publish('request-1');
      f.reviews.push({id:901,user:{id:99,type:'User'},state:'CHANGES_REQUESTED'});
      await assert.rejects(publisher.inspect('request-1'));
      assert.equal((await publisher.reconcile('request-1')).auditOnly,true);
      assert.equal(f.writes.length,5);
    }
  }
});

test("only a later decision by the same reviewer clears a veto", async () => {
  for(const state of ['COMMENTED','PENDING','APPROVED','DISMISSED','UNKNOWN']) {
    const f=fixture();
    f.reviews.push({id:901,user:{id:99,type:'User'},state:'CHANGES_REQUESTED'},
      {id:902,user:{id:99,type:'User'},state});
    const publish=createReviewPublisher(f.policy,f.deps).publish('request-1');
    if(['APPROVED','DISMISSED'].includes(state))assert.equal((await publish).phase,'complete');
    else {await assert.rejects(publish);assert.equal(f.writes.length,0);}
  }
  for(const history of [[{state:'COMMENTED',user:{}}],Array.from({length:100},(_,id)=>({id,user:{id:99},state:'COMMENTED'}))]) {
    const f=fixture();f.reviews.push(...history);
    await assert.rejects(createReviewPublisher(f.policy,f.deps).publish('request-1'));
    assert.equal(f.writes.length,0);
  }
});
