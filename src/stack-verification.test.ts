import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildVerificationEnvironment,
  discoverStackVerification,
  runStackVerifications,
  selectChangedStackIds,
} from "./stack-verification.js";

let tmpDir: string;

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function writeText(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-stack-verify-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("discoverStackVerification", () => {
  it("requires every published stack to own a repository verification contract", async () => {
    const stacksRoot = path.resolve("catalog/stacks");
    const entries = await fs.readdir(stacksRoot, { withFileTypes: true });
    const stackDirectories: string[] = [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const stackDirectory = path.join(stacksRoot, entry.name);
      try {
        await fs.access(path.join(stackDirectory, "manifest.json"));
        stackDirectories.push(stackDirectory);
      } catch {
        // An untracked/empty directory is not a published stack.
      }
    }
    stackDirectories.sort();

    await expect(Promise.all(
      stackDirectories.map((stackDirectory) => discoverStackVerification(stackDirectory))
    )).resolves.toHaveLength(stackDirectories.length);
  });

  it("discovers a Node stack's repository-owned verify script", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/demo");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:demo",
      kind: "stack",
      runtime: "node",
    });
    await writeJson(path.join(stackDir, "package.json"), {
      name: "@rudi/stack-demo",
      scripts: { verify: "npm test" },
    });

    await expect(discoverStackVerification(stackDir)).resolves.toEqual({
      packageId: "stack:demo",
      runtime: "node",
      cwd: stackDir,
      executable: "npm",
      args: ["run", "verify"],
      source: "package.json#scripts.verify",
    });
  });

  it("discovers a Python stack's repository-owned verify module", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/demo-python");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:demo-python",
      kind: "stack",
      runtime: "python",
    });
    await writeText(path.join(stackDir, "verify.py"), "raise SystemExit(0)\n");

    await expect(discoverStackVerification(stackDir)).resolves.toEqual({
      packageId: "stack:demo-python",
      runtime: "python",
      cwd: stackDir,
      executable: "python3",
      args: ["verify.py"],
      source: "verify.py",
    });
  });

  it("reports a missing contract with package and source context", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/unverified");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:unverified",
      kind: "stack",
      runtime: "node",
    });
    await writeJson(path.join(stackDir, "package.json"), {
      name: "@rudi/stack-unverified",
      scripts: {},
    });

    await expect(discoverStackVerification(stackDir)).rejects.toThrow(
      "[stack:unverified] Missing repository verification contract: " +
        "package.json must define a non-empty scripts.verify"
    );

    const pythonDir = path.join(tmpDir, "catalog/stacks/unverified-python");
    await writeJson(path.join(pythonDir, "manifest.json"), {
      id: "stack:unverified-python",
      kind: "stack",
      runtime: "python",
    });
    await expect(discoverStackVerification(pythonDir)).rejects.toThrow(
      "[stack:unverified-python] Missing repository verification contract: " +
        "Python stacks require verify.py"
    );
  });
});

describe("selectChangedStackIds", () => {
  it("selects unique changed stack IDs in deterministic order", () => {
    expect(selectChangedStackIds([
      "README.md",
      "catalog/stacks/zulu/src/index.ts",
      "catalog/stacks/alpha/manifest.json",
      "catalog/stacks/zulu/tests/core.test.ts",
      "catalog/skills/demo.md",
    ])).toEqual(["stack:alpha", "stack:zulu"]);
  });
});

describe("buildVerificationEnvironment", () => {
  it("isolates user state and does not forward tokens or provider secrets", () => {
    expect(buildVerificationEnvironment({
      PATH: "/usr/bin",
      HOME: "/Users/example",
      GITHUB_TOKEN: "secret",
      OPENAI_API_KEY: "secret",
      LANG: "en_US.UTF-8",
    }, "/tmp/rudi-verify-home")).toEqual({
      PATH: "/usr/bin",
      LANG: "en_US.UTF-8",
      HOME: "/tmp/rudi-verify-home",
      RUDI_HOME: "/tmp/rudi-verify-home/.rudi",
      CI: "true",
      RUDI_VERIFY_OFFLINE: "1",
      RUDI_VERIFY_SESSION: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    });
  });
});

