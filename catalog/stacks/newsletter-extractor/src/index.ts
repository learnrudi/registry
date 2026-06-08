#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { XMLParser } from "fast-xml-parser";

const DEFAULT_MAX_LINKS = 100;
const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_TEXT_CHARS = 12000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_cid",
  "utm_reader",
  "utm_viz_id",
  "utm_pubreferrer",
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "igshid",
  "vero_id",
  "_hsenc",
  "_hsmi",
]);

const REDIRECT_PARAM_NAMES = [
  "url",
  "u",
  "target",
  "redirect",
  "redirect_url",
  "destination",
  "to",
  "q",
];

type ToolArgs = Record<string, unknown> | undefined;

type LinkRecord = {
  url: string;
  originalUrl: string;
  text: string;
  domain: string;
  source: "html" | "text";
  trackingRemoved: boolean;
};

type FeedItem = {
  title: string;
  url: string;
  publishedAt: string;
  author: string;
  summary: string;
  id: string;
};

const tools = [
  {
    name: "extract_newsletter_email",
    description: "Normalize a newsletter email body into title, clean text, extracted links, and metadata. Pass HTML/text from Gmail or another mail stack.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Email subject" },
        sender: { type: "string", description: "Email sender/from header" },
        sent_at: { type: "string", description: "Email sent timestamp" },
        html: { type: "string", description: "Email HTML body" },
        text: { type: "string", description: "Email plain-text body" },
        base_url: { type: "string", description: "Optional base URL for resolving relative links" },
        max_links: { type: "number", description: "Maximum links to return, default 100" },
        max_text_chars: { type: "number", description: "Maximum clean text characters to return, default 12000" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "extract_newsletter_links",
    description: "Extract and normalize links from newsletter HTML and/or plain text.",
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", description: "Newsletter HTML" },
        text: { type: "string", description: "Newsletter plain text" },
        base_url: { type: "string", description: "Optional base URL for resolving relative links" },
        max_links: { type: "number", description: "Maximum links to return, default 100" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "extract_rss_feed",
    description: "Fetch and normalize items from an RSS or Atom feed URL.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "RSS or Atom feed URL" },
        max_items: { type: "number", description: "Maximum items to return, default 50" },
        timeout_ms: { type: "number", description: "Fetch timeout in milliseconds, default 15000" },
      },
      additionalProperties: false,
    },
  },
];

function asRecord(args: unknown): ToolArgs {
  return args && typeof args === "object" && !Array.isArray(args)
    ? args as Record<string, unknown>
    : undefined;
}

