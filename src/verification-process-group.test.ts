import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import * as childProcess from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signalVerificationProcessGroup } from "./verification-process-group.js";
import { buildVerificationSandbox } from "./verification-sandbox.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

it.runIf(process.platform === "darwin")(
  "accepts cleanup of a real owned zombie-only process group",
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "registry-zombie-group-"));
    const cwd = path.join(root, "catalog/stacks/zombie");
    const home = path.join(root, "home");
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(home);
    await fs.writeFile(path.join(cwd, "verify.py"), [
      "import os,json,pathlib,time",
      "pid=os.fork()",
      "if pid==0:",
      "  os.setsid()",
      "  pathlib.Path('identity.json').write_text(json.dumps({'pid':os.getpid(),'pgid':os.getpgrp(),'uid':os.getuid()}))",
      "  os._exit(0)",
      "else:",
      "  deadline=time.monotonic()+8",
      "  while not pathlib.Path('reap').exists() and time.monotonic()<deadline: time.sleep(0.01)",
      "  os.waitpid(pid,0)",
    ].join("\n"));
    const sandbox = await buildVerificationSandbox({
      root, cwd, home, executable: "python3", args: ["verify.py"],
      network: false, runtime: "python",
    });
    const holder = spawn(sandbox.executable, sandbox.args, {
      cwd, env: { PATH: sandbox.path, HOME: home },
      shell: false, detached: true, stdio: "ignore",
    });
    const closed = new Promise<void>((resolve, reject) => {
      holder.once("close", () => resolve());
      holder.once("error", reject);
    });
    try {
      let identity: { pid: number; pgid: number; uid: number } | undefined;
      let group = "";
      const readyBy = Date.now() + 3_000;
      while (Date.now() < readyBy) {
        try {
          identity = JSON.parse(await fs.readFile(path.join(cwd, "identity.json"), "utf8"));
          if (identity && Number.isSafeInteger(identity.pid) && identity.pid > 1) {
            group = execFileSync("/bin/ps", [
              "-o", "pid=,pgid=,uid=,stat=", "-g", String(identity.pid),
            ], { encoding: "utf8", timeout: 1_000, maxBuffer: 65_536 });
            if (/\sZ\S*\s*$/.test(group)) break;
          }
        } catch { /* The fixture has not published its identity yet. */ }
        await delay(10);
      }
      expect(identity).toBeDefined();
      expect(identity!.pgid).toBe(identity!.pid);
      expect(identity!.uid).toBe(process.getuid!());
      expect(group).toMatch(/\sZ\S*\s*$/);
      // Establish the actual Darwin failure, rather than mocking an error code.
      expect(() => process.kill(-identity!.pid, "SIGKILL")).toThrow(/EPERM/);
      expect(signalVerificationProcessGroup(identity!.pid, "SIGKILL")).toBeUndefined();
    } finally {
      await fs.writeFile(path.join(cwd, "reap"), "yes");
      await closed;
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  10_000
);


