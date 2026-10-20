import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("generates private identity skills without changing existing destinations", async () => {
  const result = await promisify(execFile)("python3.12", [
    "-B", "-m", "unittest", "discover", "-s", "tests",
    "-p", "test_compute_skill_shortcuts.py", "-v"
  ], { cwd: path.resolve(import.meta.dirname, "..") });
  expect(result.stderr).toContain("OK");
});
