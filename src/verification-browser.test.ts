import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { buildVerificationSandbox } from "./verification-sandbox.js";
import { buildVerificationEnvironment } from "./stack-verification.js";

// Opt-in native smoke: supply one installed Playwright headless-shell cache
// directory. The fixture copies only browser distribution files to its session.
const cache = process.env.RUDI_VERIFY_BROWSER_CACHE;
it.runIf(Boolean(cache))("renders real Chromium content inside the verification sandbox", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "registry-browser-smoke-"));
  const root = process.cwd();
  const cwd = path.join(root, "catalog/stacks/web-export");
  try {
    const browsers = path.join(home, "browsers");
    await fs.cp(cache!, path.join(browsers, path.basename(path.resolve(cache!))), { recursive: true });
    const script = path.join(home, "browser.mjs");
    await fs.writeFile(script, [
      `import { chromium } from ${JSON.stringify(pathToFileURL(path.join(cwd, "node_modules/playwright/index.mjs")).href)};`,
      "const browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 10000 });",
      "try { const page = await browser.newPage(); await page.setContent('<h1>Sandbox smoke</h1>');",
      "const png = await page.screenshot(); if (png.length < 100) throw new Error('empty screenshot');",
      "console.log('browser rendered'); } finally { await browser.close(); }",
    ].join("\n"));
    const sandbox = await buildVerificationSandbox({ root, cwd, home, runtime: "node", executable: process.execPath, args: [script], network: false });
    const { stdout } = await promisify(execFile)(sandbox.executable, sandbox.args, {
      cwd,
      env: { ...buildVerificationEnvironment(process.env, home), PATH: sandbox.path,
        TMPDIR: home, TMP: home, TEMP: home, PLAYWRIGHT_BROWSERS_PATH: browsers, DEBUG: "pw:browser" },
      timeout: 20000,
    });
    expect(stdout).toContain("browser rendered");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}, 30000);
