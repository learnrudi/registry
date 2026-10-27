import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as childProcess from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { runStackVerifications } from "./stack-verification.js";
import { observeLinuxSandboxLifetime } from "./verification-lifetime.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

it.runIf(process.platform === "linux")("waits for sandbox termination after the launcher closes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "registry-lifetime-"));
  const cwd = path.join(root, "catalog/stacks/lifetime");
  await fs.mkdir(cwd, { recursive: true });
  await fs.writeFile(path.join(cwd, "manifest.json"), JSON.stringify({
    id: "stack:lifetime", kind: "stack", runtime: "python",
  }));
  await fs.writeFile(path.join(cwd, "verify.py"), "raise SystemExit(0)\n");
  const ready = path.join(root, "ready");
  const release = path.join(root, "release");
  // A real, separately grouped process holds the lifetime open deterministically.
  // Only the Bubblewrap launcher is substituted; OS process observation is real.
  const inner = `const fs=require('node:fs'); console.log('ready'); setInterval(()=>{
    if(fs.existsSync(${JSON.stringify(release)})) process.exit(0);
  }, 5);`;
  const outer = `const fs=require('node:fs');
    const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(inner)}],
      {detached:true,stdio:['ignore','pipe','ignore']});
    child.stdout.once('data',()=>{
      fs.writeSync(3,JSON.stringify({'child-pid':child.pid})); fs.closeSync(3);
      fs.writeFileSync(${JSON.stringify(ready)},String(child.pid));
    }); setInterval(()=>{},1000);`;
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  let launcherClosed!: () => void;
  const closed = new Promise<void>(resolve => { launcherClosed = resolve; });
  vi.mocked(childProcess.spawn).mockImplementationOnce(() => {
    const child = actual.spawn(process.execPath, ["-e", outer], {
      detached: true, stdio: ["ignore", "ignore", "inherit", "pipe"],
    });
    child.once("close", launcherClosed);
    return child;
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const verification = runStackVerifications(root, ["stack:lifetime"], { timeoutMs: 1_000 });
  let settled = false;
  void verification.then(() => { settled = true; });
  let pid: number | undefined;
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try { pid = Number(await fs.readFile(ready, "utf8")); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await delay(10);
    }
    expect(pid, "the controlled sandbox process must start").toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await closed;
    await delay(50);
    expect(settled, "launcher exit must not complete verification while the sandbox is live").toBe(false);
    await fs.writeFile(release, "exit");
    await expect(verification).resolves.toMatchObject([
      { status: "failed", error: "verification timed out after 1000ms" },
    ]);
  } finally {
    if (pid !== undefined) {
      try { process.kill(pid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    await verification;
    vi.mocked(childProcess.spawn).mockRestore();
    await fs.rm(root, { recursive: true, force: true });
  }
}, 10_000);

function observer() {
  const pipe = new PassThrough();
  const child = { pid: 42, stdio: [null, null, null, pipe] } as unknown as childProcess.ChildProcess;
  return { pipe, wait: observeLinuxSandboxLifetime(child) };
}

it.each([
  "", "{", "null", "[]", "{}", '{"child-pid":1}', '{"child-pid":-2}',
  '{"child-pid":"123"}', '{"child-pid":1.5}', '{"child-pid":9007199254740992}',
  '{"child-pid":42}', JSON.stringify({ "child-pid": process.pid }), " ".repeat(4_097),
])("rejects invalid or oversized launcher metadata (%#)", async (metadata) => {
  const { pipe, wait } = observer();
  pipe.end(metadata);
  await expect(wait()).rejects.toThrow(/sandbox cleanup failed/);
});

it.each([false, true])("rejects an interrupted metadata pipe (error=%s)", async (withError) => {
  const { pipe, wait } = observer();
  pipe.write('{"child-pid":');
  pipe.destroy(withError ? new Error("pipe failed") : undefined);
  await expect(wait()).rejects.toThrow(/sandbox cleanup failed/);
});

it.runIf(process.platform === "linux")("retains denied process observation as a cleanup failure", async () => {
  const { pipe, wait } = observer();
  const open = vi.spyOn(fs, "open").mockRejectedValueOnce(
    Object.assign(new Error("observation denied"), { code: "EACCES" }),
  );
  try {
    pipe.end('{"child-pid":12345}');
    await expect(wait()).rejects.toThrow(/cleanup failed: observation denied/);
  } finally { open.mockRestore(); }
});

it.runIf(process.platform === "linux")("fails within a bound when the reported sandbox stays live", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const child = actual.spawn(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const closed = new Promise(resolve => child.once("close", resolve));
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout!.once("data", () => resolve());
      child.once("error", reject);
    });
    const { pipe, wait } = observer();
    pipe.end(JSON.stringify({ "child-pid": child.pid }));
    await expect(wait()).rejects.toThrow(/still live after 5000ms/);
  } finally {
    child.kill("SIGKILL");
    await closed;
  }
}, 8_000);

it.runIf(process.platform === "linux")("does not mistake a hidden live process for an absent sandbox", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const child = actual.spawn(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const closed = new Promise(resolve => child.once("close", resolve));
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout!.once("data", () => resolve());
      child.once("error", reject);
    });
    const { pipe, wait } = observer();
    // Linux hidepid=2 deliberately reports ENOENT for denied process visibility.
    const open = vi.spyOn(fs, "open").mockRejectedValueOnce(
      Object.assign(new Error("hidden process"), { code: "ENOENT" }),
    );
    try {
      pipe.end(JSON.stringify({ "child-pid": child.pid }));
      await expect(wait()).rejects.toThrow(/could not confirm.*absent/);
    } finally { open.mockRestore(); }
  } finally {
    child.kill("SIGKILL");
    await closed;
  }
});

it.runIf(process.platform === "linux").each(["EPERM", "EACCES", "EINVAL"])(
  "keeps an inconclusive existence probe (%s) as a cleanup failure", async (code) => {
    const { pipe, wait } = observer();
    const open = vi.spyOn(fs, "open").mockRejectedValueOnce(
      Object.assign(new Error("hidden process"), { code: "ENOENT" }),
    );
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error(code), { code });
    });
    try {
      pipe.end('{"child-pid":12345}');
      await expect(wait()).rejects.toThrow(new RegExp(`could not confirm.*absent.*${code}`));
      expect(kill).toHaveBeenCalledExactlyOnceWith(12345, 0);
    } finally { open.mockRestore(); kill.mockRestore(); }
  },
);

it.runIf(process.platform === "linux")("accepts an independently absent sandbox process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const child = actual.spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => {
    child.once("close", () => resolve()); child.once("error", reject);
  });
  const { pipe, wait } = observer();
  pipe.end(JSON.stringify({ "child-pid": child.pid }));
  await expect(wait()).resolves.toBeUndefined();
});

it.runIf(process.platform === "linux")("rejects unavailable host procfs", async () => {
  const { pipe, wait } = observer();
  const read = vi.spyOn(fs, "readFile").mockRejectedValueOnce(
    Object.assign(new Error("procfs unavailable"), { code: "ENOENT" }),
  );
  try {
    pipe.end('{"child-pid":12345}');
    await expect(wait()).rejects.toThrow(/cleanup failed: procfs unavailable/);
  } finally { read.mockRestore(); }
});
