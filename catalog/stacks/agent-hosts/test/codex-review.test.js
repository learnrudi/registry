import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { observeCodexReview } from "../src/codex-review.js";

const request = () => ({
  contentClass: "private_repository", packet: "Private review contract and source fixture",
  packetDigest: createHash("sha256").update("Private review contract and source fixture").digest("hex"), cwd: "/review/empty", timeoutMs: 1000,
});
const passing = JSON.stringify({ verdicts: { standards: "pass", spec: "pass", proof: "pass", overall: "pass" }, findings: [] });
class NativeFixture {
  calls = []; listeners = new Set(); stops = 0;
  overrides = {};
  onNotification(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(method, params) { for (const fn of this.listeners) fn({ method, params }); }
  notify(method, params) { this.calls.push({ method, params }); }
  async request(method, params) {
    this.calls.push({ method, params });
    if (Object.hasOwn(this.overrides, method)) return this.overrides[method](params);
    if (method === "initialize") return { userAgent: "codex/0.151.0" };
    if (method === "account/read") return { account: { type: "chatgpt" }, requiresOpenaiAuth: true };
    if (method === "thread/start") return {
      model: "gpt-6-astra", reasoningEffort: "xhigh", modelProvider: "openai",
      cwd: params.cwd, approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false },
      instructionSources: [],
      thread: { id: "thread-1", cliVersion: "0.151.0", modelProvider: "openai", ephemeral: true, turns: [], parentThreadId: null, forkedFromId: null },
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

for (const [name, change] of [
  ["wrong selected model", value => { value.model = "gpt-6-sol"; }],
  ["missing effort", value => { delete value.reasoningEffort; }],
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
