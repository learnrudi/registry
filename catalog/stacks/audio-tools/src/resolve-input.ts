/**
 * Resolve audio input from file path, URL, or base64 data into a local file path.
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, basename, extname } from "path";
import { randomBytes } from "crypto";
import { execFileSync } from "child_process";
import { getConfig } from "./config.js";

export interface ResolvedInput {
  path: string;
  filename: string;
  cleanup: () => void; // call when done to remove temp files
}

export type UrlDownloadPlan = {
  mode: "direct" | "yt-dlp";
  command: string;
  args: string[];
  outputPath?: string;
  outputTemplate?: string;
};

const VIDEO_PAGE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.watch",
  "x.com",
  "twitter.com",
  "vimeo.com",
];

function parseHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("url must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must use http or https");
  }
  return parsed;
}

function safeStem(value: string): string {
  const stem = value
    .replace(/\.[A-Za-z0-9]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || `download-${randomBytes(4).toString("hex")}`;
}

function safeMediaFilename(value: string): string {
  const filename = basename(value);
  const extension = extname(filename) || ".m4a";
  return `${safeStem(filename)}${extension}`;
}

export function isVideoPageUrl(rawUrl: string): boolean {
  const parsed = parseHttpUrl(rawUrl);
  const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
  return VIDEO_PAGE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function buildUrlDownloadPlan(rawUrl: string, tmpDir: string, filename?: string): UrlDownloadPlan {
  const parsed = parseHttpUrl(rawUrl);
  const cfg = getConfig();
  const nameFromUrl = basename(parsed.pathname);
  const stem = safeStem(filename || nameFromUrl || parsed.hostname);

  if (isVideoPageUrl(rawUrl)) {
    const outputTemplate = join(tmpDir, `${stem}-%(id)s.%(ext)s`);
    return {
      mode: "yt-dlp",
      command: cfg.tools.yt_dlp,
      outputTemplate,
      args: [
        "--no-playlist",
        "-x",
        "--audio-format",
        "m4a",
        "--audio-quality",
        "0",
        "-o",
        outputTemplate,
        "--print",
        "after_move:filepath",
        rawUrl,
      ],
    };
  }

  const extension = extname(nameFromUrl) || ".m4a";
  const outputPath = join(tmpDir, `${stem}${extension}`);
  return {
    mode: "direct",
    command: "fetch",
    outputPath,
    args: [rawUrl, outputPath],
  };
}

async function downloadDirect(rawUrl: string, outputPath: string): Promise<void> {
  const response = await fetch(rawUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`download failed: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("download returned an empty file");
  }
  writeFileSync(outputPath, buffer);
}

function runYtDlp(plan: UrlDownloadPlan, tmpDir: string): string {
  const before = new Set(readdirSync(tmpDir));
  const output = execFileSync(plan.command, plan.args, {
    timeout: 600_000,
    maxBuffer: 10 * 1024 * 1024,
  }).toString();
  const printed = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => existsSync(line));
  if (printed) return printed;

  const created = readdirSync(tmpDir)
    .filter((name) => !before.has(name))
    .map((name) => join(tmpDir, name))
    .find((path) => existsSync(path));
  if (created) return created;

  throw new Error("yt-dlp did not produce an audio file");
}

/**
 * Accepts one of:
 *   - file: local file path
 *   - url: remote media URL or supported video page
 *   - data + filename: base64-encoded audio
 *
 * Returns a local file path ready for processing.
 */
export async function resolveInput(args: {
  file?: string;
  url?: string;
  data?: string;
  filename?: string;
}): Promise<ResolvedInput> {
  // 1. Local file path
  if (args.file) {
    if (!existsSync(args.file)) {
      throw new Error(`File not found: ${args.file}`);
    }
    return {
      path: args.file,
      filename: basename(args.file),
      cleanup: () => {},
    };
  }

  // 2. Remote URL — fetch direct media or extract audio from video pages
  if (args.url) {
    const tmpDir = join(tmpdir(), "audio-tools");
    mkdirSync(tmpDir, { recursive: true });

    const plan = buildUrlDownloadPlan(args.url, tmpDir, args.filename);
    let dest: string;
    if (plan.mode === "yt-dlp") {
      dest = runYtDlp(plan, tmpDir);
    } else {
      if (!plan.outputPath) throw new Error("download plan missing output path");
      dest = plan.outputPath;
      await downloadDirect(args.url, dest);
    }

    return {
      path: dest,
      filename: basename(dest),
      cleanup: () => {
        try { unlinkSync(dest); } catch {}
      },
    };
  }

  // 3. Base64 data
  if (args.data) {
    const tmpDir = join(tmpdir(), "audio-tools");
    mkdirSync(tmpDir, { recursive: true });

    const name = args.filename
      ? safeMediaFilename(args.filename)
      : `upload-${randomBytes(4).toString("hex")}.m4a`;
    const dest = join(tmpDir, name);

    const buffer = Buffer.from(args.data, "base64");
    if (buffer.length === 0) {
      throw new Error("data must decode to a non-empty media file");
    }
    writeFileSync(dest, buffer);

    return {
      path: dest,
      filename: name,
      cleanup: () => {
        try { unlinkSync(dest); } catch {}
      },
    };
  }

  throw new Error("Provide one of: file (path), url, or data (base64)");
}
