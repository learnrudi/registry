import assert from "node:assert/strict";
import test from "node:test";
import { repositoryHead } from "../src/git-head.js";

test("HEAD timeouts cannot become an unborn observation", async () => {
  let calls = 0;
  const timeout = new Error("Read HEAD timed out", { cause: { code: "ETIMEDOUT" } });
  await assert.rejects(() => repositoryHead({ id: "fixture", path: "/fixture" }, async () => {
    calls += 1;
    throw timeout;
  }), (error) => error === timeout);
  assert.equal(calls, 1);
});
