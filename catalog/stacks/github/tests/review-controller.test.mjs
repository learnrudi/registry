import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createReviewController } from "../dist/review-controller.js";
import { verifyReviewEvidence } from "../dist/review-evidence.js";

const digest = text => createHash("sha256").update(text).digest("hex");
const serialize = value => JSON.stringify(value);
const passing = { verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" }, findings: [] };
function fixture() {
  const policy = { schemaVersion: 1, enabled: true, repositoryIds: [7], model: "gpt-6-astra", effort: "xhigh", reviewerHostId: "worker-1", proofHostId: "proof-1", requiredChecks: [{ id: "test", commandDigest: digest("approved test command") }] };
  const contractText = "Approved task contract"; const sourceText = "Exact private source fixture";
  const proof = { schemaVersion: 1, repositoryId: 7, baseSha: "a".repeat(40), headSha: "b".repeat(40), contractDigest: digest(contractText), sourceDigest: digest(sourceText), policyDigest: digest(serialize(policy)), executorHostId: "proof-1", terminationConfirmed: true, checks: [{ ...policy.requiredChecks[0], exitCode: 0, outputDigest: digest("test proof") }] };
  const binding = { repositoryId: 7, pullNumber: 2, baseSha: proof.baseSha, headSha: proof.headSha, contractDigest: proof.contractDigest, proofDigest: digest(serialize(proof)), policyDigest: proof.policyDigest, model: policy.model, effort: policy.effort, reviewerHostId: policy.reviewerHostId, authorHostId: "author-1" };
  const candidate = { schemaVersion: 1, binding, sourceDigest: proof.sourceDigest, contractText, sourceText };
  let intent; let audit; let calls = 0;
  const authority = {
    loadCandidate: async () => serialize(candidate), loadProof: async () => serialize(proof), loadPolicy: async () => serialize(policy),
    loadIntent: async () => intent, loadAudit: async () => audit,
    writeIntent: async (_id, value) => { assert.equal(intent, undefined); intent = structuredClone(value); },
    writeAudit: async (_id, value) => { assert.equal(audit, undefined); audit = structuredClone(value); },
    withLock: async (_id, operation) => operation(),
  };
  const nativeHost = {
    async review(request) {
      calls++;
      assert.equal(request.contentClass, "private_repository");
      assert.equal(digest(request.packet), request.packetDigest);
      assert.ok(request.packet.includes(sourceText));
      return { schemaVersion: 1, status: "observed", runtime: "0.160.1", threadId: "thread-1", turnId: "turn-1", requested: { model: policy.model, effort: policy.effort }, observed: { model: policy.model, effort: policy.effort, provider: "openai", accountType: "chatgpt" }, effectiveExecution: null, acceptanceEligible: false, assurance: "native-session-configuration-only", access: "read-only", freshContext: true, packetDigest: request.packetDigest, outputText: serialize(passing), terminationConfirmed: true };
    },
  };
  const controller = createReviewController({ authority, nativeHost, enabled: async () => true, now: () => 1700000000000, timeoutMs: 1000 });
  return { controller, authority, nativeHost, policy, proof, candidate, calls: () => calls };
}

test("controller binds private source, independent proof and native observation without granting publication", async () => {
  const f = fixture();
  const result = await f.controller.audit("request-1");
  assert.equal(result.status, "held");
  assert.equal(result.acceptanceEligible, false);
  assert.equal(result.publication, null);
  assert.equal(result.binding.proofDigest, f.candidate.binding.proofDigest);
  assert.deepEqual(result.blockers, ["effective_execution_attestation_unavailable"]);
  assert.equal(result.native.threadId, "thread-1");
  assert.equal(result.native.effectiveExecution, null);
  assert.equal(JSON.stringify(result).includes(f.candidate.sourceText), false);
  assert.equal(f.calls(), 1);
  assert.deepEqual(await f.controller.audit("request-1"), result);
  assert.equal(f.calls(), 1);
  const { publicKey } = generateKeyPairSync("ed25519");
  assert.throws(() => verifyReviewEvidence(result, publicKey, result.binding, 1700000000000), /rejected/);
});

for (const [name, mutate] of [
  ["source bytes", f => { f.candidate.sourceText += " injected"; }],
  ["author reuse", f => { f.candidate.binding.authorHostId = "worker-1"; }],
  ["wrong requested model", f => { f.candidate.binding.model = "gpt-6-sol"; }],
  ["changed policy", f => { f.policy.enabled = false; }],
  ["missing check", f => { f.proof.checks = []; f.candidate.binding.proofDigest = digest(serialize(f.proof)); }],
  ["failed proof", f => { f.proof.checks[0].exitCode = 1; f.candidate.binding.proofDigest = digest(serialize(f.proof)); }],
  ["forged command", f => { f.proof.checks[0].commandDigest = digest("attacker command"); f.candidate.binding.proofDigest = digest(serialize(f.proof)); }],
  ["different revision", f => { f.proof.headSha = "c".repeat(40); f.candidate.binding.proofDigest = digest(serialize(f.proof)); }],
  ["different proof authority", f => { f.proof.executorHostId = "author-1"; f.candidate.binding.proofDigest = digest(serialize(f.proof)); }],
]) test(`controller rejects ${name} without native dispatch`, async () => {
  const f = fixture(); mutate(f);
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
  assert.equal(f.calls(), 0);
});

test("controller does not retry a durable intent after an uncertain native response", async () => {
  const f = fixture(); let calls = 0;
  f.nativeHost.review = async () => { calls++; throw new Error("PRIVATE DATA must not escape"); };
  await assert.rejects(f.controller.audit("request-1"), error => /rejected/.test(error.message) && !/PRIVATE/.test(error.message));
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
  assert.equal(calls, 1);
});

test("controller rejects model-authored execution claims even with passing verdicts", async () => {
  const f = fixture(); const original = f.nativeHost.review;
  f.nativeHost.review = async (...args) => {
    const result = await original(...args);
    result.outputText = serialize({ ...passing, effectiveExecution: { model: "gpt-6-astra", effort: "xhigh" } });
    return result;
  };
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
  assert.equal(await f.authority.loadAudit("request-1"), undefined);
});

test("controller retains revise verdicts as held and never converts them into acceptance", async () => {
  const f = fixture(); const original = f.nativeHost.review;
  f.nativeHost.review = async (...args) => {
    const result = await original(...args);
    result.outputText = serialize({ verdicts: { ...passing.verdicts, spec: "revise", overall: "revise" }, findings: [{ priority: 1, disposition: "Fix required" }] });
    return result;
  };
  const result = await f.controller.audit("request-1");
  assert.deepEqual(result.blockers, ["effective_execution_attestation_unavailable", "review_not_passing"]);
});

test("controller rejects policy revocation during review and keeps its intent", async () => {
  const f = fixture(); const original = f.nativeHost.review;
  f.nativeHost.review = async (...args) => { const value = await original(...args); f.policy.enabled = false; return value; };
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
  assert.notEqual(await f.authority.loadIntent("request-1"), undefined);
  assert.equal(await f.authority.loadAudit("request-1"), undefined);
});

test("controller deadline aborts a stalled native host without later audit writes", async () => {
  const f = fixture(); let release; let signal;
  f.nativeHost.review = async (_request, options) => { signal = options.signal; return new Promise(resolve => { release = resolve; }); };
  const controller = createReviewController({ authority: f.authority, nativeHost: f.nativeHost, enabled: async () => true, timeoutMs: 100 });
  await assert.rejects(controller.audit("request-1"), /rejected/);
  assert.equal(signal.aborted, true);
  release({ malicious: "late" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await f.authority.loadAudit("request-1"), undefined);
});

test("controller composes with the native wire adapter and cannot publish its observation", async () => {
  const { PassThrough } = await import("node:stream");
  const { observeCodexReview } = await import("../../agent-hosts/src/codex-review.js");
  const { createCodexReviewRpc } = await import("../../agent-hosts/src/codex-review-rpc.js");
  const f = fixture();
  const incoming = new PassThrough(); const outgoing = new PassThrough();
  let dispatched = 0; let stopped = 0;
  outgoing.on("data", bytes => {
    const message = JSON.parse(bytes.toString());
    if (!Object.hasOwn(message, "id")) return;
    let result;
    if (message.method === "initialize") result = { userAgent: "codex/0.160.1" };
    if (message.method === "account/read") result = { account: { type: "chatgpt" }, requiresOpenaiAuth: true };
    if (message.method === "thread/start") result = {
      model: "gpt-6-astra", reasoningEffort: "xhigh", modelProvider: "openai", cwd: message.params.cwd,
      approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false }, instructionSources: [],
      thread: { id: "native-thread", cliVersion: "0.160.1", modelProvider: "openai", ephemeral: true, turns: [], parentThreadId: null, forkedFromId: null },
    };
    if (message.method === "turn/start") { dispatched++; result = { turn: { id: "native-turn", status: "inProgress", items: [] } }; }
    assert.notEqual(result, undefined);
    incoming.write(serialize({ id: message.id, result }) + "\n");
    if (message.method === "turn/start") {
      const params = { threadId: "native-thread", turnId: "native-turn" };
      incoming.write(serialize({ method: "item/completed", params: { ...params, item: { id: "final", type: "agentMessage", phase: "final_answer", text: serialize(passing) } } }) + "\n");
      incoming.write(serialize({ method: "turn/completed", params: { threadId: "native-thread", turn: { id: "native-turn", status: "completed", items: [], error: null } } }) + "\n");
    }
  });
  f.nativeHost.review = (request, options) => observeCodexReview(createCodexReviewRpc({ readable: incoming, writable: outgoing,
    terminate: async () => { stopped++; return { terminationConfirmed: true }; },
  }), { ...request, cwd: "/review/empty" }, options);
  const result = await f.controller.audit("wire-1");
  assert.equal(result.native.threadId, "native-thread");
  assert.equal(dispatched, 1); assert.equal(stopped, 1);
  assert.equal(result.publication, null);
});

test("controller revalidates every stored audit against its current candidate and intent", async () => {
  const f = fixture(); const valid = await f.controller.audit("request-1");
  f.authority.loadAudit = async () => ({ ...valid, binding: { ...valid.binding, headSha: "c".repeat(40) },
    native: { ...valid.native, terminationConfirmed: false }, blockers: [] });
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
});

test("owner cancellation aborts an in-flight controller review and prevents a late receipt", async () => {
  const f = fixture(); const owner = new AbortController();
  let started; const entered = new Promise(resolve => { started = resolve; });
  let hostSignal; let release;
  f.nativeHost.review = (_request, options) => {
    hostSignal = options.signal; started(); return new Promise(resolve => { release = resolve; });
  };
  const pending = f.controller.audit("request-1", { signal: owner.signal });
  void pending.catch(() => {});
  await entered;
  try {
    owner.abort();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hostSignal.aborted, true);
    await assert.rejects(pending, /rejected/);
  } finally { release({ late: "untrusted" }); }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await f.authority.loadAudit("request-1"), undefined);
  assert.notEqual(await f.authority.loadIntent("request-1"), undefined);
});

