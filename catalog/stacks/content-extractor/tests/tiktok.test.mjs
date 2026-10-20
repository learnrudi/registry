import assert from "node:assert/strict";
import test from "node:test";
import { publicHttp } from "../src/public-http.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractTikTok, formatTikTokResult, extractBatch } from "../src/index.ts";

const VIDEO_URL = "https://www.tiktok.com/@fixture/video/7350000000000000000";
const CAPTION_URL = "https://v16m-webapp.tiktokcdn-us.com/video/resource/?mime_type=video_mp4";
const VTT = "WEBVTT\n\n00:00:00.140 --> 00:00:01.000\nHello there\n\n00:00:05.000 --> 00:00:06.000\nSecond cue\n";

function response(text, url = VIDEO_URL, status = 200) {
  const value = new Response(text, { status });
  Object.defineProperty(value, "url", { value: url });
  return value;
}

function page(item = {}) {
  return `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: item } } },
  })}</script>`;
}

test("incomplete initial TikTok metadata requests browser recovery without claiming no captions exist", async (t) => {
  t.mock.method(publicHttp, "fetch", async () => response(page()));
  const result = await extractTikTok(VIDEO_URL);
  assert.equal(result.hasTranscript, false);
  assert.equal(result.status, "captions_not_found");
  assert.equal(result.metadata.videoId, "7350000000000000000");
  assert.equal(result.metadata.user, "fixture");
  assert.match(formatTikTokResult(result), /not found in the initial page/i);
  assert.match(formatTikTokResult(result), /browser/i);
  assert.doesNotMatch(formatTikTokResult(result), /No captions available|Video Extracted/);
});

test("browser-discovered captions work without an extension or accessible page and preserve cue evidence", async (t) => {
  const calls = [];
  t.mock.method(publicHttp, "fetch", async (url) => {
    calls.push(String(url));
    assert.equal(String(url), CAPTION_URL);
    return response(VTT, CAPTION_URL);
  });
  const result = await extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL });
  assert.deepEqual(calls, [CAPTION_URL]);
  assert.equal(result.status, "success");
  assert.equal(result.retrievalMethod, "supplied_caption");
  assert.equal(result.rawVtt, VTT);
  assert.equal(result.transcript, "Hello there\nSecond cue");
  assert.equal(result.wordCount, 4);
  assert.deepEqual(result.segments, [
    { start: 0.14, end: 1, text: "Hello there" },
    { start: 5, end: 6, text: "Second cue" },
  ]);
  assert.deepEqual(result.coverage, {
    cueCount: 2, firstCueStart: 0.14, lastCueEnd: 6,
    gaps: [{ start: 1, end: 5, duration: 4 }],
  });
  assert.match(formatTikTokResult(result), /00:00:00.140/);
  assert.match(formatTikTokResult(result), /not independently verified/i);
  assert.match(formatTikTokResult(result), /not proof of missing speech/i);
  assert.doesNotMatch(JSON.stringify(result), /mime_type=video_mp4/);
});

test("TikTok rejects failed HTTP responses before interpreting page or caption data", async (t) => {
  t.mock.method(publicHttp, "fetch", async (url) => response(
    String(url) === CAPTION_URL ? VTT : page(), String(url), 403,
  ));
  await assert.rejects(extractTikTok(VIDEO_URL), /TikTok page HTTP 403/);
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /TikTok caption HTTP 403/);
});

test("caption fetches validate hosts and credentials, including redirects, before sending requests", async (t) => {
  const calls = [];
  t.mock.method(publicHttp, "fetch", async (url) => {
    calls.push(String(url));
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  });
  for (const captionUrl of ["http://127.0.0.1/private", "https://evil.test/file.vtt", "https://tiktokcdn-us.com.evil.test/file", "https://user:secret@v16.tiktokcdn.com/file", "https://v16.tiktokcdn.com:8443/file"]) {
    await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl }), /caption URL/);
  }
  assert.deepEqual(calls, []);
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /caption URL/);
  assert.deepEqual(calls, [CAPTION_URL]);
});

