import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedTools = [
  "site_planner_config_status",
  "site_planner_inspect_concept",
  "site_planner_generate_lot_plan",
  "site_planner_optimize_lot_plan",
  "site_planner_preview_concept_commands",
  "site_planner_fork_concept",
  "site_planner_apply_concept_commands",
];

test("catalog requires the fixed adapter tools and write authorization secret", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.id, "stack:site-planner");
  assert.equal(manifest.kind, "stack");
  assert.equal(manifest.runtime, "node");
  assert.deepEqual(manifest.install, {
    source: "catalog",
    path: "catalog/stacks/site-planner",
  });
  assert.deepEqual(manifest.provides.tools, expectedTools);
  assert.deepEqual(manifest.requires.binaries, []);
  assert.equal(manifest.requires.secrets.length, 1);
  assert.equal(manifest.requires.secrets[0].key, "SITE_PLANNER_WRITE_HMAC_V1");
  assert.equal(manifest.requires.secrets[0].required, true);
  assert.deepEqual(manifest.mcp, {
    transport: "stdio",
    command: "node",
    args: ["src/index.js"],
    cwd: ".",
  });
  assert.equal(packageJson.engines.node, ">=20.10");
});

test("MCP server exposes only the registered Site Planner tools", async () => {
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  const responses = new Map();

  lines.on("line", (line) => {
    const value = JSON.parse(line);
    if (Number.isInteger(value.id)) {
      responses.set(value.id, value);
    }
  });

  try {
    child.stdin.write(`${JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
        protocolVersion: "2024-11-05",
      },
    })}\n`);
    await waitForResponse(responses, 1);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })}\n`);
    child.stdin.write(`${JSON.stringify({
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    })}\n`);
    const response = await waitForResponse(responses, 2);
    assert.deepEqual(
      response.result.tools.map((tool) => tool.name),
      expectedTools,
    );
  } finally {
    child.stdin.end();
    child.kill("SIGTERM");
  }
});

async function waitForResponse(responses, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = responses.get(id);
    if (response) return response;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for MCP response ${id}`);
}