describe("runStackVerifications", () => {
  it("fails a verification contract that exceeds its execution timeout", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/slow-python");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:slow-python",
      kind: "stack",
      runtime: "python",
    });
    await writeText(
      path.join(stackDir, "verify.py"),
      "import time\ntime.sleep(2)\n"
    );

    const results = await runStackVerifications(tmpDir, ["stack:slow-python"], {
      timeoutMs: 50,
    });

    expect(results).toEqual([
      expect.objectContaining({
        packageId: "stack:slow-python",
        status: "failed",
        error: "verification timed out after 50ms",
      }),
    ]);
  });

  it("executes a selected stack contract without constructing a shell command", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/demo");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:demo",
      kind: "stack",
      runtime: "node",
    });
    await writeJson(path.join(stackDir, "package.json"), {
      scripts: { verify: "npm test" },
    });
    const observed: unknown[] = [];

    const results = await runStackVerifications(tmpDir, ["stack:demo"], {
      execute: async (command) => {
        observed.push(command);
      },
    });

    expect(observed).toEqual([
      expect.objectContaining({
        executable: "npm",
        args: ["run", "verify"],
        cwd: stackDir,
      }),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ packageId: "stack:demo", status: "passed" }),
    ]);
  });

  it("provisions locked Playwright Chromium before offline package hooks", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/browser");
    await writeJson(path.join(stackDir, "manifest.json"), { id: "stack:browser", kind: "stack", runtime: "node" });
    await writeJson(path.join(stackDir, "package.json"), {
      dependencies: { playwright: "1.58.0" },
      scripts: { "verify:prepare": "npm run install-browser", verify: "npm test" },
    });
    await writeJson(path.join(stackDir, "package-lock.json"), { lockfileVersion: 3 });
    const observed: Array<{ source: string; executable: string; args: string[] }> = [];
    const [result] = await runStackVerifications(tmpDir, ["stack:browser"], {
      prepare: true, execute: async command => { observed.push(command); },
    });
    expect(result.status).toBe("passed");
    expect(observed.map(command => command.source)).toEqual([
      "package-lock.json", "playwright-chromium", "package.json#scripts.verify:prepare", "package.json#scripts.verify",
    ]);
    expect(observed[1]).toMatchObject({
      executable: "node", args: [path.join(stackDir, "node_modules/playwright/cli.js"), "install", "chromium"],
    });
  });

  it("prepares locked Node dependencies before running the contract", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/demo");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:demo",
      kind: "stack",
      runtime: "node",
    });
    await writeJson(path.join(stackDir, "package.json"), {
      dependencies: { example: "1.0.0" },
      scripts: { verify: "npm test" },
    });
    await writeJson(path.join(stackDir, "package-lock.json"), {
      lockfileVersion: 3,
    });
    const observed: unknown[] = [];

    await runStackVerifications(tmpDir, ["stack:demo"], {
      prepare: true,
      execute: async (command) => {
        observed.push(command);
      },
    });

    expect(observed).toEqual([
      expect.objectContaining({
        executable: "npm",
        args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
        source: "package-lock.json",
      }),
      expect.objectContaining({
        executable: "npm",
        args: ["run", "verify"],
      }),
    ]);
  });

  it("runs a package-owned preparation hook in the same isolated session", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/prepared-session");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:prepared-session",
      kind: "stack",
      runtime: "node",
    });
    await writeJson(path.join(stackDir, "package.json"), {
      scripts: {
        "verify:prepare": "node prepare.mjs",
        verify: "node verify.mjs",
      },
    });
    await writeText(
      path.join(stackDir, "prepare.mjs"),
      "import fs from 'node:fs'; import path from 'node:path'; " +
        "fs.writeFileSync(path.join(process.env.HOME, 'prepared'), 'yes');\n"
    );
    await writeText(
      path.join(stackDir, "verify.mjs"),
      "import fs from 'node:fs'; import path from 'node:path'; " +
        "if (!fs.existsSync(path.join(process.env.HOME, 'prepared'))) process.exit(2);\n"
    );

    const results = await runStackVerifications(
      tmpDir,
      ["stack:prepared-session"],
      { prepare: true }
    );

    expect(results).toEqual([
      expect.objectContaining({
        packageId: "stack:prepared-session",
        status: "passed",
      }),
    ]);
  });

  it("fails closed when a Node stack declares unlocked dependencies", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/unlocked");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:unlocked",
      kind: "stack",
      runtime: "node",
    });
    await writeJson(path.join(stackDir, "package.json"), {
      dependencies: { example: "^1.0.0" },
      scripts: { verify: "npm test" },
    });

    const results = await runStackVerifications(tmpDir, ["stack:unlocked"], {
      prepare: true,
      execute: async () => undefined,
    });

    expect(results).toEqual([
      expect.objectContaining({
        packageId: "stack:unlocked",
        status: "failed",
        error: "[stack:unlocked] Node dependency preparation requires package-lock.json",
      }),
    ]);
  });

  it("runs Python verification inside an isolated prepared environment", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/demo-python");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:demo-python",
      kind: "stack",
      runtime: "python",
    });
    await writeText(path.join(stackDir, "verify.py"), "raise SystemExit(0)\n");
    await writeText(path.join(stackDir, "requirements.txt"), "mcp>=1,<2\n");
    const observed: Array<{ executable: string; args: string[]; source: string }> = [];

    await runStackVerifications(tmpDir, ["stack:demo-python"], {
      prepare: true,
      execute: async (command) => {
        observed.push(command);
      },
    });

    expect(observed).toHaveLength(3);
    expect(observed[0]).toEqual(expect.objectContaining({
      executable: "python3",
      args: ["-m", "venv", expect.stringContaining("rudi-stack-venv-")],
      source: "python-venv",
    }));
    expect(observed[1]).toEqual(expect.objectContaining({
      executable: expect.stringMatching(/rudi-stack-venv-.*\/bin\/python$/),
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "-r",
        path.join(stackDir, "requirements.txt"),
      ],
      source: "requirements.txt",
    }));
    expect(observed[2]).toEqual(expect.objectContaining({
      executable: observed[1].executable,
      args: ["verify.py"],
      source: "verify.py",
    }));
  });

  it("prepares a single runtime-directory Python requirements file", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/nested-python");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:nested-python",
      kind: "stack",
      runtime: "python",
    });
    await writeText(path.join(stackDir, "verify.py"), "raise SystemExit(0)\n");
    await writeText(path.join(stackDir, "python/requirements.txt"), "mcp>=1,<2\n");
    const observed: Array<{ args: string[]; source: string }> = [];

    await runStackVerifications(tmpDir, ["stack:nested-python"], {
      prepare: true,
      execute: async (command) => {
        observed.push(command);
      },
    });

    expect(observed).toHaveLength(3);
    expect(observed[1]).toEqual(expect.objectContaining({
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "-r",
        path.join(stackDir, "python/requirements.txt"),
      ],
      source: "python/requirements.txt",
    }));
  });

  it("rejects ambiguous Python requirements layouts", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/ambiguous-python");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:ambiguous-python",
      kind: "stack",
      runtime: "python",
    });
    await writeText(path.join(stackDir, "verify.py"), "raise SystemExit(0)\n");
    await writeText(path.join(stackDir, "requirements.txt"), "mcp>=1,<2\n");
    await writeText(path.join(stackDir, "python/requirements.txt"), "mcp>=1,<2\n");

    const results = await runStackVerifications(
      tmpDir,
      ["stack:ambiguous-python"],
      { prepare: true, execute: async () => undefined }
    );

    expect(results).toEqual([
      expect.objectContaining({
        packageId: "stack:ambiguous-python",
        status: "failed",
        error: "[stack:ambiguous-python] Multiple Python requirements files " +
          "require an explicit layout",
      }),
    ]);
  });

  it("does not treat arbitrary child requirements as the Python runtime layout", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/docs-requirements");
    await writeJson(path.join(stackDir, "manifest.json"), {
      id: "stack:docs-requirements",
      kind: "stack",
      runtime: "python",
    });
    await writeText(path.join(stackDir, "verify.py"), "raise SystemExit(0)\n");
    await writeText(path.join(stackDir, "docs/requirements.txt"), "sphinx>=1\n");
    const observed: unknown[] = [];

    const results = await runStackVerifications(
      tmpDir,
      ["stack:docs-requirements"],
      {
        prepare: true,
        execute: async (command) => {
          observed.push(command);
        },
      }
    );

    expect(results).toEqual([
      expect.objectContaining({ status: "passed" }),
    ]);
    expect(observed).toHaveLength(2);
  });
});


