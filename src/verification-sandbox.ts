import fs from "node:fs/promises";
import path from "node:path";
import { assertCanonicalStackDirectory } from "./stack-path.js";

export interface VerificationSandbox {
  executable: string;
  args: string[];
  path: string;
}

async function findExecutable(name: string): Promise<string> {
  const candidates = path.isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? "").split(path.delimiter)
      .filter(Boolean).map(directory => path.join(directory, name));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return await fs.realpath(candidate);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw error;
      }
    }
  }
  throw new Error(`Verification requires executable: ${name}`);
}

// Grant toolchain files, never the user's home or an entire executable PATH.
function runtimeRoot(executable: string): string {
  const directory = path.dirname(executable);
  return path.basename(directory) === "bin" ? path.dirname(directory) : directory;
}

function subpaths(paths: string[]): string {
  return paths.map(value => `(subpath ${JSON.stringify(value)})`).join(" ");
}

export async function buildVerificationSandbox(options: {
  root: string;
  cwd: string;
  home: string;
  executable: string;
  args: string[];
  network: boolean;
  runtime: "node" | "python" | "deno" | "bun";
}): Promise<VerificationSandbox> {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error("Stack verification requires macOS sandbox-exec or Linux bubblewrap; no unsandboxed fallback is permitted");
  }
  const root = await fs.realpath(options.root);
  const cwd = await assertCanonicalStackDirectory(options.root, options.cwd);
  const home = await fs.realpath(options.home);
  if (options.runtime !== "node" && options.runtime !== "python") {
    throw new Error(`Unsupported sandbox runtime: ${options.runtime}`);
  }
  const runtimeExecutable = await findExecutable(options.runtime === "node" ? "node" : "python3");
  const runtimeRoots = [runtimeRoot(runtimeExecutable)];
  const executable = path.isAbsolute(options.executable)
    ? options.executable : await findExecutable(options.executable);
  const searchPath = [...new Set([
    path.dirname(runtimeExecutable), "/usr/bin", "/bin", "/usr/sbin", "/sbin",
  ])].join(":");

  if (process.platform === "darwin") {
    const profile = [
      "(version 1)", "(deny default)", "(allow process-fork)", "(allow process-exec)",
      '(deny sysctl-read (sysctl-name "kern.procargs2"))',
      '(deny process-info* (require-not (target same-sandbox)))',
      // Python uname and Node's page allocator require these non-process properties.
      '(allow sysctl-read (sysctl-name "kern.ostype") (sysctl-name "kern.hostname") (sysctl-name "kern.osrelease") (sysctl-name "kern.version") (sysctl-name "hw.machine") (sysctl-name "hw.pagesize_compat") (sysctl-name "hw.model") (sysctl-name "hw.ncpu") (sysctl-name "machdep.cpu.brand_string"))',
      "(allow mach-lookup)", "(allow signal (target same-sandbox))", "(allow file-read-metadata)",
      `(allow file-read* (literal "/") ${subpaths(["/System", "/usr", "/bin", "/sbin", "/opt/homebrew", root, home, ...runtimeRoots])})`,
      '(allow file-read* (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))',
      `(allow file-write* ${subpaths([cwd, home])} (literal "/dev/null"))`,
      ...(options.network ? ["(allow network*)"] : []),
    ].join("\n");
    return {
      executable: "/usr/bin/sandbox-exec",
      args: ["-p", profile, executable, ...options.args],
      path: searchPath,
    };
  }

  const args = ["--die-with-parent", "--new-session", "--unshare-all"];
  if (options.network) args.push("--share-net");
  const readable = [...new Set([
    // Debian shared-library links (including FFmpeg's BLAS dependency) pass
    // through alternatives before resolving back into the system libraries.
    "/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc/alternatives", "/etc/ssl", "/etc/ld.so.cache", ...runtimeRoots,
  ])];
  for (const directory of readable) {
    try {
      await fs.access(directory);
      args.push("--ro-bind", directory, directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (options.network) args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
  args.push(
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--ro-bind", root, root,
    "--bind", cwd, cwd, "--bind", home, home, "--chdir", cwd,
    "--", executable, ...options.args,
  );
  return { executable: await findExecutable("bwrap"), args, path: searchPath };
}
