import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildVerificationSandbox } from "./verification-sandbox.js";
import { assertCanonicalStackDirectory } from "./stack-path.js";

export interface StackVerificationCommand {
  packageId: string;
  runtime: "node" | "python" | "deno" | "bun";
  cwd: string;
  executable: string;
  args: string[];
  source: string;
}

export interface StackVerificationResult {
  packageId: string;
  status: "passed" | "failed";
  durationMs: number;
  source?: string;
  error?: string;
}

export interface RunStackVerificationOptions {
  execute?: (command: StackVerificationCommand) => Promise<void>;
  prepare?: boolean;
  timeoutMs?: number;
}

interface StackManifest {
  id?: unknown;
  kind?: unknown;
  runtime?: unknown;
}

interface NodePackage {
  scripts?: Record<string, unknown>;
}

function contractError(packageId: string, message: string): Error {
  return new Error(`[${packageId}] Missing repository verification contract: ${message}`);
}

async function readJson(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function findPythonRequirements(command: StackVerificationCommand): Promise<{
  file: string;
  source: string;
} | undefined> {
  const candidates = [
    path.join(command.cwd, "requirements.txt"),
    path.join(command.cwd, "python", "requirements.txt"),
  ];

  const found: string[] = [];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      found.push(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (found.length > 1) {
    throw new Error(
      `[${command.packageId}] Multiple Python requirements files require an explicit layout`
    );
  }
  if (found.length === 0) return undefined;
  return {
    file: found[0],
    source: path.relative(command.cwd, found[0]).replaceAll(path.sep, "/"),
  };
}

export function selectChangedStackIds(changedPaths: string[]): string[] {
  const stackIds = new Set<string>();

  for (const changedPath of changedPaths) {
    const normalized = changedPath.replaceAll("\\", "/");
    const match = /^catalog\/stacks\/([a-z0-9][a-z0-9-_]*)(?:\/|$)/.exec(
      normalized
    );
    if (match) stackIds.add(`stack:${match[1]}`);
  }

  return [...stackIds].sort();
}

const FORWARDED_ENV_KEYS = [
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "TERM",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
] as const;

export function buildVerificationEnvironment(
  source: Record<string, string | undefined>,
  isolatedHome: string
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const key of FORWARDED_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }

  return {
    ...environment,
    HOME: isolatedHome,
    RUDI_HOME: path.join(isolatedHome, ".rudi"),
    CI: "true",
    RUDI_VERIFY_OFFLINE: "1",
    RUDI_VERIFY_SESSION: "1",
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

const DEFAULT_VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000;

async function executeVerification(
  command: StackVerificationCommand,
  timeoutMs: number,
  isolatedHome: string,
  root: string
): Promise<void> {
  const network = command.source === "package-lock.json" || command.source === "playwright-chromium"
    || /^(?:python\/)?requirements\.txt$/.test(command.source);
  const sandbox = await buildVerificationSandbox({
    root,
    cwd: command.cwd,
    home: isolatedHome,
    executable: command.executable,
    args: command.args,
    network,
    runtime: command.runtime,
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(sandbox.executable, sandbox.args, {
      cwd: command.cwd,
      env: {
        ...buildVerificationEnvironment(process.env, isolatedHome),
        PATH: sandbox.path,
        TMPDIR: isolatedHome,
        TMP: isolatedHome,
        TEMP: isolatedHome,
        RUDI_VERIFY_OFFLINE: network ? "0" : "1",
        PLAYWRIGHT_BROWSERS_PATH: path.join(isolatedHome, "browsers"),
      },
      shell: false,
      detached: true,
      stdio: "inherit",
    });

    const signalGroup = (signal: NodeJS.Signals): Error | undefined => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          return new Error(`verification process-group cleanup failed (${child.pid}): ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    let timedOut = false;
    let cleanupError: Error | undefined;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      cleanupError = signalGroup("SIGTERM");
      forceKillTimer = setTimeout(() => {
        const error = signalGroup("SIGKILL");
        if (error) {
          clearTimers();
          reject(error);
        }
      }, 1_000);
    }, timeoutMs);

    const clearTimers = () => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };

    child.once("error", (error) => {
      clearTimers();
      reject(error);
    });
    child.once("close", (code, signal) => {
      const error = signalGroup("SIGKILL") ?? cleanupError;
      clearTimers();
      if (error) {
        reject(error);
        return;
      }
      if (timedOut) {
        reject(new Error(`verification timed out after ${timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        signal
          ? `verification terminated by signal ${signal}`
          : `verification exited with code ${String(code)}`
      ));
    });
  });
}

async function prepareVerification(
  command: StackVerificationCommand,
  execute: (command: StackVerificationCommand) => Promise<void>,
  temporaryRoot = os.tmpdir()
): Promise<{
  command: StackVerificationCommand;
  cleanup?: () => Promise<void>;
}> {
  if (command.runtime === "python") {
    const virtualEnvironment = await fs.mkdtemp(
      path.join(temporaryRoot, "rudi-stack-venv-")
    );
    const pythonExecutable = process.platform === "win32"
      ? path.join(virtualEnvironment, "Scripts", "python.exe")
      : path.join(virtualEnvironment, "bin", "python");

    try {
      await execute({
        ...command,
        executable: "python3",
        args: ["-m", "venv", virtualEnvironment],
        source: "python-venv",
      });

      const requirements = await findPythonRequirements(command);
      if (requirements) {
        await execute({
          ...command,
          executable: pythonExecutable,
          args: [
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "-r",
            requirements.file,
          ],
          source: requirements.source,
        });
      }
    } catch (error) {
      await fs.rm(virtualEnvironment, { recursive: true, force: true });
      throw error;
    }

    return {
      command: { ...command, executable: pythonExecutable },
      cleanup: () => fs.rm(virtualEnvironment, { recursive: true, force: true }),
    };
  }

  if (command.runtime !== "node") return { command };

  const packageJson = await readJson(
    path.join(command.cwd, "package.json")
  ) as {
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    scripts?: Record<string, unknown>;
  };
  let hasLockfile = true;
  try {
    await fs.access(path.join(command.cwd, "package-lock.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      hasLockfile = false;
      const dependencyCount =
        Object.keys(packageJson.dependencies ?? {}).length +
        Object.keys(packageJson.devDependencies ?? {}).length;
      if (dependencyCount > 0) {
        throw new Error(
          `[${command.packageId}] Node dependency preparation requires package-lock.json`
        );
      }
    } else {
      throw error;
    }
  }

  if (hasLockfile) {
    await execute({
      ...command,
      executable: "npm",
      args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      source: "package-lock.json",
    });
  }

  if (Object.hasOwn(packageJson.dependencies ?? {}, "playwright")
    || Object.hasOwn(packageJson.devDependencies ?? {}, "playwright")) {
    // Fixed dependency provisioning is network-enabled; repository-owned hooks
    // remain offline and reuse this session's browser cache.
    await execute({
      ...command,
      executable: "node",
      args: [path.join(command.cwd, "node_modules/playwright/cli.js"), "install", "chromium"],
      source: "playwright-chromium",
    });
  }

  const prepareScript = packageJson.scripts?.["verify:prepare"];
  if (prepareScript !== undefined) {
    if (typeof prepareScript !== "string" || prepareScript.trim() === "") {
      throw new Error(
        `[${command.packageId}] package.json scripts.verify:prepare must be a non-empty string`
      );
    }
    await execute({
      ...command,
      executable: "npm",
      args: ["run", "verify:prepare"],
      source: "package.json#scripts.verify:prepare",
    });
  }
  return { command };
}

export async function runStackVerifications(
  root: string,
  packageIds: string[],
  options: RunStackVerificationOptions = {}
): Promise<StackVerificationResult[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Stack verification timeout must be a positive integer");
  }
  const results: StackVerificationResult[] = [];

  for (const packageId of [...new Set(packageIds)].sort()) {
    const match = /^stack:([a-z0-9][a-z0-9-_]*)$/.exec(packageId);
    if (!match) {
      results.push({
        packageId,
        status: "failed",
        durationMs: 0,
        error: "Expected a canonical stack:<id> package ID",
      });
      continue;
    }

    const startedAt = Date.now();
    let isolatedHome: string | undefined;
    try {
      if (!options.execute) {
        isolatedHome = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-verify-home-"));
      }
      const execute = options.execute ?? (
        (command: StackVerificationCommand) => executeVerification(
          command,
          timeoutMs,
          isolatedHome as string,
          root
        )
      );
      const command = await discoverStackVerification(
        path.join(path.resolve(root), "catalog", "stacks", match[1])
      );
      if (command.packageId !== packageId) {
        throw new Error(
          `[${packageId}] Manifest ID mismatch: received ${command.packageId}`
        );
      }
      const prepared = options.prepare
        ? await prepareVerification(command, execute, isolatedHome)
        : { command };
      try {
        await execute(prepared.command);
      } finally {
        await prepared.cleanup?.();
      }
      results.push({
        packageId,
        status: "passed",
        durationMs: Date.now() - startedAt,
        source: command.source,
      });
    } catch (error) {
      results.push({
        packageId,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (isolatedHome) {
        await fs.rm(isolatedHome, { recursive: true, force: true });
      }
    }
  }

  return results;
}

export async function discoverStackVerification(
  stackDir: string
): Promise<StackVerificationCommand> {
  const resolvedStackDir = path.resolve(stackDir);
  await assertCanonicalStackDirectory(path.resolve(resolvedStackDir, "../../.."), resolvedStackDir);
  const manifest = await readJson(
    path.join(resolvedStackDir, "manifest.json")
  ) as StackManifest;
  const packageId = String(manifest.id);

  if (manifest.runtime === "python") {
    try {
      await fs.access(path.join(resolvedStackDir, "verify.py"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw contractError(packageId, "Python stacks require verify.py");
      }
      throw error;
    }
    return {
      packageId,
      runtime: "python",
      cwd: resolvedStackDir,
      executable: "python3",
      args: ["verify.py"],
      source: "verify.py",
    };
  }

  if (manifest.runtime !== "node") {
    throw new Error(`Unsupported stack runtime: ${String(manifest.runtime)}`);
  }

  const packageJson = await readJson(
    path.join(resolvedStackDir, "package.json")
  ) as NodePackage;
  const verifyScript = packageJson.scripts?.verify;
  if (typeof verifyScript !== "string" || verifyScript.trim() === "") {
    throw contractError(
      packageId,
      "package.json must define a non-empty scripts.verify"
    );
  }

  return {
    packageId,
    runtime: "node",
    cwd: resolvedStackDir,
    executable: "npm",
    args: ["run", "verify"],
    source: "package.json#scripts.verify",
  };
}