test("owner cancellation before dispatch performs no authority reads or native work", async () => {
  const f = fixture(); let reads = 0;
  f.authority.loadCandidate = async () => { reads++; return serialize(f.candidate); };
  await assert.rejects(f.controller.audit("request-1", { signal: AbortSignal.abort() }), /rejected/);
  assert.equal(reads, 0); assert.equal(f.calls(), 0);
});

test("controller rejects array-valued model verdicts", async () => {
  const f = fixture(); const original = f.nativeHost.review;
  f.nativeHost.review = async (...args) => { const n = await original(...args);
    n.outputText = serialize({ ...passing, verdicts: { ...passing.verdicts, standards: ["pass"] } }); return n;
  };
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
});

for (const [name, mutate] of [
  ["native termination", r => { r.native.terminationConfirmed = false; }],
  ["blocker removal", r => { r.blockers = []; }],
  ["extra fields", r => { r.authorized = true; }],
  ["packet mismatch", r => { r.packetDigest = "c".repeat(64); }],
  ["output digest", r => { r.outputDigest = "c".repeat(64); }],
  ["verdict mismatch", r => { r.verdicts.spec = "blocked"; }],
  ["missing native field", r => { delete r.native.freshContext; }],
]) test(`controller rejects stored audit corruption: ${name}`, async () => {
  const f = fixture(); const result = await f.controller.audit("request-1"); mutate(result);
  f.authority.loadAudit = async () => result;
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
  assert.equal(f.calls(), 1);
});

