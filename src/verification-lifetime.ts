import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

const MAX_INFO_BYTES = 4_096;
const CLEANUP_TIMEOUT_MS = 5_000;

function failure(message: string): Error {
  return new Error(`verification sandbox cleanup failed: ${message}`);
}

function absent(error: unknown): boolean {
  return ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException)?.code ?? "");
}

function confirmAbsent(pid: number): void {
  // hidepid can return ENOENT for a live process. Signal 0 delivers no signal;
  // only ESRCH independently proves absence. Permission errors remain unknown.
  try { process.kill(pid, 0); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw failure(`could not confirm sandbox ${pid} absent: ${String(error)}`);
  }
  throw failure(`could not confirm sandbox ${pid} absent: process still exists`);
}

function processState(stat: string, pid: number): string {
  // comm can contain spaces, newlines and parentheses; state follows its last ).
  const row = /^(\d+) \([\s\S]*\) ([RSDZTWtXxKWPIN]) /.exec(stat);
  if (!row || Number(row[1]) !== pid) throw failure("invalid process identity or state");
  return row[2];
}

async function waitForExit(pid: number): Promise<void> {
  // An unavailable/mismatched procfs must not masquerade as an absent process.
  processState(await fs.readFile("/proc/self/stat", "utf8"), process.pid);
  let handle;
  try { handle = await fs.open(`/proc/${pid}/stat`, "r"); }
  catch (error) { if (absent(error)) return confirmAbsent(pid); throw error; }
  try {
    // Identity comes from the launcher's private pipe. A procfs inode's owner
    // becomes root during exit; it is not the identity of the process itself.
    const deadline = performance.now() + CLEANUP_TIMEOUT_MS;
    const buffer = Buffer.alloc(4_096);
    for (;;) {
      let bytesRead: number;
      try { ({ bytesRead } = await handle.read(buffer, 0, buffer.length, 0)); }
      catch (error) { if (absent(error)) return confirmAbsent(pid); throw error; }
      if (bytesRead === buffer.length) throw failure("oversized process state");
      const state = processState(buffer.toString("utf8", 0, bytesRead), pid);
      // Linux tears down and waits for the PID namespace's descendants before
      // publishing its init's EXIT_ZOMBIE. Signal delivery/pipe EOF is earlier.
      if (state === "Z" || state === "X") return;
      if (performance.now() >= deadline) throw failure(`sandbox ${pid} still live after ${CLEANUP_TIMEOUT_MS}ms`);
      await delay(10);
    }
  } finally {
    await handle.close();
  }
}

/** Capture Bubblewrap's private info pipe, then await its PID namespace's exit. */
export function observeLinuxSandboxLifetime(child: ChildProcess): () => Promise<void> {
  const stream = child.stdio[3] as Readable | null;
  // Resolve errors as data until the launcher has been cleaned up; no detached
  // rejected promise and no premature return while the command is still live.
  const identity = new Promise<number | Error>(resolve => {
    if (!stream) { resolve(failure("missing launcher info pipe")); return; }
    let chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_INFO_BYTES) {
        chunks = [];
        resolve(failure("oversized launcher metadata"));
      } else chunks.push(chunk);
    });
    stream.once("end", () => {
      try {
        const info: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const pid = info && typeof info === "object" && "child-pid" in info ? info["child-pid"] : undefined;
        if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 1
          || pid === child.pid || pid === process.pid) throw failure("invalid launcher child PID");
        resolve(pid);
      } catch (error) { resolve(failure(`invalid launcher metadata: ${String(error)}`)); }
    });
    stream.once("error", error => resolve(failure(`launcher info pipe: ${error.message}`)));
    stream.once("close", () => resolve(failure("incomplete launcher metadata")));
  });
  return async () => {
    const pid = await identity;
    if (pid instanceof Error) throw pid;
    try { await waitForExit(pid); }
    catch (error) { throw failure(error instanceof Error ? error.message : String(error)); }
  };
}