describe("verification containment", () => {
  it("returns a failed result when the OS refuses process-group cleanup", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/cleanup-error");
    await writeJson(path.join(stackDir, "manifest.json"), { id: "stack:cleanup-error", kind: "stack", runtime: "python" });
    await writeText(path.join(stackDir, "verify.py"), "raise SystemExit(0)\n");
    const originalKill = process.kill.bind(process);
    const kill = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < 0 && signal === "SIGKILL") throw Object.assign(new Error("synthetic kill EPERM"), { code: "EPERM" });
      return originalKill(pid, signal);
    });
    try {
      const [result] = await runStackVerifications(tmpDir, ["stack:cleanup-error"], { timeoutMs: 100 });
      expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/cleanup.*EPERM/) });
    } finally {
      kill.mockRestore();
    }
  });

  it("preserves CPU model detection used by browser dependency provisioning", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/cpu-probe");
    await writeJson(path.join(stackDir, "manifest.json"), { id: "stack:cpu-probe", kind: "stack", runtime: "node" });
    await writeJson(path.join(stackDir, "package.json"), { scripts: { verify: "node verify.cjs" } });
    await writeText(path.join(stackDir, "verify.cjs"), `require('node:assert/strict').equal(require('node:os').cpus()[0]?.model, ${JSON.stringify(os.cpus()[0].model)});`);
    const [result] = await runStackVerifications(tmpDir, ["stack:cpu-probe"]);
    expect(result, result.error).toMatchObject({ status: "passed" });
  });

  it.runIf(process.platform === "darwin")("denies reading a synthetic parent's environment through sysctl", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/sysctl-probe");
    await writeJson(path.join(stackDir, "manifest.json"), { id: "stack:sysctl-probe", kind: "stack", runtime: "python" });
    await writeText(path.join(stackDir, "verify.py"), [
      "import ctypes, errno, pathlib",
      "pid = int(pathlib.Path('parent-pid.txt').read_text())",
      "libc = ctypes.CDLL(None, use_errno=True)",
      "mib = (ctypes.c_int * 3)(1, 49, pid)",
      "size = ctypes.c_size_t(1024 * 1024)",
      "buffer = ctypes.create_string_buffer(size.value)",
      "result = libc.sysctl(mib, 3, buffer, ctypes.byref(size), None, 0)",
      "assert result == -1 and ctypes.get_errno() in (errno.EPERM, errno.EACCES), f'parent process arguments result={result}, errno={ctypes.get_errno()}'",
    ].join("\n"));
    const parentScript = path.join(tmpDir, "synthetic-parent.mjs");
    await writeText(parentScript, [
      `import { runStackVerifications } from ${JSON.stringify(pathToFileURL(path.resolve("src/stack-verification.ts")).href)};`,
      "import fs from 'node:fs/promises';",
      `await fs.writeFile(${JSON.stringify(path.join(stackDir, "parent-pid.txt"))}, String(process.pid));`,
      `const [result] = await runStackVerifications(${JSON.stringify(tmpDir)}, ['stack:sysctl-probe']);`,
      "if (result.status !== 'passed') { console.error(result.error); process.exit(1); }",
    ].join("\n"));
    // This disposable parent holds no real credentials; only the synthetic marker.
    await promisify(execFile)(process.execPath, ["--import", "tsx", parentScript], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, SYNTHETIC_REVIEW_SECRET: "fake-review-only" },
    });
  });

  it.each(["catalog", "stacks"])("rejects a symlinked %s layout before reading metadata", async (segment) => {
    const alternate = path.join(tmpDir, "alternate");
    const target = segment === "catalog" ? path.join(alternate, "stacks/alias") : path.join(alternate, "alias");
    await writeText(path.join(target, "manifest.json"), "invalid JSON must not be read");
    if (segment === "catalog") {
      await fs.symlink(alternate, path.join(tmpDir, "catalog"));
    } else {
      await fs.mkdir(path.join(tmpDir, "catalog"));
      await fs.symlink(alternate, path.join(tmpDir, "catalog/stacks"));
    }
    const observed: unknown[] = [];
    const [result] = await runStackVerifications(tmpDir, ["stack:alias"], {
      prepare: true, execute: async command => { observed.push(command); },
    });
    expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/symlink/i) });
    expect(observed).toEqual([]);
  });

  it("rejects a selected-stack symlink before preparation can make the repository writable", async () => {
    await fs.mkdir(path.join(tmpDir, "catalog/stacks"), { recursive: true });
    await writeJson(path.join(tmpDir, "manifest.json"), { id: "stack:alias", kind: "stack", runtime: "node" });
    await writeJson(path.join(tmpDir, "package.json"), { scripts: {
      "verify:prepare": "node -e \"require('node:fs').writeFileSync('outside-selected-stack.txt', 'unsafe')\"",
      verify: "node -e \"process.exit(0)\"",
    } });
    await fs.symlink(tmpDir, path.join(tmpDir, "catalog/stacks/alias"));
    const [result] = await runStackVerifications(tmpDir, ["stack:alias"], { prepare: true });
    expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/symlink/i) });
    await expect(fs.access(path.join(tmpDir, "outside-selected-stack.txt"))).rejects.toThrow();
  });

  it("terminates verification descendants when the deadline expires", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/deadline");
    await writeJson(path.join(stackDir, "manifest.json"), { id: "stack:deadline", kind: "stack", runtime: "python" });
    await writeText(path.join(stackDir, "verify.py"), [
      "import subprocess, sys, time",
      "subprocess.Popen([sys.executable, '-c', \"import time, pathlib; pathlib.Path('started-marker').write_text('started'); time.sleep(2); pathlib.Path('late-marker').write_text('late')\"])" ,
      "time.sleep(5)",
    ].join("\n"));
    // Allow native sandbox/Python startup under the full suite's CPU load.
    // An early macOS exec transition can reject signals with EPERM instead.
    const [result] = await runStackVerifications(tmpDir, ["stack:deadline"], { timeoutMs: 1_000 });
    expect(result).toMatchObject({ status: "failed", error: "verification timed out after 1000ms" });
    await expect(fs.readFile(path.join(stackDir, "started-marker"), "utf8")).resolves.toBe("started");
    await new Promise(resolve => setTimeout(resolve, 2_200));
    await expect(fs.access(path.join(stackDir, "late-marker"))).rejects.toThrow();
  }, 10_000);

  it("denies host files and network to verification code and its descendants", async () => {
    const stackDir = path.join(tmpDir, "catalog/stacks/contained");
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "registry-private-fixture-"));
    const server = net.createServer(socket => socket.end());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;
    try {
      const privateFile = path.join(outside, "private.txt");
      await fs.writeFile(privateFile, "synthetic private fixture");
      await writeJson(path.join(stackDir, "manifest.json"), { id: "stack:contained", kind: "stack", runtime: "python" });
      await writeText(path.join(stackDir, "verify.py"), [
        "import pathlib, socket, subprocess, sys",
        `private_file = ${JSON.stringify(privateFile)}`,
        "try:",
        "    pathlib.Path(private_file).read_text()",
        "except (PermissionError, FileNotFoundError):",
        "    pass",
        "else:",
        "    raise SystemExit('host file readable')",
        "try:",
        "    pathlib.Path(private_file).write_text('changed')",
        "except (PermissionError, FileNotFoundError):",
        "    pass",
        "else:",
        "    raise SystemExit('host file writable')",
        "try:",
        `    socket.create_connection(('127.0.0.1', ${port}), timeout=0.5)`,
        "except OSError:",
        "    pass",
        "else:",
        "    raise SystemExit('network available')",
        "result = subprocess.run([sys.executable, '-c', 'import pathlib, sys; pathlib.Path(sys.argv[1]).read_text()', private_file], capture_output=True)",
        "assert result.returncode != 0, 'child escaped filesystem boundary'",
      ].join("\n"));
      const [result] = await runStackVerifications(tmpDir, ["stack:contained"]);
      expect(result, result.error).toMatchObject({ status: "passed" });
      expect(await fs.readFile(privateFile, "utf8")).toBe("synthetic private fixture");
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
