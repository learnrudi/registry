import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { hostnameMatches, parseHttpUrl, requirePlatformUrl } from "./url-policy.js";
import { publicHttp } from "./public-http.js";

const TIKTOK_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  referer: "https://www.tiktok.com/",
};

type ResourceKind = "page" | "caption";
const CAPTION_DOMAINS = ["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com"];

function resourceUrl(raw: unknown, kind: ResourceKind): URL {
  let parsed: URL;
  try { parsed = parseHttpUrl(raw); } catch { throw new Error(`Invalid TikTok ${kind} URL`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      !hostnameMatches(parsed, kind === "page" ? ["tiktok.com"] : CAPTION_DOMAINS)) {
    throw new Error(`TikTok ${kind} URL must be HTTPS on an approved TikTok host without credentials or a custom port`);
  }
  return parsed;
}

async function readBounded(response: Response, kind: ResourceKind): Promise<string> {
  const limit = (kind === "caption" ? 2 : 5) * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error(`TikTok ${kind} exceeds ${limit} byte limit`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error(`TikTok ${kind} exceeds ${limit} byte limit`);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchText(raw: unknown, kind: ResourceKind): Promise<{ text: string; url: string }> {
  let target = resourceUrl(raw, kind);
  const deadline = performance.now() + 15_000;
  const maxBytes = (kind === "caption" ? 2 : 5) * 1024 * 1024;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const timeoutMs = Math.ceil(deadline - performance.now());
    if (timeoutMs <= 0) throw new Error(`TikTok ${kind} request failed (network or timeout)`);
    let response: Response;
    try {
      response = await publicHttp.fetch(target.toString(), {
        headers: TIKTOK_HEADERS, redirect: "manual",
        maxBytes, timeoutMs,
      });
    } catch (error) {
      if (error instanceof Error && error.message === `Response exceeds ${maxBytes} bytes`) {
        throw new Error(`TikTok ${kind} exceeds ${maxBytes} byte limit`);
      }
      throw new Error(`TikTok ${kind} request failed (network or timeout)`);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error(`TikTok ${kind} redirect limit or missing location`);
      target = resourceUrl(new URL(location, target).toString(), kind);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`TikTok ${kind} HTTP ${response.status}`);
    }
    return { text: await readBounded(response, kind), url: resourceUrl(response.url || target.toString(), kind).toString() };
  }
  throw new Error(`TikTok ${kind} redirect limit`);
}

export interface CaptionSegment { start: number; end: number; text: string }
export interface CaptionCoverage {
  cueCount: number;
  firstCueStart: number | null;
  lastCueEnd: number | null;
  gaps: Array<{ start: number; end: number; duration: number }>;
}
export interface TikTokResult {
  status: "success" | "captions_not_found";
  url: string;
  hasTranscript: boolean;
  transcript: string;
  wordCount: number;
  retrievalMethod: "page" | "supplied_caption";
  rawVtt: string | null;
  segments: CaptionSegment[];
  coverage: CaptionCoverage;
  metadata: { user: string; videoId: string; description: string; language?: string };
}
export interface TikTokOptions { captionUrl?: string }

function seconds(timestamp: string): number {
  return timestamp.split(":").reduce((value, part) => value * 60 + Number(part), 0);
}

function parseCaptions(raw: string): CaptionSegment[] {
  const blocks = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim().split(/\n[\t ]*\n/);
  if (!/^WEBVTT(?:[\t ]|\n|$)/.test(blocks[0] ?? "")) throw new Error("TikTok caption response is not WebVTT");
  const segments: CaptionSegment[] = [];
  const stamp = "(?:\\d{2,}:)?[0-5]\\d:[0-5]\\d\\.\\d{3}";
  const timing = new RegExp(`^(${stamp})[\\t ]+-->[\\t ]+(${stamp})(?:[\\t ].*)?$`);
  for (const block of blocks.slice(1)) {
    if (/^(NOTE(?:[\t \n]|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block)) continue;
    const lines = block.split("\n");
    const timeIndex = lines[0].includes("-->") ? 0 : 1;
    const match = lines[timeIndex]?.match(timing);
    if (!match) throw new Error("Malformed TikTok WebVTT cue timing");
    const start = seconds(match[1]);
    const end = seconds(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < (segments.at(-1)?.start ?? 0)) {
      throw new Error("Invalid or unordered TikTok WebVTT cue interval");
    }
    const text = decode(lines.slice(timeIndex + 1).join("\n").replace(/<[^>]*>/g, "")).trim();
    if (!text) throw new Error("Empty TikTok WebVTT cue");
    segments.push({ start, end, text });
  }
  if (!segments.length) throw new Error("TikTok WebVTT contains no caption cues");
  return segments;
}

function coverage(segments: CaptionSegment[]): CaptionCoverage {
  const gaps: CaptionCoverage["gaps"] = [];
  let coveredUntil = segments[0]?.end ?? 0;
  for (const cue of segments.slice(1)) {
    if (cue.start - coveredUntil > 3) gaps.push({ start: coveredUntil, end: cue.start, duration: Number((cue.start - coveredUntil).toFixed(3)) });
    coveredUntil = Math.max(coveredUntil, cue.end);
  }
  return { cueCount: segments.length, firstCueStart: segments[0]?.start ?? null, lastCueEnd: segments.length ? coveredUntil : null, gaps };
}

function captionResult(base: TikTokResult, rawVtt: string): TikTokResult {
  const segments = parseCaptions(rawVtt);
  const transcript = segments.map((cue) => cue.text).join("\n");
  return { ...base, status: "success", hasTranscript: true, transcript, wordCount: transcript.split(/\s+/).length, rawVtt, segments, coverage: coverage(segments) };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Malformed TikTok ${field}`);
  return value;
}

function pageItem(html: string): Record<string, unknown> {
  const script = cheerio.load(html)("#__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (!script.length) throw new Error("Could not find TikTok page data; inspect the video in the browser");
  let parsed: unknown;
  try { parsed = JSON.parse(script.text()); } catch { throw new Error("Malformed TikTok page JSON"); }
  const scope = record(record(parsed)?.__DEFAULT_SCOPE__);
  const detail = record(scope?.["webapp.video-detail"]);
  const item = record(record(detail?.itemInfo)?.itemStruct);
  if (!item) throw new Error("Could not parse TikTok video data; inspect the video in the browser");
  return item;
}

function videoIdentity(url: string): RegExpMatchArray | null {
  return new URL(url).pathname.match(/^\/@([^/]+)\/video\/(\d+)\/?$/);
}

function captionTracks(item: Record<string, unknown>): Array<{ url: string; language?: string }> {
  if (item.video !== undefined && !record(item.video)) throw new Error("Malformed TikTok video metadata");
  const subtitles = record(item.video)?.subtitleInfos ?? [];
  if (!Array.isArray(subtitles)) throw new Error("Malformed TikTok subtitleInfos");
  return subtitles.map((entry) => {
    const track = record(entry);
    if (!track || typeof track.Url !== "string") throw new Error("Malformed TikTok caption track");
    return { url: track.Url, language: optionalText(track.LanguageCodeName, "caption language") };
  });
}

export async function extractTikTok(url: string, preferLang = "eng", options: TikTokOptions = {}): Promise<TikTokResult> {
  const tiktokUrl = resourceUrl(requirePlatformUrl(url, "TikTok", ["tiktok.com"]), "page").toString();
  if (typeof preferLang !== "string" || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(preferLang)) throw new Error("Invalid TikTok preferred language");
  if (options.captionUrl !== undefined && (typeof options.captionUrl !== "string" || !options.captionUrl.trim())) throw new Error("Invalid TikTok caption URL");
  const identity = videoIdentity(tiktokUrl);
  const base: TikTokResult = {
    status: "captions_not_found", url: tiktokUrl, hasTranscript: false, transcript: "", wordCount: 0,
    retrievalMethod: options.captionUrl ? "supplied_caption" : "page", rawVtt: null, segments: [], coverage: coverage([]),
    metadata: { user: identity?.[1] ?? "unknown", videoId: identity?.[2] ?? "", description: "" },
  };
  if (options.captionUrl) {
    if (!identity) throw new Error("caption_url requires the canonical TikTok /@creator/video/id URL observed in the browser");
    const response = await fetchText(options.captionUrl, "caption");
    return captionResult(base, response.text);
  }
  const response = await fetchText(tiktokUrl, "page");
  base.url = response.url;
  const resolvedIdentity = videoIdentity(base.url);
  const item = pageItem(response.text);
  const itemId = optionalText(item.id, "video id");
  const expectedId = identity?.[2] ?? resolvedIdentity?.[2];
  if ((itemId && !/^\d+$/.test(itemId)) || (itemId && expectedId && itemId !== expectedId) ||
      (identity && resolvedIdentity && identity[2] !== resolvedIdentity[2])) throw new Error("TikTok video identity mismatch");
  if (item.author !== undefined && !record(item.author)) throw new Error("Malformed TikTok author");
  base.metadata = {
    user: optionalText(record(item.author)?.uniqueId, "author") || resolvedIdentity?.[1] || base.metadata.user,
    videoId: itemId || resolvedIdentity?.[2] || base.metadata.videoId,
    description: optionalText(item.desc, "description") || "",
  };
  const tracks = captionTracks(item);
  if (!tracks.length) return base;
  if (!base.metadata.videoId) throw new Error("Could not establish TikTok video identity");
  const preferred = preferLang.toLowerCase().replace(/^eng(?=-|$)/, "en");
  const track = tracks.find((entry) => entry.language?.toLowerCase().replace(/^eng(?=-|$)/, "en").startsWith(preferred)) || tracks[0];
  base.metadata.language = track.language;
  const caption = await fetchText(track.url, "caption");
  return captionResult(base, caption.text);
}

function timestamp(value: number): string {
  const millis = Math.round(value * 1000);
  return `${String(Math.floor(millis / 3_600_000)).padStart(2, "0")}:${String(Math.floor(millis / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(millis / 1000) % 60).padStart(2, "0")}.${String(millis % 1000).padStart(3, "0")}`;
}

export function formatTikTokResult(result: TikTokResult): string {
  let text = `**TikTok caption extraction: ${result.status}**\n\n**Creator:** @${result.metadata.user}\n**URL:** ${result.url}\n`;
  if (result.metadata.description) text += `**Description:** ${result.metadata.description}\n`;
  if (!result.hasTranscript) return text + "\nCaptions were not found in the initial page. This does not establish that captions are absent. Inspect the video in the browser for a caption resource.\n";
  text += `\n**Method:** ${result.retrievalMethod}. Caption wording has not been verified against audio; speakers are not assigned.\n`;
  if (result.retrievalMethod === "supplied_caption") text += "The supplied caption resource's association with this video is operator-provided, not independently verified by the stack.\n";
  text += `\n**Coverage:** ${result.coverage.cueCount} cues, ${timestamp(result.coverage.firstCueStart!)}–${timestamp(result.coverage.lastCueEnd!)}. Track endpoint does not establish full-video coverage.\n`;
  if (result.coverage.gaps.length) {
    text += "\n**Uncaptioned intervals over 3 seconds** (not proof of missing speech):\n";
    for (const gap of result.coverage.gaps) text += `- ${timestamp(gap.start)}–${timestamp(gap.end)} (${gap.duration}s)\n`;
  }
  text += `\n## Caption transcript (${result.wordCount} words)\n\n`;
  return text + result.segments.map((cue) => `**${timestamp(cue.start)}–${timestamp(cue.end)}**\n\n${cue.text}`).join("\n\n") + "\n";
}
