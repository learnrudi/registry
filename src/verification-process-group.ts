import { spawnSync } from "node:child_process";

const INSPECTION_TIMEOUT_MS = 1_000;
const INSPECTION_MAX_BYTES = 65_536;

/** A failed signal is harmless only with independent, fail-closed OS evidence. */
function groupIsAbsentOrTerminal(processGroupId: number): boolean {
  try {
    const uid = process.getuid?.();
    if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0) return false;
    const result = spawnSync("/bin/ps", [
      "-o", "pid=,pgid=,uid=,stat=", "-g", String(processGroupId),
    ], {
      encoding: "utf8",
      timeout: INSPECTION_TIMEOUT_MS,
      maxBuffer: INSPECTION_MAX_BYTES,
      shell: false,
      env: { LC_ALL: "C" },
    });
    if (result.error || result.signal !== null || typeof result.stdout !== "string"
      || typeof result.stderr !== "string" || result.stderr.trim()
      || result.stdout.length > INSPECTION_MAX_BYTES) return false;
    const output = result.stdout.trim();
    // Darwin ps exits 1 without output when the selected group is absent.
    if (result.status === 1 && output === "") return true;
    if (result.status !== 0 || output === "") return false;
    const seen = new Set<number>();
    return output.split("\n").every((line) => {
      const row = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(Z[+<NLSsEVWX]*)\s*$/.exec(line);
      if (!row) return false;
      const [pid, pgid, owner] = row.slice(1, 4).map(Number);
      if (![pid, pgid, owner].every(Number.isSafeInteger) || pid <= 1
        || pgid !== processGroupId || owner !== uid || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
  } catch {
    return false;
  }
}

/** Signal only the detached group created for one verification subprocess. */
export function signalVerificationProcessGroup(
  processGroupId: number | undefined,
  signal: NodeJS.Signals
): Error | undefined {
  if (processGroupId === undefined) return;
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 1) {
    return new Error("verification process-group cleanup requires an owned positive group ID");
  }
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? error.code : undefined;
    if (code === "ESRCH") return;
    // Darwin may retain an exited-only group while returning EPERM for killpg.
    // Never infer death from EPERM alone or fall back to signalling one PID.
    if (code === "EPERM" && process.platform === "darwin"
      && groupIsAbsentOrTerminal(processGroupId)) return;
    return new Error(`verification process-group cleanup failed (${processGroupId}): ${error instanceof Error ? error.message : String(error)}`);
  }
}