test("controller rejects a completed audit without its original immutable intent", async () => {
  const f = fixture(); await f.controller.audit("request-1");
  f.authority.loadIntent = async () => undefined;
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
});

test("owner cancellation during an authority read discards the late candidate", async () => {
  const f = fixture(); const owner = new AbortController(); let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  f.authority.loadCandidate = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const pending = f.controller.audit("request-1", { signal: owner.signal });
  void pending.catch(() => {});
  await started; owner.abort();
  await assert.rejects(pending, /rejected/);
  release(serialize(f.candidate)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls(), 0); assert.equal(await f.authority.loadIntent("request-1"), undefined);
});

for (const malformed of [null, 1, { value: "pass" }]) test(`controller rejects non-string verdict ${serialize(malformed)}`, async () => {
  const f = fixture(); const original = f.nativeHost.review;
  f.nativeHost.review = async (...args) => { const result = await original(...args);
    result.outputText = serialize({ ...passing, verdicts: { ...passing.verdicts, standards: malformed } }); return result;
  };
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
});

test("controller rejects merged JSON key names that omit verdict axes", async () => {
  const f = fixture(); const original = f.nativeHost.review;
  f.nativeHost.review = async (...args) => { const result = await original(...args);
    result.outputText = serialize({ verdicts: { "overall,proof": "pass", spec: "pass", standards: "pass" }, findings: [] }); return result;
  };
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
});

test("controller rejects merged verdict keys in a stored receipt even with recomputed digest", async () => {
  const f = fixture(); const result = await f.controller.audit("request-1");
  result.verdicts = { "overall,proof": "pass", spec: "pass", standards: "pass" };
  result.outputText = serialize({ verdicts: result.verdicts, findings: result.findings });
  result.outputDigest = digest(result.outputText);
  f.authority.loadAudit = async () => result;
  await assert.rejects(f.controller.audit("request-1"), /rejected/);
  assert.equal(f.calls(), 1);
});
