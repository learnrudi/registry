import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { observeCodexReview } from "../src/codex-review.js";

const request = () => ({
  contentClass: "private_repository", packet: "Private review contract and source fixture",
  packetDigest: createHash("sha256").update("Private review contract and source fixture").digest("hex"), cwd: "/review/empty", timeoutMs: 1000,
});
const passing = JSON.stringify({ verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" }, findings: [] });
const routedAccount = () => ({
  account: { type: "chatgpt", email: "fixture@example.invalid", planType: "pro" }, requiresOpenaiAuth: true,
  workspaceRouting: { chatgptAccountId: "fixture-workspace", backendOrigin: "https://chatgpt.com", accountRoutingOverride: "NO_CONSTRAINT" },
});
class NativeFixture {
  calls = []; listeners = new Set(); stops = 0;
  overrides = {};
  onNotification(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(method, params) { for (const fn of this.listeners) fn({ method, params }); }
  notify(method, params) { this.calls.push({ method, params }); }
  async request(method, params) {
    this.calls.push({ method, params });
    if (Object.hasOwn(this.overrides, method)) return this.overrides[method](params);
    if (method === "initialize") return { userAgent: "codex/0.160.1" };
    if (method === "account/read") return { account: { type: "chatgpt" }, requiresOpenaiAuth: true };
    if (method === "thread/start") return {
      model: "gpt-6-astra", reasoningEffort: "xhigh", modelProvider: "openai",
      cwd: params.cwd, approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false },
      instructionSources: [],
      thread: { id: "thread-1", cliVersion: "0.160.1", modelProvider: "openai", ephemeral: true, turns: [], parentThreadId: null, forkedFromId: null },
    };
    if (method === "turn/start") {
      queueMicrotask(() => {
        this.emit("item/completed", { threadId: "thread-1", turnId: "turn-1", item: { type: "agentMessage", id: "answer-1", phase: "final_answer", text: passing } });
        this.emit("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null, items: [] } });
      });
      return { turn: { id: "turn-1", status: "inProgress", items: [] } };
    }
    throw new Error("Unexpected fixture method");
  }
  async stop() { this.stops++; return { terminationConfirmed: true }; }
}

test("native review records selected Astra/xhigh without inventing effective execution attestation", async () => {
  const rpc = new NativeFixture();
  const result = await observeCodexReview(rpc, request());
  assert.equal(result.status, "observed");
  assert.equal(result.requested.model, "gpt-6-astra");
  assert.equal(result.observed.effort, "xhigh");
  assert.equal(result.effectiveExecution, null);
  assert.equal(result.acceptanceEligible, false);
  assert.equal(result.outputText, passing);
  assert.equal(rpc.stops, 1);
  const start = rpc.calls.find(call => call.method === "thread/start").params;
  assert.equal(start.allowProviderModelFallback, false);
  assert.equal(start.ephemeral, true);
  assert.equal(start.approvalPolicy, "never");
  assert.equal(start.sandbox, "read-only");
  assert.equal(start.model, "gpt-6-astra");
  const turn = rpc.calls.find(call => call.method === "turn/start").params;
  assert.equal(turn.effort, "xhigh");
  assert.equal(turn.model, "gpt-6-astra");
  assert.equal(turn.input[0].text, request().packet);
  assert.equal(rpc.calls.some(call => /resume|fork|review\/start/.test(call.method)), false);
});

test("native review rejects cancellation before touching the host", async () => {
  const rpc = new NativeFixture();
  const signal = AbortSignal.abort();
  await assert.rejects(observeCodexReview(rpc, request(), { signal }), /rejected/);
  assert.equal(rpc.calls.length, 0);
});

test("native review admits one stable startup account routing snapshot before private source", async () => {
  const rpc = new NativeFixture();
  let reads = 0;
  rpc.overrides["account/read"] = () => {
    if (++reads === 1) rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
    return routedAccount();
  };
  const result = await observeCodexReview(rpc, request());
  assert.equal(result.outputText, passing);
  assert.deepEqual(rpc.calls.slice(0, 5).map(call => call.method), ["initialize", "initialized", "account/read", "account/read", "thread/start"]);
  assert.equal(rpc.calls.filter(call => call.method === "turn/start").length, 1);
  assert.equal(JSON.stringify(result).includes("fixture-workspace"), false);
  assert.equal(JSON.stringify(result).includes("fixture@example.invalid"), false);
  assert.equal(rpc.stops, 1);
});

test("native review waits for delayed startup routing before account confirmation", async () => {
  const rpc = new NativeFixture();
  let deliver;
  let reads = 0;
  rpc.overrides["account/read"] = () => {
    if (++reads === 1) deliver = () => rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
    return routedAccount();
  };
  const review = observeCodexReview(rpc, request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
  assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
  deliver();
  assert.equal((await review).outputText, passing);
  assert.equal(reads, 2);
});

for (const planType of ["ent26", "invalid_plan"]) test(`native review validates pinned startup plan type ${planType}`, async () => {
  const rpc = new NativeFixture();
  let reads = 0;
  rpc.overrides["account/read"] = () => {
    const value = routedAccount(); value.account.planType = planType;
    if (++reads === 1) rpc.emit("account/updated", { authMode: "chatgpt", planType });
    return value;
  };
  if (planType === "ent26") assert.equal((await observeCodexReview(rpc, request())).outputText, passing);
  else {
    await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
    assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
  }
});

for (const [name, change] of [
  ["duplicate notification", (rpc) => rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" })],
  ["plan mismatch", (_rpc, value) => { value.account.planType = "business"; }],
  ["notification without routing", (_rpc, value) => { value.workspaceRouting = null; }],
  ["malformed routing", (_rpc, value) => { delete value.workspaceRouting.chatgptAccountId; }],
  ["non-origin routing", (_rpc, value) => { value.workspaceRouting.backendOrigin = "https://chatgpt.com/private"; }],
]) test(`native review rejects startup ${name} before private source`, async () => {
  const rpc = new NativeFixture();
  rpc.overrides["account/read"] = () => {
    const value = routedAccount();
    rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
    change(rpc, value);
    return value;
  };
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
  assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
  assert.equal(rpc.stops, 1);
});

for (const params of [{}, { authMode: "apiKey", planType: "pro" }, { authMode: null, planType: null },
  { authMode: "chatgpt", planType: null }, { authMode: "chatgpt", planType: "pro", extra: true }]) {
  test(`native review rejects malformed startup account notice ${JSON.stringify(params)}`, async () => {
    const rpc = new NativeFixture();
    rpc.overrides["account/read"] = () => { rpc.emit("account/updated", params); return routedAccount(); };
    await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
    assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
  });
}

for (const [name, change] of [
  ["identity", value => { value.account.email = "changed@example.invalid"; }],
  ["workspace", value => { value.workspaceRouting.chatgptAccountId = "changed-workspace"; }],
  ["backend", value => { value.workspaceRouting.backendOrigin = "https://changed.example.invalid"; }],
  ["authentication", value => { value.requiresOpenaiAuth = false; }],
]) test(`native review rejects a changed ${name} during account confirmation`, async () => {
  const rpc = new NativeFixture();
  const shared = routedAccount();
  let reads = 0;
  rpc.overrides["account/read"] = () => {
    if (++reads === 1) rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
    else change(shared);
    return shared;
  };
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
  assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
});

for (const stage of ["confirmation", "thread/start", "turn/start", "drain"]) {
  test(`native review rejects a valid account update during ${stage}`, async () => {
    const rpc = new NativeFixture();
    let reads = 0;
    const original = rpc.request.bind(rpc);
    rpc.request = async (method, params) => {
      if (method === "account/read") {
        if (++reads === 1 || stage === "confirmation") rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
        rpc.calls.push({ method, params });
        return routedAccount();
      }
      if (method === stage) rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
      return original(method, params);
    };
    if (stage === "drain") rpc.stop = async () => {
      rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
      return { terminationConfirmed: true };
    };
    await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
    if (["confirmation", "thread/start"].includes(stage)) assert.equal(rpc.calls.some(call => call.method === "turn/start"), false);
  });
}

for (const cancel of [false, true]) test(`native review bounds missing startup routing notification with ${cancel ? "cancellation" : "deadline"}`, async () => {
  const rpc = new NativeFixture();
  const abort = new AbortController();
  rpc.overrides["account/read"] = () => routedAccount();
  const review = observeCodexReview(rpc, { ...request(), timeoutMs: 100 }, { signal: abort.signal });
  if (cancel) setImmediate(() => abort.abort());
  await assert.rejects(review, /rejected/);
  rpc.emit("account/updated", { authMode: "chatgpt", planType: "pro" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
  assert.equal(rpc.stops, 1);
});

for (const [name, change] of [
  ["wrong selected model", value => { value.model = "gpt-6-sol"; }],
  ["missing effort", value => { delete value.reasoningEffort; }],
  ["old runtime", value => { value.thread.cliVersion = "0.151.0"; }],
  ["unknown runtime", value => { value.thread.cliVersion = "0.152.0"; }],
  ["reused context", value => { value.thread.forkedFromId = "author-thread"; }],
  ["loaded instructions", value => { value.instructionSources = ["/untrusted/AGENTS.md"]; }],
  ["network permission", value => { value.sandbox.networkAccess = true; }],
]) test(`native review rejects ${name} before sending private source`, async () => {
  const rpc = new NativeFixture();
  const base = await rpc.request("thread/start", { cwd: request().cwd });
  rpc.calls = [];
  change(base);
  rpc.overrides["thread/start"] = () => base;
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
  assert.equal(rpc.calls.some(call => call.method === "turn/start"), false);
  assert.equal(rpc.stops, 1);
});

test("native review rejects API billing and forged packet digest before private inference", async () => {
  const rpc = new NativeFixture();
  rpc.overrides["account/read"] = () => ({ account: { type: "apiKey" }, requiresOpenaiAuth: true });
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
  assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
  rpc.calls = [];
  await assert.rejects(observeCodexReview(rpc, { ...request(), packetDigest: "b".repeat(64) }), /rejected/);
  assert.equal(rpc.calls.length, 0);
});

for (const event of [
  { method: "model/rerouted", params: { toModel: "gpt-6-sol" } },
  { method: "model/verification", params: { verifications: ["trustedAccessForCyber"] } },
  { method: "item/started", params: { threadId: "thread-1", turnId: "turn-1", item: { type: "commandExecution" } } },
  { method: "turn/completed", params: { threadId: "other-thread", turn: { id: "turn-1", status: "completed" } } },
  { method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "failed" } } },
  { id: 42, method: "item/commandExecution/requestApproval", params: {} },
]) test(`native review rejects unsafe event ${event.method}`, async () => {
  const rpc = new NativeFixture();
  rpc.overrides["turn/start"] = () => {
    for (const listener of rpc.listeners) listener(event);
    return { turn: { id: "turn-1", status: "inProgress" } };
  };
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
});

test("native review bounds a stuck dependency and discards its late result", async () => {
  const rpc = new NativeFixture();
  let release;
  rpc.overrides["account/read"] = () => new Promise(resolve => { release = resolve; });
  await assert.rejects(observeCodexReview(rpc, { ...request(), timeoutMs: 100 }), /rejected/);
  release({ account: { type: "chatgpt" }, requiresOpenaiAuth: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rpc.calls.some(call => call.method === "thread/start"), false);
});

test("native review never returns an observation when termination is unconfirmed", async () => {
  const rpc = new NativeFixture();
  rpc.stop = async () => ({ terminationConfirmed: false });
  await assert.rejects(observeCodexReview(rpc, request()), /termination unconfirmed/);
});

test("native review rejects a reroute observed while draining the connection", async () => {
  const rpc = new NativeFixture();
  rpc.stop = async () => {
    rpc.emit("model/rerouted", { threadId: "thread-1", turnId: "turn-1", fromModel: "gpt-6-astra", toModel: "gpt-6-sol" });
    return { terminationConfirmed: true };
  };
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
});

test("native review rejects observed hook execution even when the final answer passes", async () => {
  const rpc = new NativeFixture();
  const original = rpc.request.bind(rpc);
  rpc.request = async (method, params) => {
    if (method === "turn/start") rpc.emit("hook/started", { threadId: "thread-1", turnId: "turn-1", run: { id: "hook-1" } });
    return original(method, params);
  };
  await assert.rejects(observeCodexReview(rpc, request()), /rejected/);
});

for (const method of ["hook/started", "hook/completed", "account/updated", "thread/settings/updated"]) {
  test(`native review rejects ${method} before private source and while draining`, async () => {
    const early = new NativeFixture();
    early.overrides["account/read"] = () => { early.emit(method, {}); return { account: { type: "chatgpt" }, requiresOpenaiAuth: true }; };
    await assert.rejects(observeCodexReview(early, request()), /rejected/);
    assert.equal(early.calls.some(call => call.method === "turn/start"), false);
    const late = new NativeFixture();
    late.stop = async () => { late.emit(method, {}); return { terminationConfirmed: true }; };
    await assert.rejects(observeCodexReview(late, request()), /rejected/);
  });
}
