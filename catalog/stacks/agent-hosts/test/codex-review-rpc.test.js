import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { createCodexReviewRpc } from "../src/codex-review-rpc.js";

test("native RPC correlates wire replies, forwards events and drains through host termination", async () => {
  const readable = new PassThrough(); const writable = new PassThrough();
  let stopped = 0;
  const rpc = createCodexReviewRpc({ readable, writable, terminate: async () => { stopped++; return { terminationConfirmed: true }; } });
  const events = [];
  rpc.onNotification(event => events.push(event));
  const line = new Promise(resolve => writable.once("data", value => resolve(JSON.parse(value))));
  const response = rpc.request("initialize", { clientInfo: { name: "rudi_reviewer" } });
  const message = await line;
  readable.write(JSON.stringify({ id: message.id, result: { userAgent: "codex/0.160.1" } }) + "\n");
  assert.deepEqual(await response, { userAgent: "codex/0.160.1" });
  readable.write('{"method":"turn/started","params":{"threadId":"t"}}\n');
  assert.equal(events.length, 1);
  assert.deepEqual(await rpc.stop(), { terminationConfirmed: true });
  assert.equal(stopped, 1);
  await assert.rejects(rpc.request("thread/start", {}), /rejected/);
});

for (const wire of ["not JSON\n", '{"id":999,"result":{}}\n', '{"id":1,"error":{"message":"SECRET"}}\n', "x".repeat(1048577)]) {
  test(`native RPC sanitizes malformed, unsolicited or oversized output (${wire.length} bytes)`, async () => {
    const readable = new PassThrough(); const writable = new PassThrough();
    const rpc = createCodexReviewRpc({ readable, writable, terminate: async () => ({ terminationConfirmed: true }) });
    const pending = rpc.request("initialize", {});
    readable.write(wire);
    await assert.rejects(pending, error => error.message === "Native review RPC rejected");
    await rpc.stop();
  });
}

test("native RPC rejects unexpected EOF and never grants server tool requests", async () => {
  const readable = new PassThrough(); const writable = new PassThrough();
  const rpc = createCodexReviewRpc({ readable, writable, terminate: async () => ({ terminationConfirmed: true }) });
  const pending = rpc.request("initialize", {});
  readable.end();
  await assert.rejects(pending, /rejected/);
  await rpc.stop();
});

test("native RPC drains a real synthetic child process through the host lifecycle", async () => {
  const { spawn } = await import("node:child_process");
  const { once } = await import("node:events");
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import readline from 'node:readline';
    const lines = readline.createInterface({ input: process.stdin });
    lines.on('line', line => { const request = JSON.parse(line); if (request.id) process.stdout.write(JSON.stringify({id:request.id,result:{userAgent:'synthetic-native-fixture'}})+'\\n'); });
  `], { stdio: ["pipe", "pipe", "ignore"], detached: process.platform !== "win32", env: {} });
  const closed = once(child, "close");
  let timer;
  const rpc = createCodexReviewRpc({ readable: child.stdout, writable: child.stdin, terminate: async () => {
    child.kill("SIGTERM");
    timer = setTimeout(() => child.kill("SIGKILL"), 500);
    await closed; clearTimeout(timer);
    return { terminationConfirmed: child.exitCode !== null || child.signalCode !== null };
  } });
  try {
    assert.deepEqual(await rpc.request("initialize", {}), { userAgent: "synthetic-native-fixture" });
    assert.equal((await rpc.stop()).terminationConfirmed, true);
    assert.throws(() => process.kill(child.pid, 0), error => error.code === "ESRCH");
  } finally { clearTimeout(timer); child.kill("SIGKILL"); await closed; }
});
