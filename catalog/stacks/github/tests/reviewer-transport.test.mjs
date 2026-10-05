import assert from "node:assert/strict";
import test from "node:test";
import { createReviewerFetch } from "../dist/reviewer-transport.js";

test("reviewer transport forbids redirects and bounds a stalled body, not just response headers", async () => {
  let options;
  const fetchImpl = async (_url, init) => {
    options = init;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } }));
  };
  const request = createReviewerFetch(fetchImpl, 20);
  const response = request("https://api.github.com/repos/example/project", {});
  assert.equal(options.redirect, "error");
  await assert.rejects(response, /Reviewer transport failed/);
});

test("foreign origins, oversized responses and explicit redirects are rejected", async () => {
  let calls = 0;
  const request = createReviewerFetch(async () => { calls += 1; return new Response("x".repeat(262145)); });
  await assert.rejects(request("https://example.com/"), /Invalid reviewer API origin/);
  assert.equal(calls, 0);
  await assert.rejects(request("https://api.github.com/"), /Reviewer transport failed/);
  const redirect = createReviewerFetch(async () => new Response(null, { status: 302 }));
  await assert.rejects(redirect("https://api.github.com/"), /Reviewer transport failed/);
});