describe("verification group signal boundaries", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const getuid = Object.getOwnPropertyDescriptor(process, "getuid");
  const groupId = 12345;
  let kill: ReturnType<typeof vi.spyOn<typeof process, "kill">>;

  function psResult(stdout: string, status = 0, stderr = "") {
    const result = { pid: 1, output: [], stdout, stderr, status, signal: null };
    return vi.mocked(childProcess.spawnSync).mockImplementation(
      (() => result) as typeof childProcess.spawnSync
    );
  }

  beforeEach(() => {
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    Object.defineProperty(process, "getuid", { configurable: true, value: () => 501 });
    kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("synthetic kill EPERM"), { code: "EPERM" });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(childProcess.spawnSync).mockReset();
    Object.defineProperty(process, "platform", platform);
    if (getuid) Object.defineProperty(process, "getuid", getuid);
    else Reflect.deleteProperty(process, "getuid");
  });

  it("accepts independently observed absence after Darwin EPERM", () => {
    psResult("", 1);
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeUndefined();
  });

  it("accepts only owned terminal members and bounds the shell-free inspection", () => {
    const inspect = psResult("12345 12345 501 Z\n12346 12345 501 Z+\n");
    expect(signalVerificationProcessGroup(groupId, "SIGTERM")).toBeUndefined();
    expect(kill).toHaveBeenCalledExactlyOnceWith(-groupId, "SIGTERM");
    expect(inspect).toHaveBeenCalledExactlyOnceWith("/bin/ps", [
      "-o", "pid=,pgid=,uid=,stat=", "-g", String(groupId),
    ], expect.objectContaining({ shell: false, timeout: 1000, maxBuffer: 65536 }));
  });

  it.each([
    ["live member", "12345 12345 501 S\n"],
    ["mixed live/terminal members", "12345 12345 501 Z\n12346 12345 501 R\n"],
    ["unrelated group", "12345 99999 501 Z\n"],
    ["different owner", "12345 12345 502 Z\n"],
    ["unknown state", "12345 12345 501 Zunknown\n"],
    ["malformed row", "not-a-process-row\n"],
    ["duplicate identity", "12345 12345 501 Z\n12345 12345 501 Z\n"],
    ["unsafe PID", "9007199254740992 12345 501 Z\n"],
    ["missing PID", "0 12345 501 Z\n"],
    ["empty successful output", ""],
  ])("retains cleanup failure for %s", (_label, output) => {
    psResult(output);
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")?.message).toMatch(/cleanup.*EPERM/);
  });

  it.each([
    [1, "12345 12345 501 Z", ""],
    [2, "", ""],
    [1, "", "permission denied"],
  ])("rejects inconclusive inspection status %s", (status, output, stderr) => {
    psResult(output, status, stderr);
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeInstanceOf(Error);
  });

  it("retains failure on inspection timeout or inability to execute", () => {
    vi.mocked(childProcess.spawnSync).mockImplementation(() => {
      throw Object.assign(new Error("inspection unavailable"), { code: "ETIMEDOUT" });
    });
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")?.message).toMatch(/EPERM/);
  });

  it.each([
    { error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) },
    { signal: "SIGTERM" },
    { stdout: Buffer.from("") },
  ])("rejects unknown or interrupted inspection metadata", (override) => {
    vi.mocked(childProcess.spawnSync).mockImplementation((() => ({
      pid: 1, output: [], stdout: "", stderr: "", status: 1, signal: null, ...override,
    })) as typeof childProcess.spawnSync);
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeInstanceOf(Error);
  });

  it("fails closed without an observable current owner", () => {
    Object.defineProperty(process, "getuid", { configurable: true, value: undefined });
    const inspect = psResult("", 1);
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeInstanceOf(Error);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("does not reclassify EPERM on another platform", () => {
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    const inspect = psResult("", 1);
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeInstanceOf(Error);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("preserves successful signals and ESRCH without inspecting", () => {
    const inspect = psResult("", 1);
    kill.mockImplementationOnce(() => true).mockImplementationOnce(() => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    expect(signalVerificationProcessGroup(groupId, "SIGTERM")).toBeUndefined();
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeUndefined();
    expect(inspect).not.toHaveBeenCalled();
  });

  it("retains other signal failures without inspecting", () => {
    const inspect = psResult("", 1);
    kill.mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(signalVerificationProcessGroup(groupId, "SIGKILL")).toBeInstanceOf(Error);
    expect(inspect).not.toHaveBeenCalled();
  });

  it.each([0, 1, -1, Number.NaN, Number.POSITIVE_INFINITY, 9007199254740992])(
    "never signals an invalid owned group ID %s", (group) => {
      expect(signalVerificationProcessGroup(group, "SIGKILL")).toBeInstanceOf(Error);
      expect(kill).not.toHaveBeenCalled();
    }
  );

  it("keeps a missing child PID a no-op", () => {
    expect(signalVerificationProcessGroup(undefined, "SIGKILL")).toBeUndefined();
    expect(kill).not.toHaveBeenCalled();
  });
});
