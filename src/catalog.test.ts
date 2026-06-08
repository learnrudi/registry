import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertCatalogReferences,
  discoverCatalogPackages,
} from "./catalog.js";

let tmpDir: string;

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function writeText(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function writeDemoStack(id = "demo"): Promise<void> {
  await writeJson(path.join(tmpDir, `catalog/stacks/${id}/manifest.v2.json`), {
    id: `stack:${id}`,
    kind: "stack",
    name: "Demo Stack",
    version: "1.0.0",
    delivery: "remote",
    install: {
      source: "catalog",
      path: `catalog/stacks/${id}`,
    },
    runtime: "node",
    provides: {
      tools: ["demo_tool"],
    },
    mcp: {
      transport: "stdio",
      command: "node",
      args: ["index.js"],
    },
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudi-registry-catalog-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("catalog package discovery", () => {
  it("discovers Markdown skills as v2 catalog packages", async () => {
    await writeDemoStack();
    await writeText(
      path.join(tmpDir, "catalog/skills/demo-skill.md"),
      `---
name: Demo Skill
description: Demonstrates skill package discovery
version: 1.2.3
category: testing
tags: [demo, skill]
requires:
  stacks:
    - demo
---

# Demo Skill
`
    );

    const packages = await discoverCatalogPackages(tmpDir);
    const byId = Object.fromEntries(packages.map((item) => [item.manifest.id, item]));

    expect(byId["skill:demo-skill"].path).toBe("catalog/skills/demo-skill.md");
    expect(byId["skill:demo-skill"].manifest).toMatchObject({
      id: "skill:demo-skill",
      kind: "skill",
      name: "Demo Skill",
      version: "1.2.3",
      delivery: "remote",
      install: {
        source: "catalog",
        path: "catalog/skills/demo-skill.md",
      },
      requires: {
        stacks: ["stack:demo"],
      },
      meta: {
        description: "Demonstrates skill package discovery",
        category: "testing",
        tags: ["demo", "skill"],
      },
    });
  });

  it("rejects stack related.skills references to unknown skills", async () => {
    await writeJson(path.join(tmpDir, "catalog/stacks/demo/manifest.v2.json"), {
      id: "stack:demo",
      kind: "stack",
      name: "Demo Stack",
      version: "1.0.0",
      delivery: "remote",
      install: {
        source: "catalog",
        path: "catalog/stacks/demo",
      },
      runtime: "node",
      provides: {
        tools: ["demo_tool"],
      },
      related: {
        skills: ["skill:missing"],
      },
      mcp: {
        transport: "stdio",
        command: "node",
      },
    });

    const packages = await discoverCatalogPackages(tmpDir);

    expect(() => assertCatalogReferences(packages)).toThrow(
      "[stack:demo] related.skills references unknown skill: skill:missing"
    );
  });

  it("rejects skill requires.stacks references to unknown stacks", async () => {
    await writeText(
      path.join(tmpDir, "catalog/skills/orphan-skill.md"),
      `---
name: Orphan Skill
description: References a missing stack
requires:
  stacks:
    - missing-stack
---

# Orphan Skill
`
    );

    const packages = await discoverCatalogPackages(tmpDir);

    expect(() => assertCatalogReferences(packages)).toThrow(
      "[skill:orphan-skill] requires.stacks references unknown stack: stack:missing-stack"
    );
  });
});