function optionalString(args: ToolArgs, name: string): string {
  const value = args?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function requireString(args: ToolArgs, name: string): string {
  const value = optionalString(args, name);
  if (!value) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optionalBoundedInteger(args: ToolArgs, name: string, fallback: number, min: number, max: number): number {
  const value = args?.[name];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseHttpUrl(rawUrl: string, fieldName = "url"): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must use http or https`);
  }

  return parsed;
}

function cleanWhitespace(value: string): string {
  return decode(value).replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  if (!html.trim()) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  return cleanWhitespace($.root().text());
}

function resolveUrl(rawHref: string, baseUrl: string): URL | null {
  const href = rawHref.trim();
  if (!href || href.startsWith("#") || href.toLowerCase().startsWith("mailto:") || href.toLowerCase().startsWith("tel:")) {
    return null;
  }

  try {
    const resolved = baseUrl ? new URL(href, baseUrl) : new URL(href);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved;
  } catch {
    return null;
  }
}

function findRedirectTarget(url: URL): URL | null {
  for (const paramName of REDIRECT_PARAM_NAMES) {
    const candidate = url.searchParams.get(paramName);
    if (!candidate) continue;
    try {
      const decodedCandidate = decodeURIComponent(candidate);
      const parsed = new URL(decodedCandidate);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeNewsletterUrl(url: URL): { url: string; trackingRemoved: boolean } {
  const redirectTarget = findRedirectTarget(url);
  const working = redirectTarget ?? new URL(url.toString());

  let trackingRemoved = Boolean(redirectTarget);
  for (const key of Array.from(working.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      working.searchParams.delete(key);
      trackingRemoved = true;
    }
  }

  working.hash = "";
  return {
    url: working.toString(),
    trackingRemoved,
  };
}

function pushUniqueLink(links: LinkRecord[], seen: Set<string>, record: LinkRecord, maxLinks: number): void {
  if (links.length >= maxLinks || seen.has(record.url)) return;
  seen.add(record.url);
  links.push(record);
}

function extractHtmlLinks(html: string, baseUrl: string, maxLinks: number): LinkRecord[] {
  if (!html.trim()) return [];
  const $ = cheerio.load(html);
  const links: LinkRecord[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const resolved = resolveUrl(String($(element).attr("href") ?? ""), baseUrl);
    if (!resolved) return;

    const normalized = normalizeNewsletterUrl(resolved);
    const parsed = parseHttpUrl(normalized.url);
    pushUniqueLink(links, seen, {
      url: normalized.url,
      originalUrl: resolved.toString(),
      text: cleanWhitespace($(element).text()),
      domain: parsed.hostname.replace(/^www\./, ""),
      source: "html",
      trackingRemoved: normalized.trackingRemoved || normalized.url !== resolved.toString(),
    }, maxLinks);
  });

  return links;
}

function extractTextLinks(text: string, maxLinks: number): LinkRecord[] {
  if (!text.trim()) return [];
  const links: LinkRecord[] = [];
  const seen = new Set<string>();
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const rawUrl = match[0].replace(/[.,;:!?]+$/, "");
    const resolved = resolveUrl(rawUrl, "");
    if (!resolved) continue;

    const normalized = normalizeNewsletterUrl(resolved);
    const parsed = parseHttpUrl(normalized.url);
    pushUniqueLink(links, seen, {
      url: normalized.url,
      originalUrl: resolved.toString(),
      text: "",
      domain: parsed.hostname.replace(/^www\./, ""),
      source: "text",
      trackingRemoved: normalized.trackingRemoved || normalized.url !== resolved.toString(),
    }, maxLinks);
  }

  return links;
}

function extractLinksFromContent(html: string, text: string, baseUrl: string, maxLinks: number): LinkRecord[] {
  const links: LinkRecord[] = [];
  const seen = new Set<string>();

  for (const link of extractHtmlLinks(html, baseUrl, maxLinks)) {
    pushUniqueLink(links, seen, link, maxLinks);
  }
  for (const link of extractTextLinks(text, maxLinks)) {
    pushUniqueLink(links, seen, link, maxLinks);
  }

  return links;
}

function domainCounts(links: LinkRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const link of links) counts[link.domain] = (counts[link.domain] ?? 0) + 1;
  return counts;
}

function bestNewsletterTitle(subject: string, html: string, text: string): string {
  if (subject) return subject;
  if (html.trim()) {
    const $ = cheerio.load(html);
    const heading = cleanWhitespace($("h1").first().text() || $("title").first().text());
    if (heading) return heading;
  }
  return cleanWhitespace(text).slice(0, 120);
}

function extractNewsletterEmail(args: ToolArgs) {
  const subject = optionalString(args, "subject");
  const sender = optionalString(args, "sender");
  const sentAt = optionalString(args, "sent_at");
  const html = optionalString(args, "html");
  const plainText = optionalString(args, "text");
  const baseUrl = optionalString(args, "base_url");
  const maxLinks = optionalBoundedInteger(args, "max_links", DEFAULT_MAX_LINKS, 1, 500);
  const maxTextChars = optionalBoundedInteger(args, "max_text_chars", DEFAULT_MAX_TEXT_CHARS, 100, 100000);

  if (!html && !plainText) throw new Error("html or text is required");
  if (baseUrl) parseHttpUrl(baseUrl, "base_url");

  const cleanText = html ? htmlToText(html) : cleanWhitespace(plainText);
  const links = extractLinksFromContent(html, plainText, baseUrl, maxLinks);

  return {
    sourceType: "newsletter_email",
    title: bestNewsletterTitle(subject, html, plainText),
    subject,
    sender,
    sentAt,
    text: cleanText.slice(0, maxTextChars),
    textLength: cleanText.length,
    truncated: cleanText.length > maxTextChars,
    links,
    linkCount: links.length,
    domains: domainCounts(links),
    metadata: {
      hasHtml: Boolean(html),
      hasText: Boolean(plainText),
      baseUrl,
    },
  };
}

function extractNewsletterLinks(args: ToolArgs) {
  const html = optionalString(args, "html");
  const text = optionalString(args, "text");
  const baseUrl = optionalString(args, "base_url");
  const maxLinks = optionalBoundedInteger(args, "max_links", DEFAULT_MAX_LINKS, 1, 500);

  if (!html && !text) throw new Error("html or text is required");
  if (baseUrl) parseHttpUrl(baseUrl, "base_url");

  const links = extractLinksFromContent(html, text, baseUrl, maxLinks);
  return {
    sourceType: "newsletter_links",
    links,
    linkCount: links.length,
    domains: domainCounts(links),
  };
}

async function fetchFeed(url: string, timeoutMs: number): Promise<string> {
  const parsed = parseHttpUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "RUDI newsletter-extractor/0.1.0",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Feed fetch failed with HTTP ${response.status}`);

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > MAX_FEED_BYTES) throw new Error(`Feed exceeds ${MAX_FEED_BYTES} bytes`);

    const xml = await response.text();
    if (xml.length > MAX_FEED_BYTES) throw new Error(`Feed exceeds ${MAX_FEED_BYTES} bytes`);
    return xml;
  } finally {
    clearTimeout(timeout);
  }
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return cleanWhitespace(value);
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const nested = firstString(record["#text"], record["#cdata"]);
      if (nested) return nested;
    }
  }
  return "";
}

