import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { PassThrough } from "node:stream";
import { createCodexReviewRpc } from "./codex-review-rpc.js";
import { createMinimalAgentHostEnvironment } from "./process-executor.js";

// Internal host primitive: configuration belongs to trusted bootstrap, never a model.
export function createCodexReviewProcess(configuration, { signal } = {}) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error("Native review process configuration rejected");
  if (signal?.aborted) throw new Error("Native review process cancelled");
  const config = validateConfiguration(configuration);
  let child;
  try {
    child = spawn(config.command, config.arguments, {
      cwd: config.workingDirectory, detached: true, shell: false,
      env: config.environment, stdio: ["pipe", "pipe", "pipe"],
    });
  } catch { throw new Error("Native review process rejected"); }
  const readable = new PassThrough();
  let closed = false;
  let spawnFailed = false;
  const groupGone = () => child.pid === undefined ? spawnFailed : groupPresent(child.pid) === false;
  child.on("close", () => { closed = true; });
  let stopping;
  let timer;
  let failed = false;
  const terminate = () => stopping ??= (async () => {
    let certain = true;
    const send = name => {
      try { if (child.pid !== undefined) process.kill(-child.pid, name); }
      catch (error) { if (error.code !== "ESRCH") certain = false; }
    };
    const deadline = performance.now() + 1200;
    const graceDeadline = performance.now() + 150;
    send("SIGTERM");
    while ((!closed || !groupGone()) && performance.now() < graceDeadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!groupGone()) send("SIGKILL");
    while ((!closed || !groupGone()) && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    clearTimeout(timer);
    signal?.removeEventListener("abort", fail);
    const terminationConfirmed = certain && closed && groupGone();
    if (!terminationConfirmed) {
      // Release our handles, never reinterpret this as proof that the child died.
      fail();
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.unref();
    }
    return { terminationConfirmed };
  })();
  const fail = () => {
    if (!failed) {
      failed = true;
      readable.destroy(new Error("Native review process rejected"));
    }
    void terminate();
  };
  child.on("exit", () => { void terminate(); });
  const rpc = createCodexReviewRpc({ readable, writable: child.stdin, terminate });
  let stdoutBytes = 0;
  let stderrBytes = 0;
  child.stdout.on("data", chunk => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > config.maxStdoutBytes) fail();
    else if (!failed) readable.write(chunk);
  });
  child.stdout.on("end", () => { readable.end(); void terminate(); });
  child.stdout.on("error", fail);
  child.stdin.on("error", fail);
  child.stderr.on("data", chunk => { stderrBytes += chunk.length; if (stderrBytes > 262144) fail(); });
  child.stderr.on("error", fail);
  child.on("error", () => {
    spawnFailed = child.pid === undefined;
    fail();
  });
  timer = setTimeout(fail, config.timeoutMs);
  signal?.addEventListener("abort", fail, {once:true});
  if (signal?.aborted) fail();
  return rpc;
}

function validateConfiguration(input) {
  try { return validateSnapshot(input); }
  catch { throw new Error("Native review process configuration rejected"); }
}

function validateSnapshot(input) {
  const rejected = () => new Error("Native review process configuration rejected");
  const value = dataRecord(input);
  value.arguments = dataArguments(value.arguments);
  value.environment = dataRecord(value.environment);
  const keys = ["command", "arguments", "environment", "workingDirectory", "timeoutMs", "maxStdoutBytes"];
  const path = x => typeof x === "string" && x.length <= 4096 && !x.includes("\0") && isAbsolute(x);
  if (process.platform === "win32" || !value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || !path(value.command) || !path(value.workingDirectory)
    || !Array.isArray(value.arguments) || value.arguments.length > 100
    || value.arguments.some(x => typeof x !== "string" || x.length > 4096 || x.includes("\0"))
    || value.arguments.join("").length > 65536
    || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 100 || value.timeoutMs > 900000
    || !Number.isSafeInteger(value.maxStdoutBytes) || value.maxStdoutBytes < 1024 || value.maxStdoutBytes > 8388608
    || !value.environment || typeof value.environment !== "object" || Array.isArray(value.environment)
    || Object.keys(value.environment).length > 100
    || Object.entries(value.environment).some(([key, val]) => !/^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(key)
      || typeof val !== "string" || val.length > 4096 || val.includes("\0"))) throw rejected();
  return { ...value, arguments: [...value.arguments], environment: createMinimalAgentHostEnvironment(value.environment) };
}

// Capture data descriptors before validation; never execute bootstrap accessors or
// re-read values from the caller after validating a different value.
function dataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new Error();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 100 || keys.some(key => typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"))) throw new Error();
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

function dataArguments(value) {
  if (!Array.isArray(value)) throw new Error();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length.value;
  if (length > 100 || Reflect.ownKeys(descriptors).length !== length + 1) throw new Error();
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error();
    return descriptor.value;
  });
}

function groupPresent(pid) {
  try { process.kill(-pid, 0); return true; }
  catch (error) { return error.code === "ESRCH" ? false : undefined; }
}
