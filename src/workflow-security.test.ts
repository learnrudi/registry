import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("workflow supply chain", () => {
  it("keeps registry builds read-only and prevents persisted checkout credentials", async () => {
    const source = await fs.readFile(".github/workflows/registry.yml", "utf8");
    expect(source).not.toMatch(/contents:\s*write/);
    const checkouts = [...source.matchAll(/uses: actions\/checkout@[^\n]+\n([\s\S]*?)(?=\n      - name:)/g)];
    expect(checkouts).toHaveLength(3);
    for (const checkout of checkouts) expect(checkout[1]).toMatch(/persist-credentials:\s*false/);
  });

  it("pins every external action to immutable reviewed bytes", async () => {
    const files = await fs.readdir(".github/workflows");
    for (const file of files.filter(file => /\.ya?ml$/.test(file))) {
      const source = await fs.readFile(`.github/workflows/${file}`, "utf8");
      for (const match of source.matchAll(/^\s+uses:\s+(\S+)/gm)) {
        expect(match[1], file).toMatch(/^[A-Za-z0-9_.\/-]+@[a-f0-9]{40}$/);
      }
    }
  });
});
