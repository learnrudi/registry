import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const stackRoot = path.join(process.cwd(), "catalog/stacks/otter-mcp");
const expectedTools = ["get_user_info", "search", "fetch"];
const expectedBridgePackage = "mcp-remote@0.1.38";
const expectedRemoteUrl = "https://mcp.otter.ai/mcp";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

describe("otter-mcp stack package", () => {
  it("packages Otter's hosted MCP server through the pinned stdio bridge", async () => {
    const manifest = await readJson<Record<string, any>>(
      path.join(stackRoot, "manifest.v2.json")
    );
    const legacyManifest = await readJson<Record<string, any>>(
      path.join(stackRoot, "manifest.json")
    );
    const index = await readJson<Record<string, any>>(path.join(process.cwd(), "index.json"));
    const wrapper = await fs.readFile(path.join(stackRoot, "src/index.js"), "utf8");

    expect(manifest).toMatchObject({
      id: "stack:otter-mcp",
      kind: "stack",
      runtime: "node",
      install: {
        source: "catalog",
        path: "catalog/stacks/otter-mcp",
      },
      requires: {
        binaries: [],
        secrets: [],
      },
      mcp: {
        transport: "stdio",
        command: "node",
        args: ["src/index.js"],
      },
    });
    expect(manifest.provides.tools).toEqual(expectedTools);

    expect(legacyManifest).toMatchObject({
      id: "otter-mcp",
      runtime: "node",
      command: ["node", "src/index.js"],
      requires: {
        binaries: [],
        secrets: [],
      },
    });
    expect(legacyManifest.provides.tools).toEqual(expectedTools);
    expect(wrapper).toContain(expectedBridgePackage);
    expect(wrapper).toContain(expectedRemoteUrl);
    expect(wrapper).toContain("process.execPath");

    const officialStacks = index.packages.stacks.official as Array<Record<string, any>>;
    expect(officialStacks).toContainEqual(
      expect.objectContaining({
        id: "stack:otter-mcp",
        path: "catalog/stacks/otter-mcp",
        runtime: "runtime:node",
        requires: {
          secrets: [],
        },
      })
    );
  });
});
