import fs from "node:fs/promises";
import { expect, it } from "vitest";

it("keeps the portable document isolation contract identical in both packages", async () => {
  const contexts = await Promise.all(
    ["web-export", "document-qa"].map(stack =>
      fs.readFile(`catalog/stacks/${stack}/src/document-context.ts`, "utf8"),
    ),
  );
  expect(contexts[0]).toBe(contexts[1]);
});