function atomLink(entry: Record<string, unknown>): string {
  for (const link of asArray(entry.link as Record<string, unknown> | Record<string, unknown>[])) {
    if (typeof link === "string") return link;
    const href = firstString(link["@_href"], link["@href"], link.href);
    const rel = firstString(link["@_rel"], link["@rel"], link.rel);
    if (href && (!rel || rel === "alternate")) return href;
  }
  return "";
}

function normalizeFeedSummary(value: string): string {
  if (!value) return "";
  return htmlToText(value).slice(0, 2000);
}

function parseRssItems(parsed: Record<string, unknown>, maxItems: number): { feedTitle: string; items: FeedItem[] } {
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  if (!channel) return { feedTitle: "", items: [] };

  const items = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[])
    .slice(0, maxItems)
    .map((item) => {
      const url = firstString(item.link, item.guid);
      return {
        title: firstString(item.title),
        url,
        publishedAt: firstString(item.pubDate, item.published, item.updated),
        author: firstString(item.author, item.creator, item["dc:creator"]),
        summary: normalizeFeedSummary(firstString(item.description, item.summary, item["content:encoded"])),
        id: firstString(item.guid, url),
      };
    });

  return {
    feedTitle: firstString(channel.title),
    items,
  };
}

function parseAtomItems(parsed: Record<string, unknown>, maxItems: number): { feedTitle: string; items: FeedItem[] } {
  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (!feed) return { feedTitle: "", items: [] };

  const items = asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[])
    .slice(0, maxItems)
    .map((entry) => {
      const url = atomLink(entry);
      return {
        title: firstString(entry.title),
        url,
        publishedAt: firstString(entry.published, entry.updated),
        author: firstString((entry.author as Record<string, unknown> | undefined)?.name, entry.author),
        summary: normalizeFeedSummary(firstString(entry.summary, entry.content)),
        id: firstString(entry.id, url),
      };
    });

  return {
    feedTitle: firstString(feed.title),
    items,
  };
}

async function extractRssFeed(args: ToolArgs) {
  const url = requireString(args, "url");
  const maxItems = optionalBoundedInteger(args, "max_items", DEFAULT_MAX_ITEMS, 1, 200);
  const timeoutMs = optionalBoundedInteger(args, "timeout_ms", DEFAULT_FETCH_TIMEOUT_MS, 1000, 60000);
  const xml = await fetchFeed(url, timeoutMs);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    cdataPropName: "#cdata",
    trimValues: true,
    processEntities: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const rss = parseRssItems(parsed, maxItems);
  const atom = rss.items.length > 0 ? { feedTitle: "", items: [] as FeedItem[] } : parseAtomItems(parsed, maxItems);
  const items = rss.items.length > 0 ? rss.items : atom.items;

  return {
    sourceType: "rss_feed",
    url: parseHttpUrl(url).toString(),
    feedTitle: rss.feedTitle || atom.feedTitle,
    itemCount: items.length,
    items,
  };
}

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

const server = new Server(
  {
    name: "newsletter-extractor",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = asRecord(request.params.arguments);

  try {
    switch (request.params.name) {
      case "extract_newsletter_email":
        return jsonContent(extractNewsletterEmail(args));
      case "extract_newsletter_links":
        return jsonContent(extractNewsletterLinks(args));
      case "extract_rss_feed":
        return jsonContent(await extractRssFeed(args));
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
