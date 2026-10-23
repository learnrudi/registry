import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("registry quality workflow", () => {
  it("enforces the mandatory quality gates for every PR and main push", async () => {
    const [workflow, packageJson] = await Promise.all([
      fs.readFile(path.join(repoRoot, ".github/workflows/registry.yml"), "utf8"),
      fs.readFile(path.join(repoRoot, "package.json"), "utf8").then(JSON.parse),
    ]);

    const requiredCommands = [
      "npm test",
      "npm run build",
      "npm run validate:public -- --json",
      "npm run indexes:check",
      "npm run catalog:clean:check",
      "npm run stacks:verify",
      "npm run release:verify",
      "npm run debt:scan",
      "npm pack --dry-run --json",
    ];
    for (const command of requiredCommands) {
      expect(workflow, `missing mandatory CI command: ${command}`).toContain(
        `run: ${command}`
      );
    }

    const triggerBlock = workflow.match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1];
    expect(triggerBlock, "CI must define its trigger events").toBeDefined();
    expect(triggerBlock, "CI must run on main pushes").toMatch(
      /^  push:\n    branches: \[main\]$/m
    );
    expect(triggerBlock, "CI must run on PRs targeting main").toMatch(
      /^  pull_request:\n    branches: \[main\]$/m
    );
    expect(
      triggerBlock,
      "Path filters would leave the required CI gate pending for excluded changes"
    ).not.toMatch(/^\s+paths(?:-ignore)?:/m);

    expect(
      workflow.match(/name: Configure deterministic source date/g),
      "validate and release jobs must preserve the committed index timestamp"
    ).toHaveLength(2);
    expect(workflow).toContain("SOURCE_DATE_EPOCH");
    expect(workflow).toContain("JSON.parse");
    expect(workflow).toContain("$GITHUB_ENV");

    expect(packageJson.scripts?.["debt:scan"]).toBeTypeOf("string");
    expect(packageJson.scripts["debt:scan"].trim()).not.toBe("");
  });

  it("checks committed indexes before exercising regeneration and rejecting tracked drift", async () => {
    const workflow = await fs.readFile(path.join(repoRoot, ".github/workflows/registry.yml"), "utf8");
    const check = workflow.indexOf("run: npm run indexes:check");
    const sync = workflow.indexOf("run: npm run indexes:sync");
    const clean = workflow.indexOf("run: git diff --exit-code -- index.json");
    expect(check).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(check);
    expect(clean).toBeGreaterThan(sync);
  });

  it("packages ESM stack runtime modules", async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(repoRoot, "package.json"), "utf8")
    );

    expect(packageJson.files).toContain(
      "catalog/stacks/**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,py,txt,html}"
    );
  });
});
