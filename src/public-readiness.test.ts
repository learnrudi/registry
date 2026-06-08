import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validatePublicReadiness } from "./public-readiness.js";

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-registry-public-"));
  await fs.mkdir(path.join(tmpDir, "catalog/stacks/demo"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "catalog/skills"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "catalog/workflows"), { recursive: true });
  await writeJson(path.join(tmpDir, "package.json"), {
    name: "@rudi/registry-test",
    files: ["index.json", "catalog", "dist"],
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("validatePublicReadiness", () => {
  it("passes a minimal tracked registry", async () => {
    await writeJson(path.join(tmpDir, "index.json"), {
      packages: {
        stacks: {
          official: [
            {
              id: "stack:demo",
              path: "catalog/stacks/demo",
            },
          ],
        },
      },
    });
    await writeJson(path.join(tmpDir, "catalog/stacks/demo/manifest.json"), {
      id: "stack:demo",
      name: "Demo",
    });

    const report = await validatePublicReadiness(tmpDir, {
      trackedFiles: new Set([
        "index.json",
        "package.json",
        "catalog/stacks/demo/manifest.json",
      ]),
    });

    expect(report.summary.errors).toBe(0);
  });

  it("reports missing paths, untracked paths, placeholder checksums, and secret-like files", async () => {
    await writeJson(path.join(tmpDir, "index.json"), {
      packages: {
        stacks: {
          official: [
            { id: "stack:missing", path: "catalog/stacks/missing" },
            { id: "stack:untracked", path: "catalog/stacks/untracked" },
          ],
        },
      },
    });
    await writeJson(path.join(tmpDir, "catalog/stacks/untracked/manifest.json"), {
      id: "stack:untracked",
      name: "Untracked",
    });
    await writeJson(path.join(tmpDir, "catalog/runtimes/v2/node.json"), {
      id: "runtime:node",
      checksum: { value: "0".repeat(64) },
    });
    await writeText(path.join(tmpDir, "catalog/stacks/untracked/token.json"), "{}");

    const report = await validatePublicReadiness(tmpDir, {
      trackedFiles: new Set(["index.json", "package.json"]),
    });
    const codes = report.issues.map((item) => item.code);

    expect(codes).toContain("index-path-missing");
    expect(codes).toContain("index-path-untracked");
    expect(codes).toContain("checksum-placeholder");
    expect(codes).toContain("secret-like-file");
    expect(report.summary.errors).toBeGreaterThanOrEqual(4);
  });
});
