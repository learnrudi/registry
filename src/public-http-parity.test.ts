import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const fixtureRoots: string[] = [];
const parityTest = path.resolve("catalog/stacks/content-extractor/tests/public-http-parity.test.mjs");
const transportPaths = [
  "content-extractor/src/public-http.js",
  "audio-tools/src/public-http.js",
  "newsletter-extractor/src/public-http.js",
  "social-media-publisher/src/security/public-http.js",
];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runParity(copies: Record<string, string>, catalog = false) {
  const root = mkdtempSync(path.join(tmpdir(), "registry-parity-"));
  fixtureRoots.push(root);
  const stacks = path.join(root, ...(catalog ? ["catalog", "stacks"] : ["stacks"]));
  const testPath = path.join(stacks, "content-extractor/tests/public-http-parity.test.mjs");
  mkdirSync(path.dirname(testPath), { recursive: true });
  copyFileSync(parityTest, testPath);
  for (const [relativePath, content] of Object.entries(copies)) {
    const destination = path.join(stacks, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", testPath], {
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
}

it("checks matching transports in a partial installation without requiring absent stacks", () => {
  const result = runParity({
    [transportPaths[0]]: "same transport",
    [transportPaths[1]]: "same transport",
    [transportPaths[3]]: "same transport",
  });
  expect(result.status, result.output).toBe(0);
  expect(result.output).toContain("# pass 1");
  expect(result.output).toContain("# skipped 0");
});

it("requires every transport in the canonical Registry catalog", () => {
  const result = runParity({
    [transportPaths[0]]: "same transport",
    [transportPaths[1]]: "same transport",
    [transportPaths[3]]: "same transport",
  }, true);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain("Every Registry transport stack must exist");
});

it("rejects a mismatched transport among installed stacks", () => {
  const result = runParity({
    [transportPaths[0]]: "same transport",
    [transportPaths[3]]: "different transport",
  });
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain(transportPaths[3]);
});

it("rejects an installed sibling whose transport file is missing", () => {
  const result = runParity({
    [transportPaths[0]]: "same transport",
    "audio-tools/manifest.json": "{}",
  });
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain("ENOENT");
  expect(result.output).toContain("public-http.js");
});

it("skips parity for a standalone stack with its own transport intact", () => {
  const result = runParity({ [transportPaths[0]]: "same transport" });
  expect(result.status, result.output).toBe(0);
  expect(result.output).toContain("# skipped 1");
});

it("rejects a missing transport even in a standalone stack", () => {
  const result = runParity({});
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain("ENOENT");
  expect(result.output).toContain("# skipped 0");
});

it("checks every transport in a complete Registry catalog", () => {
  const result = runParity(Object.fromEntries(transportPaths.map(file => [file, "same transport"])), true);
  expect(result.status, result.output).toBe(0);
  expect(result.output).toContain("# pass 1");
  expect(result.output).toContain("# skipped 0");
});
