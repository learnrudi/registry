import { describe, expect, it } from "vitest";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { listChangedStackIds, listChangedPaths, parseStackVerificationArgs } from "./verify-stacks.js";

describe("parseStackVerificationArgs", () => {
  it("accepts one explicit verification selection mode", () => {
    expect(parseStackVerificationArgs([
      "--stack",
      "stack:zulu",
      "--stack",
      "stack:alpha",
      "--prepare",
      "--json",
    ])).toEqual({
      mode: "selected",
      packageIds: ["stack:alpha", "stack:zulu"],
      prepare: true,
      json: true,
    });

    expect(() => parseStackVerificationArgs([
      "--all",
      "--changed-from",
      "main",
    ])).toThrow("Choose exactly one stack verification selection mode");
  });
});


describe("changed stack paths", () => {
  it("includes deletions and both sides of cross-stack renames", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "registry-diff-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8" });
    try {
      git("init", "-q");
      await fs.mkdir(path.join(root, "catalog/stacks/alpha"), { recursive: true });
      await fs.writeFile(path.join(root, "catalog/stacks/alpha/verify.js"), "verification fixture");
      await fs.writeFile(path.join(root, "catalog/stacks/alpha/deleted.js"), "deleted fixture");
      git("add", ".");
      git("commit", "-qm", "fixture baseline");
      const base = git("rev-parse", "HEAD").trim();
      await fs.mkdir(path.join(root, "catalog/stacks/beta"), { recursive: true });
      await fs.rename(path.join(root, "catalog/stacks/alpha/verify.js"), path.join(root, "catalog/stacks/beta/verify.js"));
      await fs.rm(path.join(root, "catalog/stacks/alpha/deleted.js"));
      git("add", "-A");
      git("commit", "-qm", "fixture changes");
      expect(await listChangedPaths(root, base)).toEqual([
        "catalog/stacks/alpha/deleted.js", "catalog/stacks/alpha/verify.js", "catalog/stacks/beta/verify.js",
      ]);
      expect(await listChangedStackIds(root, base)).toEqual(["stack:alpha", "stack:beta"]);
      // Complete retirement has no remaining stack contract to execute.
      await fs.rmdir(path.join(root, "catalog/stacks/alpha"));
      expect(await listChangedStackIds(root, base)).toEqual(["stack:beta"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
