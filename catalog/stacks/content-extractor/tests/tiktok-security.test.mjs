import assert from "node:assert/strict";
import test from "node:test";
import { publicHttp, createPublicFetcher } from "../src/public-http.js";
import { extractTikTok } from "../src/tiktok.ts";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const VIDEO_URL = "https://www.tiktok.com/@fixture/video/7350000000000000000";
const CAPTION_URL = "https://v16.tiktokcdn.com/captions";
const VTT = "WEBVTT\n\n00:00.000 --> 00:01.000\nFixture caption\n";

test("TikTok caption recovery rejects private DNS without a transport connection", async (t) => {
  let rawFetchCalls = 0;
  let transportCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    rawFetchCalls++;
    return new Response(VTT);
  });
  t.mock.method(publicHttp, "fetch", createPublicFetcher({
    resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    request: () => { transportCalls++; throw new Error("Must not connect"); },
  }));
  await assert.rejects(
    extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }),
    /network or timeout/,
  );
  assert.equal(transportCalls, 0);
  assert.equal(rawFetchCalls, 0, "TikTok must not bypass the public transport");
});

test("TikTok redirect hops share one acquisition deadline", async (t) => {
  let clock = 0;
  const budgets = [];
  t.mock.method(performance, "now", () => clock);
  t.mock.method(publicHttp, "fetch", async (_url, options) => {
    budgets.push(options.timeoutMs);
    clock += budgets.length === 1 ? 10_000 : 1_000;
    return budgets.length === 1
      ? new Response(null, { status: 302, headers: { location: "/final" } })
      : new Response(VTT);
  });
  const result = await extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL });
  assert.equal(result.status, "success");
  assert.deepEqual(budgets, [15_000, 5_000]);
});

function protectedFixture(t, replies, addresses = [{ address: "93.184.216.34", family: 4 }]) {
  const calls = [];
  const lookups = [];
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unprotected fetch"); });
  t.mock.method(publicHttp, "fetch", createPublicFetcher({
    resolve: async hostname => {
      lookups.push(hostname);
      return typeof addresses === "function" ? addresses(hostname) : addresses;
    },
    request: (url, options, callback) => {
      const request = new EventEmitter();
      request.end = () => {
        calls.push(url.toString());
        options.lookup(url.hostname, {}, (error, address) => {
          assert.ifError(error);
          assert.equal(address, "93.184.216.34");
        });
        assert.equal(options.headers["Accept-Encoding"], "identity");
        const reply = replies.shift();
        assert.ok(reply, "No unexpected request");
        const response = Readable.from(reply.chunks ?? [Buffer.from(VTT)]);
        Object.assign(response, { statusCode: reply.status ?? 200, headers: reply.headers ?? {} });
        queueMicrotask(() => callback(response));
      };
      return request;
    },
  }));
  return { calls, lookups };
}

test("protected TikTok transport preserves caption evidence through an approved redirect", async (t) => {
  const { calls, lookups } = protectedFixture(t, [
    { status: 302, headers: { location: "https://v17.tiktokcdn.com/final" } }, {},
  ]);
  const result = await extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL });
  assert.equal(result.rawVtt, VTT);
  assert.equal(result.segments[0].text, "Fixture caption");
  assert.equal(result.retrievalMethod, "supplied_caption");
  assert.deepEqual(calls, [CAPTION_URL, "https://v17.tiktokcdn.com/final"]);
  assert.deepEqual(lookups, ["v16.tiktokcdn.com", "v17.tiktokcdn.com"]);
});

test("TikTok rejects public off-domain redirects before resolving their hostname", async (t) => {
  const { calls, lookups } = protectedFixture(t, [
    { status: 302, headers: { location: "https://outside.example/caption" } },
  ]);
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /caption URL/);
  assert.deepEqual(calls, [CAPTION_URL]);
  assert.deepEqual(lookups, ["v16.tiktokcdn.com"]);
});

test("approved TikTok redirect hosts still reject mixed private DNS answers", async (t) => {
  const { calls, lookups } = protectedFixture(t, [
    { status: 302, headers: { location: "https://v17.tiktokcdn.com/final" } },
  ], hostname => hostname === "v16.tiktokcdn.com"
    ? [{ address: "93.184.216.34", family: 4 }]
    : [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /network or timeout/);
  assert.deepEqual(calls, [CAPTION_URL]);
  assert.equal(lookups.length, 2);
});

test("caption byte and encoding limits are enforced by the real protected transport", async (t) => {
  for (const reply of [
    { chunks: [Buffer.alloc(2 * 1024 * 1024 + 1)], headers: { "content-length": "1" }, expected: /caption exceeds/ },
    { headers: { "content-encoding": "gzip" }, expected: /network or timeout/ },
  ]) {
    const { calls } = protectedFixture(t, [reply]);
    await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), reply.expected);
    assert.equal(calls.length, 1);
  }
});

test("expired TikTok acquisition does not issue another redirect request", async (t) => {
  let clock = 0;
  let calls = 0;
  t.mock.method(performance, "now", () => clock);
  t.mock.method(publicHttp, "fetch", async () => {
    calls++;
    clock = 15_001;
    return new Response(null, { status: 302, headers: { location: "/again" } });
  });
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /network or timeout/);
  assert.equal(calls, 1);
});
