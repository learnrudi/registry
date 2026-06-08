import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import test from "node:test";

interface JsonRpcResponse {
  id?: number;
  result?: any;
  error?: { message?: string };
}

function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr: string[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`MCP fixture call timed out: ${stderr.join("\n")}`));
    }, 10_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const response = JSON.parse(line) as JsonRpcResponse;
      if (response.id !== 2) return;
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve(response);
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "creator-intelligence-test", version: "0" },
      },
    })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    })}\n`);
  });
}

test("MCP boundary returns full-audit inventory for a fixture root", async () => {
  const root = join(homedir(), ".rudi", "tmp", `creator-mcp-boundary-${Date.now()}`);
  mkdirSync(join(root, "tiktok", "extracted-videos"), { recursive: true });
  writeFileSync(join(root, "tiktok", "extracted-videos", "tiktok-1.json"), "{}\n");

  try {
    const response = await callMcpTool("creator_full_audit_inventory", { audit_root: root });

    assert.equal(response.error, undefined);
    const text = response.result.content[0].text;
    const inventory = JSON.parse(text);
    assert.equal(inventory.exists, true);
    assert.equal(inventory.counts.tiktok_extract_json, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
