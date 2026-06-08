#!/usr/bin/env node
/**
 * Creator Intelligence MCP Server
 *
 * Local creator-audit orchestration and shortform style-reference artifacts.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join, resolve, sep } from "path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { homedir, tmpdir } from "os";
import {
  buildUnifiedExport,
  generateAuditDocuments,
  importLegacyTikTokExtracts,
  inspectFullAudit,
} from "./full-audit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const execFileAsync = promisify(execFile);

const DEFAULT_RESEARCH_ROOT =
  process.env.CREATOR_INTELLIGENCE_ROOT || "/Users/hoff/dev/RUDI/research/creator-intelligence";
const YOUTUBE_CREATORS_ROOT =
  process.env.YOUTUBE_CREATORS_ROOT || "/Users/hoff/dev/RUDI/research/youtube-creators";

const YT_DLP = firstExisting([
  process.env.YT_DLP,
  "/Users/hoff/.rudi/bins/yt-dlp",
  "/opt/homebrew/bin/yt-dlp",
  "yt-dlp",
]);
const FFMPEG = firstExisting([
  process.env.FFMPEG,
  "/Users/hoff/.rudi/bins/ffmpeg",
  "/opt/homebrew/bin/ffmpeg",
  "ffmpeg",
]);
const FFPROBE = firstExisting([
  process.env.FFPROBE,
  "/Users/hoff/.rudi/bins/ffprobe",
  "/opt/homebrew/bin/ffprobe",
  "ffprobe",
]);
const WHISPER = firstExisting([
  process.env.WHISPER_CLI,
  "/Users/hoff/.rudi/runtimes/python/bin/whisper",
  "/Users/hoff/Library/Python/3.9/bin/whisper",
  "whisper",
]);

interface SourceInfo {
  source_url: string;
  canonical_url: string | null;
  platform: string;
  creator_handle: string;
  creator_name: string | null;
  video_id: string;
  description: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  frame_rate: string | null;
  downloaded_for: string;
  do_not_reuse_media: true;
}

interface IntakeResult {
  output_dir: string;
  source_info_path: string;
  readme_path: string;
  contact_sheet_path: string;
  keyframes_sheet_path: string;
  source_media_path?: string;
  source_info: SourceInfo;
}

interface DownloadedVideo {
  info_path: string;
  video_path: string;
  info: any;
}

interface TranscriptResult {
  reference_dir: string;
  audio_path: string;
  transcript_path: string | null;
  transcript_json_path: string | null;
  transcript_vtt_path: string | null;
  status_path: string;
  status: "transcribed" | "audio_only" | "failed";
  word_count: number | null;
  error?: string;
}

interface ProfileVideo {
  id: string;
  title: string;
  url: string;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  repost_count: number | null;
  timestamp: number | null;
  upload_date: string | null;
}

function firstExisting(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes(sep) && existsSync(candidate)) return candidate;
    if (!candidate.includes(sep)) return candidate;
  }
  return candidates.find(Boolean) || "";
}

function expandHome(pathValue: string): string {
  if (pathValue === "~") return homedir();
  if (pathValue.startsWith("~/")) return join(homedir(), pathValue.slice(2));
  return pathValue;
}

function resolveRoot(rawRoot: unknown): string {
  const root = typeof rawRoot === "string" && rawRoot.trim()
    ? expandHome(rawRoot.trim())
    : DEFAULT_RESEARCH_ROOT;
  const absolute = resolve(root);
  if (!absolute.startsWith("/Users/hoff/dev/RUDI/research") && !absolute.startsWith(join(homedir(), ".rudi"))) {
    throw new Error("output_root must be under /Users/hoff/dev/RUDI/research or ~/.rudi");
  }
  return absolute;
}

function resolveAllowedPath(rawPath: unknown, label: string): string {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const absolute = resolve(expandHome(rawPath.trim()));
  if (!absolute.startsWith("/Users/hoff/dev/RUDI/research") && !absolute.startsWith(join(homedir(), ".rudi"))) {
    throw new Error(`${label} must be under /Users/hoff/dev/RUDI/research or ~/.rudi`);
  }
  return absolute;
}

function resolveReadablePath(rawPath: unknown, label: string): string {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const absolute = resolve(expandHome(rawPath.trim()));
  const allowedRoots = [
    "/Users/hoff/dev",
    "/Users/hoff/projects",
    join(homedir(), ".rudi"),
  ];
  if (!allowedRoots.some((root) => absolute === root || absolute.startsWith(`${root}${sep}`))) {
    throw new Error(`${label} must be under /Users/hoff/dev, /Users/hoff/projects, or ~/.rudi`);
  }
  return absolute;
}

function slugify(input: unknown, fallback = "untitled"): string {
  const raw = String(input || fallback).trim().toLowerCase();
  const slug = raw
    .replace(/^@/, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function parseHttpUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("url must be a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("url must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("url must use http or https");
  }
  return parsed.toString();
}

function inferPlatform(url: string, provided?: unknown): string {
  if (typeof provided === "string" && provided.trim()) return slugify(provided, "shortform");
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  if (hostname.includes("tiktok.com")) return "tiktok";
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
  if (hostname.includes("instagram.com")) return "instagram";
  return "shortform";
}

function countFiles(dir: string, predicate: (name: string) => boolean): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(predicate).length;
}

function findFirstFile(dir: string, predicate: (name: string) => boolean): string | null {
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find(predicate);
  return file ? join(dir, file) : null;
}

function findExistingSourceMedia(dir: string): string | null {
  return findFirstFile(dir, (name) =>
    /^source\.(mp4|webm|mkv|mov)$/i.test(name)
  );
}

async function run(command: string, args: string[], options: { cwd?: string; timeout?: number } = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 120_000,
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (error: any) {
    const stderr = error?.stderr ? `\n${String(error.stderr).slice(0, 2000)}` : "";
    const stdout = error?.stdout ? `\n${String(error.stdout).slice(0, 1000)}` : "";
    throw new Error(`${command} failed: ${error?.message || error}${stderr}${stdout}`);
  }
}

async function downloadSourceVideo(url: string, tempDir: string): Promise<DownloadedVideo> {
  await run(YT_DLP, [
    "--no-warnings",
    "--write-info-json",
    "-f", "bv*+ba/best",
    "--merge-output-format", "mp4",
    "-o", join(tempDir, "source.%(ext)s"),
    url,
  ], { timeout: 180_000 });

  const infoPath = findFirstFile(tempDir, (name) => name === "source.info.json");
  const videoPath = findFirstFile(tempDir, (name) =>
    name.startsWith("source.") && !name.endsWith(".json") && /\.(mp4|webm|mkv|mov)$/i.test(name)
  );
  if (!infoPath || !videoPath) {
    throw new Error("yt-dlp did not produce expected source video and metadata files");
  }
  return {
    info_path: infoPath,
    video_path: videoPath,
    info: JSON.parse(readFileSync(infoPath, "utf8")),
  };
}

async function probeVideo(videoPath: string) {
  const { stdout } = await run(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    videoPath,
  ]);
  return JSON.parse(stdout);
}

function readJsonFile(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveReferenceDir(args: any): string {
  if (args?.reference_dir) {
    const refDir = resolveAllowedPath(args.reference_dir, "reference_dir");
    if (!existsSync(refDir) || !statSync(refDir).isDirectory()) {
      throw new Error(`style reference not found: ${refDir}`);
    }
    return refDir;
  }

  const root = resolveRoot(args?.output_root);
  const creator = slugify(args?.creator_slug, "");
  const platform = slugify(args?.platform, "");
  const reference = slugify(args?.reference_slug, "");
  if (!creator || !platform || !reference) {
    throw new Error("creator_slug, platform, and reference_slug are required unless reference_dir is provided");
  }
  const refDir = join(root, creator, platform, "07-style-references", reference);
  if (!existsSync(refDir) || !statSync(refDir).isDirectory()) {
    throw new Error(`style reference not found: ${refDir}`);
  }
  return refDir;
}

function buildSourceInfo(rawUrl: string, info: any, probe: any, platform: string): SourceInfo {
  const stream = probe?.streams?.[0] || {};
  const duration = Number(probe?.format?.duration ?? info.duration);
  return {
    source_url: rawUrl,
    canonical_url: info.webpage_url || info.original_url || null,
    platform,
    creator_handle: slugify(info.uploader || info.uploader_id || info.channel || "unknown", "unknown"),
    creator_name: info.channel || info.uploader || null,
    video_id: String(info.id || slugify(info.webpage_url || rawUrl, "video")),
    description: String(info.description || info.title || "").trim(),
    duration_seconds: Number.isFinite(duration) ? Number(duration.toFixed(2)) : null,
    width: Number(stream.width || info.width) || null,
    height: Number(stream.height || info.height) || null,
    frame_rate: stream.r_frame_rate || (info.fps ? `${info.fps}/1` : null),
    downloaded_for: "style analysis only",
    do_not_reuse_media: true,
  };
}

function writeReadme(outputDir: string, sourceInfo: SourceInfo, title?: unknown): string {
  const displayTitle = typeof title === "string" && title.trim()
    ? title.trim()
    : `${sourceInfo.creator_handle} / ${sourceInfo.video_id}`;
  const date = new Date().toISOString().slice(0, 10);
  const orientation = sourceInfo.width && sourceInfo.height
    ? sourceInfo.height >= sourceInfo.width ? "vertical" : "horizontal"
    : "unknown";
  const lines = [
    `# ${displayTitle}`,
    "",
    `Source: ${sourceInfo.source_url}`,
    "",
    sourceInfo.canonical_url ? `Canonical: ${sourceInfo.canonical_url}` : null,
    sourceInfo.canonical_url ? "" : null,
    `Analyzed: ${date}`,
    "",
    "Downloaded locally for frame analysis only. Do not reuse the video or extracted",
    "frames as RUDI assets.",
    "",
    "## Reference Sheets",
    "",
    "- `contact-sheet-1fps.jpg`",
    "- `keyframes-sheet.jpg`",
    "",
    "## Basic Video Facts",
    "",
    `- Length: ${sourceInfo.duration_seconds ?? "unknown"} seconds`,
    `- Format: ${orientation} ${sourceInfo.width ?? "?"}x${sourceInfo.height ?? "?"}`,
    `- Frame rate: ${sourceInfo.frame_rate ?? "unknown"}`,
    `- Creator: \`${sourceInfo.creator_handle}\``,
    `- Caption context: ${sourceInfo.description || "unknown"}`,
    "",
    "## Structure",
    "",
    "| Time | Visual Move | Purpose |",
    "|---|---|---|",
    "| 0-? sec | Fill after visual inspection | Fill after visual inspection |",
    "",
    "## Repeatable Devices",
    "",
    "- Fill after inspecting `contact-sheet-1fps.jpg` and `keyframes-sheet.jpg`.",
    "",
    "## What To Borrow For RUDI",
    "",
    "- Extract reusable mechanics: hook receipt, overlay scale, pacing, proof-screen placement, captions, and story arc.",
    "",
    "## What Not To Copy Directly",
    "",
    "- Do not copy the creator's exact identity, wardrobe, location, sponsor framing, or distinctive visual branding.",
    "- Do not use downloaded frames as assets.",
  ].filter((line): line is string => line !== null);
  const readmePath = join(outputDir, "README.md");
  writeFileSync(readmePath, `${lines.join("\n")}\n`);
  return readmePath;
}

async function styleReferenceIntake(args: any): Promise<IntakeResult> {
  const url = parseHttpUrl(args?.url);
  const outputRoot = resolveRoot(args?.output_root);
  const platform = inferPlatform(url, args?.platform);
  const overwrite = Boolean(args?.overwrite);
  const keepSource = Boolean(args?.keep_source);
  const contactFps = Number(args?.contact_fps ?? 1);
  const keyframeCount = Math.max(4, Math.min(60, Number(args?.keyframe_count ?? 20)));
  if (!Number.isFinite(contactFps) || contactFps <= 0 || contactFps > 2) {
    throw new Error("contact_fps must be > 0 and <= 2");
  }

  const tempDir = mkdtempSync(join(tmpdir(), "creator-intelligence-"));
  try {
    const download = await downloadSourceVideo(url, tempDir);
    const probe = await probeVideo(download.video_path);
    const info = download.info;
    const sourceInfo = buildSourceInfo(url, info, probe, platform);
    const creatorSlug = slugify(args?.creator_slug || sourceInfo.creator_handle, "unknown");
    const referenceSlug = slugify(args?.reference_slug || sourceInfo.video_id, "reference");
    const outputDir = join(outputRoot, creatorSlug, platform, "07-style-references", referenceSlug);
    if (existsSync(outputDir) && !overwrite) {
      throw new Error(`output directory already exists; pass overwrite=true to replace files: ${outputDir}`);
    }
    mkdirSync(outputDir, { recursive: true });

    const duration = sourceInfo.duration_seconds || 1;
    const contactRows = Math.max(1, Math.ceil((duration * contactFps) / 6));
    const keyRows = Math.ceil(keyframeCount / 4);
    const keyFps = keyframeCount / Math.max(duration, 1);

    const sourceInfoPath = join(outputDir, "source-info.json");
    const contactSheetPath = join(outputDir, "contact-sheet-1fps.jpg");
    const keyframesSheetPath = join(outputDir, "keyframes-sheet.jpg");
    writeFileSync(sourceInfoPath, `${JSON.stringify(sourceInfo, null, 2)}\n`);

    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", download.video_path,
      "-vf", `fps=${contactFps},scale=180:320,drawtext=fontcolor=white:fontsize=12:box=1:boxcolor=black@0.55:x=4:y=4:text='%{pts\\:hms}',tile=6x${contactRows}:padding=0:margin=0`,
      "-frames:v", "1",
      contactSheetPath,
    ], { timeout: 180_000 });

    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", download.video_path,
      "-vf", `fps=${keyFps.toFixed(8)},scale=270:384,tile=4x${keyRows}:padding=0:margin=0`,
      "-frames:v", "1",
      keyframesSheetPath,
    ], { timeout: 180_000 });

    const readmePath = writeReadme(outputDir, sourceInfo, args?.title);
    const result: IntakeResult = {
      output_dir: outputDir,
      source_info_path: sourceInfoPath,
      readme_path: readmePath,
      contact_sheet_path: contactSheetPath,
      keyframes_sheet_path: keyframesSheetPath,
      source_info: sourceInfo,
    };

    if (keepSource) {
      const sourceMediaPath = join(outputDir, `source${download.video_path.slice(download.video_path.lastIndexOf("."))}`);
      copyFileSync(download.video_path, sourceMediaPath);
      result.source_media_path = sourceMediaPath;
    }
    return result;
  } finally {
    if (!Boolean(args?.debug_keep_temp)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function listStyleReferences(args: any) {
  const root = resolveRoot(args?.output_root);
  const creatorFilter = args?.creator_slug ? slugify(args.creator_slug) : null;
  const results: any[] = [];
  if (!existsSync(root)) return { root, count: 0, references: results };

  for (const creator of readdirSync(root).sort()) {
    if (creatorFilter && creator !== creatorFilter) continue;
    const creatorDir = join(root, creator);
    if (!statSync(creatorDir).isDirectory()) continue;
    for (const platform of readdirSync(creatorDir).sort()) {
      const styleDir = join(creatorDir, platform, "07-style-references");
      if (!existsSync(styleDir)) continue;
      for (const reference of readdirSync(styleDir).sort()) {
        const refDir = join(styleDir, reference);
        if (!statSync(refDir).isDirectory()) continue;
        const sourceInfoPath = join(refDir, "source-info.json");
        let sourceInfo: any = null;
        if (existsSync(sourceInfoPath)) {
          try {
            sourceInfo = JSON.parse(readFileSync(sourceInfoPath, "utf8"));
          } catch {}
        }
        results.push({
          creator_slug: creator,
          platform,
          reference_slug: reference,
          path: refDir,
          has_readme: existsSync(join(refDir, "README.md")),
          has_contact_sheet: existsSync(join(refDir, "contact-sheet-1fps.jpg")),
          has_keyframes_sheet: existsSync(join(refDir, "keyframes-sheet.jpg")),
          source_url: sourceInfo?.source_url || null,
          canonical_url: sourceInfo?.canonical_url || null,
          duration_seconds: sourceInfo?.duration_seconds || null,
        });
      }
    }
  }
  return { root, count: results.length, references: results };
}

function readStyleReference(args: any) {
  const refDir = resolveReferenceDir(args);
  const readmePath = join(refDir, "README.md");
  const sourceInfoPath = join(refDir, "source-info.json");
  return {
    path: refDir,
    readme: existsSync(readmePath) ? readFileSync(readmePath, "utf8") : null,
    source_info: existsSync(sourceInfoPath) ? readJsonFile(sourceInfoPath) : null,
    artifacts: {
      contact_sheet: existsSync(join(refDir, "contact-sheet-1fps.jpg")) ? join(refDir, "contact-sheet-1fps.jpg") : null,
      keyframes_sheet: existsSync(join(refDir, "keyframes-sheet.jpg")) ? join(refDir, "keyframes-sheet.jpg") : null,
      audio: existsSync(join(refDir, "audio.wav")) ? join(refDir, "audio.wav") : null,
      transcript: existsSync(join(refDir, "transcript.txt")) ? join(refDir, "transcript.txt") : null,
      transcript_json: existsSync(join(refDir, "transcript.json")) ? join(refDir, "transcript.json") : null,
    },
  };
}

function copyIfExists(sourcePath: string, targetPath: string): string | null {
  if (!existsSync(sourcePath)) return null;
  copyFileSync(sourcePath, targetPath);
  return targetPath;
}

async function transcribeStyleReference(args: any): Promise<TranscriptResult> {
  const refDir = resolveReferenceDir(args);
  const sourceInfoPath = join(refDir, "source-info.json");
  if (!existsSync(sourceInfoPath)) {
    throw new Error(`source-info.json not found in ${refDir}`);
  }
  const sourceInfo = readJsonFile(sourceInfoPath) as SourceInfo;
  const sourceUrl = parseHttpUrl(sourceInfo.source_url || sourceInfo.canonical_url);
  const shouldTranscribe = args?.transcribe !== false;
  const whisperModel = typeof args?.model === "string" && args.model.trim() ? args.model.trim() : "base";
  const language = typeof args?.language === "string" && args.language.trim() ? args.language.trim() : "en";

  const audioPath = join(refDir, "audio.wav");
  const statusPath = join(refDir, "transcript-status.json");
  const transcriptPath = join(refDir, "transcript.txt");
  const transcriptJsonPath = join(refDir, "transcript.json");
  const transcriptVttPath = join(refDir, "transcript.vtt");

  const tempDir = mkdtempSync(join(tmpdir(), "creator-intelligence-transcript-"));
  let tempVideoPath: string | null = null;
  try {
    const existingSource = findExistingSourceMedia(refDir);
    if (existingSource) {
      tempVideoPath = existingSource;
    } else {
      const download = await downloadSourceVideo(sourceUrl, tempDir);
      tempVideoPath = download.video_path;
    }

    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", tempVideoPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      audioPath,
    ], { timeout: 180_000 });

    let status: TranscriptResult["status"] = "audio_only";
    let error: string | undefined;
    let wordCount: number | null = null;
    let finalTranscriptPath: string | null = null;
    let finalTranscriptJsonPath: string | null = null;
    let finalTranscriptVttPath: string | null = null;

    if (shouldTranscribe) {
      try {
        await run(WHISPER, [
          audioPath,
          "--model", whisperModel,
          "--language", language,
          "--output_dir", refDir,
          "--output_format", "all",
          "--fp16", "False",
          "--verbose", "False",
        ], { timeout: 900_000 });

        finalTranscriptPath = copyIfExists(join(refDir, "audio.txt"), transcriptPath);
        finalTranscriptJsonPath = copyIfExists(join(refDir, "audio.json"), transcriptJsonPath);
        finalTranscriptVttPath = copyIfExists(join(refDir, "audio.vtt"), transcriptVttPath);
        if (!finalTranscriptPath) {
          throw new Error("Whisper completed without producing audio.txt");
        }
        const transcript = readFileSync(finalTranscriptPath, "utf8").trim();
        wordCount = transcript ? transcript.split(/\s+/).length : 0;
        status = "transcribed";
      } catch (err: any) {
        status = "failed";
        error = err?.message || String(err);
      }
    }

    const result: TranscriptResult = {
      reference_dir: refDir,
      audio_path: audioPath,
      transcript_path: finalTranscriptPath,
      transcript_json_path: finalTranscriptJsonPath,
      transcript_vtt_path: finalTranscriptVttPath,
      status_path: statusPath,
      status,
      word_count: wordCount,
      error,
    };
    writeFileSync(statusPath, `${JSON.stringify({
      ...result,
      source_url: sourceInfo.source_url,
      canonical_url: sourceInfo.canonical_url,
      model: shouldTranscribe ? whisperModel : null,
      language: shouldTranscribe ? language : null,
      generated_at: new Date().toISOString(),
    }, null, 2)}\n`);
    return result;
  } finally {
    if (!Boolean(args?.debug_keep_temp)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function normalizeProfileVideo(entry: any): ProfileVideo {
  return {
    id: String(entry.id || ""),
    title: String(entry.title || "").trim(),
    url: String(entry.webpage_url || entry.url || ""),
    duration_seconds: Number.isFinite(Number(entry.duration)) ? Number(entry.duration) : null,
    view_count: Number.isFinite(Number(entry.view_count)) ? Number(entry.view_count) : null,
    like_count: Number.isFinite(Number(entry.like_count)) ? Number(entry.like_count) : null,
    comment_count: Number.isFinite(Number(entry.comment_count)) ? Number(entry.comment_count) : null,
    repost_count: Number.isFinite(Number(entry.repost_count)) ? Number(entry.repost_count) : null,
    timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : null,
    upload_date: typeof entry.upload_date === "string" ? entry.upload_date : null,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function writeVideoCsv(path: string, videos: ProfileVideo[]) {
  const headers = [
    "id",
    "title",
    "url",
    "duration_seconds",
    "view_count",
    "like_count",
    "comment_count",
    "repost_count",
    "timestamp",
    "upload_date",
  ];
  const rows = [
    headers.join(","),
    ...videos.map((video) => headers.map((key) => csvEscape((video as any)[key])).join(",")),
  ];
  writeFileSync(path, `${rows.join("\n")}\n`);
}

function topByViews(videos: ProfileVideo[], limit: number): ProfileVideo[] {
  return [...videos]
    .sort((a, b) => (b.view_count ?? -1) - (a.view_count ?? -1))
    .slice(0, limit);
}

function oldestByTimestamp(videos: ProfileVideo[], limit: number): ProfileVideo[] {
  return [...videos]
    .filter((video) => video.timestamp !== null || video.upload_date !== null)
    .sort((a, b) => {
      const left = a.timestamp ?? Number(a.upload_date ?? 0);
      const right = b.timestamp ?? Number(b.upload_date ?? 0);
      return left - right;
    })
    .slice(0, limit);
}

async function profileVideoIndex(args: any) {
  const url = parseHttpUrl(args?.url || args?.profile_url);
  const outputRoot = resolveRoot(args?.output_root);
  const platform = inferPlatform(url, args?.platform);
  const maxResults = Math.max(1, Math.min(300, Number(args?.max_results ?? 75)));
  const cutLimit = Math.max(1, Math.min(maxResults, Number(args?.cut_limit ?? 25)));

  const { stdout } = await run(YT_DLP, [
    "--no-update",
    "--no-warnings",
    "--flat-playlist",
    "--dump-single-json",
    "--playlist-end", String(maxResults),
    url,
  ], { timeout: 180_000 });
  const raw = JSON.parse(stdout);
  const creatorSlug = slugify(args?.creator_slug || raw.uploader || raw.title || raw.id, "unknown");
  const platformDir = join(outputRoot, creatorSlug, platform);
  mkdirSync(platformDir, { recursive: true });

  const videos: ProfileVideo[] = (Array.isArray(raw.entries) ? raw.entries : [])
    .map(normalizeProfileVideo)
    .filter((video: ProfileVideo) => video.id || video.url);
  const latest = videos.slice(0, cutLimit);
  const popular = topByViews(videos, cutLimit);
  const oldest = oldestByTimestamp(videos, cutLimit);

  const profileSnapshotPath = join(platformDir, "01-profile-snapshot.json");
  const videoIndexPath = join(platformDir, "02-video-index.json");
  const videoIndexCsvPath = join(platformDir, "02-video-index.csv");
  const latestCsvPath = join(platformDir, "03-latest-videos.csv");
  const popularCsvPath = join(platformDir, "04-popular-videos.csv");
  const oldestCsvPath = join(platformDir, "05-oldest-videos.csv");
  const overviewPath = join(platformDir, "PROFILE-OVERVIEW.md");

  const snapshot = {
    platform,
    profile_url: url,
    creator_slug: creatorSlug,
    profile_id: raw.id || null,
    title: raw.title || null,
    uploader: raw.uploader || null,
    fetched_at: new Date().toISOString(),
    requested_max_results: maxResults,
    indexed_video_count: videos.length,
    note: "TikTok profile order is source/extractor order. Oldest and popular cuts are computed from the fetched window, not necessarily the creator's all-time catalog.",
  };
  writeFileSync(profileSnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(videoIndexPath, `${JSON.stringify({
    ...snapshot,
    videos,
    cuts: { latest, popular, oldest },
  }, null, 2)}\n`);
  writeVideoCsv(videoIndexCsvPath, videos);
  writeVideoCsv(latestCsvPath, latest);
  writeVideoCsv(popularCsvPath, popular);
  writeVideoCsv(oldestCsvPath, oldest);

  const topVideo = popular[0];
  const lines = [
    `# ${creatorSlug} ${platform} Profile Overview`,
    "",
    `Profile: ${url}`,
    `Fetched: ${snapshot.fetched_at}`,
    `Indexed videos: ${videos.length}`,
    "",
    "## Files",
    "",
    "- `01-profile-snapshot.json`",
    "- `02-video-index.json` / `02-video-index.csv`",
    "- `03-latest-videos.csv`",
    "- `04-popular-videos.csv`",
    "- `05-oldest-videos.csv`",
    "",
    "## Top Fetched Video",
    "",
    topVideo ? `- ${topVideo.view_count ?? "unknown"} views: ${topVideo.title || topVideo.url}` : "- No videos found.",
    "",
    "## Notes",
    "",
    "- Latest/popular/oldest are computed from the fetched window.",
    "- Use browser capture for exact visual profile state, pinned videos, playlists, bio links, and follower metrics.",
  ];
  writeFileSync(overviewPath, `${lines.join("\n")}\n`);

  return {
    creator_slug: creatorSlug,
    platform,
    profile_url: url,
    indexed_video_count: videos.length,
    output_dir: platformDir,
    profile_snapshot_path: profileSnapshotPath,
    video_index_path: videoIndexPath,
    video_index_csv_path: videoIndexCsvPath,
    latest_csv_path: latestCsvPath,
    popular_csv_path: popularCsvPath,
    oldest_csv_path: oldestCsvPath,
    overview_path: overviewPath,
    latest: latest.slice(0, 5),
    popular: popular.slice(0, 5),
    oldest: oldest.slice(0, 5),
  };
}

function creatorInventory(args: any) {
  const root = resolveRoot(args?.output_root);
  const youtubeRoot = typeof args?.youtube_root === "string" && args.youtube_root.trim()
    ? resolve(expandHome(args.youtube_root.trim()))
    : YOUTUBE_CREATORS_ROOT;

  const creatorDirs = existsSync(root)
    ? readdirSync(root).filter((name) => {
      const full = join(root, name);
      return statSync(full).isDirectory() && !name.startsWith(".") && name !== "skills" && name !== "audit-form";
    })
    : [];

  const styleRefs = listStyleReferences({ output_root: root }).references;
  const inventory: any = {
    creator_intelligence_root: root,
    creator_directories: creatorDirs.length,
    tiktok_profile_snapshots: 0,
    profile_video_indexes: 0,
    style_references: styleRefs.length,
    style_reference_readmes: styleRefs.filter((r: any) => r.has_readme).length,
    lite_audits: 0,
    platform_audit_reports: 0,
    unified_exports_json: 0,
    unified_exports_csv: 0,
    extracted_tiktok_markdown: 0,
  };

  function walk(dir: string, visit: (path: string) => void) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full, visit);
      else visit(full);
    }
  }

  walk(root, (path) => {
    if (path.endsWith(`${sep}tiktok${sep}01-profile-snapshot.json`)) inventory.tiktok_profile_snapshots += 1;
    if (path.endsWith(`${sep}02-video-index.json`)) inventory.profile_video_indexes = (inventory.profile_video_indexes || 0) + 1;
    if (path.endsWith(`${sep}LITE-AUDIT.md`)) inventory.lite_audits += 1;
    if (path.endsWith(`${sep}AUDIT-REPORT.md`)) inventory.platform_audit_reports += 1;
    if (path.endsWith("unified-export.json")) inventory.unified_exports_json += 1;
    if (path.endsWith("unified-export.csv")) inventory.unified_exports_csv += 1;
    if (path.includes(`${sep}extracted-videos${sep}tiktok-`) && path.endsWith(".md")) {
      inventory.extracted_tiktok_markdown += 1;
    }
  });

  if (existsSync(youtubeRoot)) {
    const allCreatorsCsv = join(youtubeRoot, "data", "all_creators.csv");
    let youtubeRows = 0;
    if (existsSync(allCreatorsCsv)) {
      youtubeRows = Math.max(0, readFileSync(allCreatorsCsv, "utf8").trim().split(/\r?\n/).length - 1);
    }
    inventory.youtube_creators = {
      root: youtubeRoot,
      all_creators_rows: youtubeRows,
      per_creator_csvs: countFiles(join(youtubeRoot, "data", "per_creator"), (name) => name.endsWith(".csv")),
      raw_jsonl_files: countFiles(join(youtubeRoot, "data", "raw"), (name) => name.endsWith(".jsonl")),
      profile_docs: countFiles(join(youtubeRoot, "profiles"), (name) => /^profile_.*\.md$/.test(name)),
      transcript_txt_files: countFiles(join(youtubeRoot, "data", "transcripts"), (name) => name.endsWith(".txt")),
      transcript_vtt_files: countFiles(join(youtubeRoot, "data", "transcripts"), (name) => name.endsWith(".vtt")),
    };
  }

  return inventory;
}

const server = new Server(
  { name: "creator-intelligence", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "creator_style_reference_intake",
      description: "Create shortform style-reference artifacts from a public video URL: metadata, 1fps contact sheet, keyframe sheet, and README.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public shortform video URL, such as TikTok, YouTube Shorts, or Instagram Reel." },
          creator_slug: { type: "string", description: "Optional creator directory slug. Defaults to uploader handle from metadata." },
          platform: { type: "string", description: "Optional platform override. Defaults from URL hostname." },
          reference_slug: { type: "string", description: "Optional reference directory slug. Defaults to video ID." },
          title: { type: "string", description: "Optional README title." },
          output_root: { type: "string", description: "Optional creator-intelligence output root. Defaults to /Users/hoff/dev/RUDI/research/creator-intelligence." },
          overwrite: { type: "boolean", description: "Replace files if the reference directory already exists. Default false." },
          keep_source: { type: "boolean", description: "Keep downloaded source media in the output directory. Default false." },
          contact_fps: { type: "number", description: "Contact sheet sampling rate. Default 1, max 2." },
          keyframe_count: { type: "number", description: "Approximate number of evenly sampled keyframes. Default 20, max 60." },
          debug_keep_temp: { type: "boolean", description: "Keep the temporary download directory for debugging. Default false." },
        },
        required: ["url"],
      },
    },
    {
      name: "creator_list_style_references",
      description: "List existing style-reference artifact folders under the creator-intelligence research tree.",
      inputSchema: {
        type: "object",
        properties: {
          creator_slug: { type: "string", description: "Optional creator slug filter." },
          output_root: { type: "string", description: "Optional creator-intelligence root." },
        },
      },
    },
    {
      name: "creator_read_style_reference",
      description: "Read one style-reference README, source metadata, and artifact paths.",
      inputSchema: {
        type: "object",
        properties: {
          creator_slug: { type: "string" },
          platform: { type: "string" },
          reference_slug: { type: "string" },
          output_root: { type: "string", description: "Optional creator-intelligence root." },
        },
        required: ["creator_slug", "platform", "reference_slug"],
      },
    },
    {
      name: "creator_transcribe_reference",
      description: "Extract audio from an existing style reference and transcribe it with local Whisper when available.",
      inputSchema: {
        type: "object",
        properties: {
          reference_dir: { type: "string", description: "Optional absolute style-reference directory. If provided, slug fields are not required." },
          creator_slug: { type: "string" },
          platform: { type: "string" },
          reference_slug: { type: "string" },
          output_root: { type: "string", description: "Optional creator-intelligence root." },
          transcribe: { type: "boolean", description: "Run Whisper after extracting audio. Default true." },
          model: { type: "string", description: "Whisper model name. Default base." },
          language: { type: "string", description: "Whisper language hint. Default en." },
          debug_keep_temp: { type: "boolean", description: "Keep the temporary download directory for debugging. Default false." },
        },
      },
    },
    {
      name: "creator_profile_video_index",
      description: "Fetch a TikTok/shortform profile video index and write latest, popular, and oldest CSV cuts from the fetched window.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Creator profile URL, such as https://www.tiktok.com/@handle." },
          profile_url: { type: "string", description: "Alias for url." },
          creator_slug: { type: "string", description: "Optional creator directory slug. Defaults from profile metadata." },
          platform: { type: "string", description: "Optional platform override. Defaults from URL hostname." },
          output_root: { type: "string", description: "Optional creator-intelligence root." },
          max_results: { type: "number", description: "Maximum videos to fetch. Default 75, max 300." },
          cut_limit: { type: "number", description: "Rows in latest/popular/oldest cuts. Default 25." },
        },
      },
    },
    {
      name: "creator_full_audit_inventory",
      description: "Inspect a full creator-audit directory for platform artifacts, counts, required docs, and symlink debt.",
      inputSchema: {
        type: "object",
        properties: {
          audit_root: { type: "string", description: "Absolute full-audit directory under /Users/hoff/dev/RUDI/research or ~/.rudi." },
        },
        required: ["audit_root"],
      },
    },
    {
      name: "creator_import_legacy_tiktok_extracts",
      description: "Copy legacy TikTok extracted-video artifacts into a full-audit folder without symlinking.",
      inputSchema: {
        type: "object",
        properties: {
          source_dir: { type: "string", description: "Directory containing legacy tiktok-*.json extracts and analysis CSVs." },
          audit_root: { type: "string", description: "Target full-audit directory under /Users/hoff/dev/RUDI/research or ~/.rudi." },
          overwrite: { type: "boolean", description: "Overwrite existing imported files. Default false." },
        },
        required: ["source_dir", "audit_root"],
      },
    },
    {
      name: "creator_build_unified_export",
      description: "Build normalized JSON and CSV exports from captured TikTok, YouTube, Substack, and LinkedIn artifacts.",
      inputSchema: {
        type: "object",
        properties: {
          audit_root: { type: "string", description: "Full-audit directory under /Users/hoff/dev/RUDI/research or ~/.rudi." },
          creator_slug: { type: "string", description: "Optional export creator slug. Defaults to audit directory name." },
          output_prefix: { type: "string", description: "Optional output filename prefix. Defaults to {creator_slug}-unified-export." },
        },
        required: ["audit_root"],
      },
    },
    {
      name: "creator_generate_audit_documents",
      description: "Generate PLATFORM-REGISTRY.md, CROSS-PLATFORM-SNAPSHOT.md, and FINAL-SYNTHESIS.md from a unified export.",
      inputSchema: {
        type: "object",
        properties: {
          audit_root: { type: "string", description: "Full-audit directory under /Users/hoff/dev/RUDI/research or ~/.rudi." },
          creator_slug: { type: "string", description: "Optional export creator slug. Defaults to audit directory name." },
          export_path: { type: "string", description: "Optional explicit unified export JSON path." },
        },
        required: ["audit_root"],
      },
    },
    {
      name: "creator_inventory",
      description: "Summarize current creator-intelligence and youtube-creators research artifacts.",
      inputSchema: {
        type: "object",
        properties: {
          output_root: { type: "string", description: "Optional creator-intelligence root." },
          youtube_root: { type: "string", description: "Optional youtube-creators root." },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: unknown;
    switch (name) {
      case "creator_style_reference_intake":
        result = await styleReferenceIntake(args);
        break;
      case "creator_list_style_references":
        result = listStyleReferences(args);
        break;
      case "creator_read_style_reference":
        result = readStyleReference(args);
        break;
      case "creator_transcribe_reference":
        result = await transcribeStyleReference(args);
        break;
      case "creator_profile_video_index":
        result = await profileVideoIndex(args);
        break;
      case "creator_full_audit_inventory":
        result = inspectFullAudit(resolveAllowedPath(args?.audit_root, "audit_root"));
        break;
      case "creator_import_legacy_tiktok_extracts":
        result = importLegacyTikTokExtracts({
          sourceDir: resolveReadablePath(args?.source_dir, "source_dir"),
          root: resolveAllowedPath(args?.audit_root, "audit_root"),
          overwrite: Boolean(args?.overwrite),
        });
        break;
      case "creator_build_unified_export":
        result = buildUnifiedExport({
          root: resolveAllowedPath(args?.audit_root, "audit_root"),
          creatorSlug: typeof args?.creator_slug === "string" && args.creator_slug.trim() ? slugify(args.creator_slug) : undefined,
          outputPrefix: typeof args?.output_prefix === "string" && args.output_prefix.trim() ? slugify(args.output_prefix) : undefined,
        });
        break;
      case "creator_generate_audit_documents":
        result = generateAuditDocuments({
          root: resolveAllowedPath(args?.audit_root, "audit_root"),
          creatorSlug: typeof args?.creator_slug === "string" && args.creator_slug.trim() ? slugify(args.creator_slug) : undefined,
          exportPath: args?.export_path ? resolveAllowedPath(args.export_path, "export_path") : undefined,
        });
        break;
      case "creator_inventory":
        result = creatorInventory(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error?.message || String(error)}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