test("caption acquisition stops oversized streamed responses and uses a request deadline", async (t) => {
  let cancelled = false;
  t.mock.method(publicHttp, "fetch", async (_url, options) => {
    assert.ok(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0 && options.timeoutMs <= 15_000);
    assert.equal(options.maxBytes, 2 * 1024 * 1024);
    assert.equal(options.redirect, "manual");
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.enqueue(new Uint8Array(1)); },
      pull(controller) { controller.close(); },
      cancel() { cancelled = true; },
    }));
  });
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /caption exceeds/);
  assert.equal(cancelled, true);
});

test("page captions must belong to the requested video and have valid metadata", async (t) => {
  let item = { id: "7350000000000000001", video: { subtitleInfos: [] } };
  t.mock.method(publicHttp, "fetch", async () => response(page(item)));
  await assert.rejects(extractTikTok(VIDEO_URL), /video identity mismatch/);
  item = { id: "7350000000000000000", video: { subtitleInfos: "invalid" } };
  await assert.rejects(extractTikTok(VIDEO_URL), /subtitleInfos/);
  item = { id: "7350000000000000000", author: { uniqueId: 42 } };
  await assert.rejects(extractTikTok(VIDEO_URL), /author/);
});

test("batch artifacts retain TikTok caption evidence and status alongside formatted content", async (t) => {
  t.mock.method(publicHttp, "fetch", async (url) => response(String(url) === CAPTION_URL ? VTT : page({
    id: "7350000000000000000", video: { subtitleInfos: [{ Url: CAPTION_URL, LanguageCodeName: "eng-US" }] },
  }), String(url)));
  const directory = await mkdtemp(join(tmpdir(), "tiktok-batch-"));
  const result = await extractBatch({ urls: [VIDEO_URL], output_dir: directory });
  assert.equal(result.results[0].metadata.captionEvidence.rawVtt, VTT);
  assert.equal(result.results[0].metadata.captionEvidence.status, "success");
  const saved = JSON.parse(await readFile(result.results[0].resultPath, "utf8"));
  assert.equal(saved.metadata.captionEvidence.coverage.cueCount, 2);
});

test("WebVTT preserves numbered cues, settings, markup and elapsed hours without wrapping", async (t) => {
  const raw = "\uFEFFWEBVTT\r\n\r\nNOTE source captions\r\nignored\r\n\r\nfirst\r\n24:00:00.000 --> 24:00:10.000 align:start\r\n<v Speaker><b>Hello</b> &amp; welcome\r\n\r\n24:00:01.000 --> 24:00:02.000\r\nOverlap\r\n\r\n24:00:10.000 --> 24:00:11.000\r\nEnd\r\n";
  t.mock.method(publicHttp, "fetch", async () => response(raw, CAPTION_URL));
  const result = await extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL });
  assert.equal(result.rawVtt, raw);
  assert.equal(result.segments[0].text, "Hello & welcome");
  assert.deepEqual(result.coverage.gaps, []);
  assert.equal(result.coverage.lastCueEnd, 86411);
  assert.match(formatTikTokResult(result), /24:00:00\.000–24:00:11\.000/);
});

test("malformed, empty and unordered caption resources cannot become successful transcripts", async (t) => {
  let body = "";
  t.mock.method(publicHttp, "fetch", async () => response(body, CAPTION_URL));
  for (const invalid of ["<html>Login</html>", "WEBVTT\n\n", "WEBVTT\n\n00:02.000 --> 00:01.000\nWrong interval", "WEBVTT\n\n00:00.000 --> 00:01.000\n<b></b>", "WEBVTT\n\n00:05.000 --> 00:06.000\nLater\n\n00:01.000 --> 00:02.000\nEarlier"]) {
    body = invalid;
    await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /WebVTT/);
  }
});

test("request failures and redirect loops terminate without leaking caption URL credentials", async (t) => {
  let calls = 0;
  const fetchMock = t.mock.method(publicHttp, "fetch", async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: CAPTION_URL } });
  });
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), /redirect limit/);
  assert.equal(calls, 4);
  fetchMock.mock.mockImplementation(async () => { throw new Error("provider error with signed query"); });
  await assert.rejects(extractTikTok(VIDEO_URL, "eng", { captionUrl: CAPTION_URL }), { message: "TikTok caption request failed (network or timeout)" });
});
