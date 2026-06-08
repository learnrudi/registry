import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_OUTPUT_EXTENSION,
  VIDEO_FORMATS,
  VIDEO_SUFFIXES,
  type VideoFormat,
} from "./constants.js";
import { ToolError } from "./errors.js";
import type { NormalizedRenderRequest } from "./validation.js";

export interface ResolvedOutputPaths {
  video_path: string;
  metadata_path: string;
  is_auto_path: boolean;
}

export interface VideoProbe {
  bytes: number;
  width: number;
  height: number;
  duration_seconds: number;
  codec: string;
  format_name: string;
}

const reservedPaths = new Set<string>();

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nonce(): string {
  return createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 8);
}

function expandPath(value: string): string {
  return resolve(value.trim().replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
}

function isRelativeTo(path: string, parent: string): boolean {
  const relative = path.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
  return path === parent || relative;
}

export function outputMetadataPath(videoPath: string): string {
  return `${videoPath}.metadata.json`;
}

export function releaseOutputReservation(paths: ResolvedOutputPaths): void {
  reservedPaths.delete(paths.video_path);
  reservedPaths.delete(paths.metadata_path);
}

export function resolveOutputPaths(value: string | null, templateId: string): ResolvedOutputPaths {
  const outputRoot = resolve(DEFAULT_OUTPUT_DIR);
  const videoPath = value
    ? expandPath(value)
    : join(outputRoot, `video-editor-template-${templateId}-${timestamp()}-${nonce()}${DEFAULT_OUTPUT_EXTENSION}`);
  const extension = extname(videoPath).toLowerCase();

  if (!VIDEO_SUFFIXES.has(extension)) {
    throw new ToolError("validation", "`out_path` must end in .mp4.", {
      field: "out_path",
      path: videoPath,
      allowed_extensions: [...VIDEO_SUFFIXES],
    });
  }
  if (!isRelativeTo(videoPath, outputRoot)) {
    throw new ToolError("validation", `\`out_path\` must be inside ${outputRoot}.`, {
      field: "out_path",
      path: videoPath,
      allowed_root: outputRoot,
    });
  }
  const metadataPath = outputMetadataPath(videoPath);
  if (reservedPaths.has(videoPath) || reservedPaths.has(metadataPath)) {
    throw new ToolError("validation", `Output path is already reserved by an active render: ${videoPath}`, {
      field: "out_path",
      path: videoPath,
    });
  }
  for (const path of [videoPath, metadataPath]) {
    try {
      statSync(path);
      throw new ToolError("validation", `Output path already exists: ${path}`, {
        field: "out_path",
        path,
      });
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
    }
  }

  mkdirSync(dirname(videoPath), { recursive: true });
  reservedPaths.add(videoPath);
  reservedPaths.add(metadataPath);
  return {
    video_path: videoPath,
    metadata_path: metadataPath,
    is_auto_path: !value,
  };
}

export function stableInputHash(request: NormalizedRenderRequest): string {
  const assetDigests = Object.fromEntries(
    Object.entries(request.assets).map(([key, path]) => {
      const stat = statSync(path);
      const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
      return [key, { sha256: digest, bytes: stat.size }];
    })
  );
  const audioDigest = request.audio_path
    ? {
        sha256: createHash("sha256").update(readFileSync(request.audio_path)).digest("hex"),
        bytes: statSync(request.audio_path).size,
      }
    : null;

  const payload = {
    template_id: request.template_id,
    template_version: request.template.version,
    composition_id: request.template.composition_id,
    format: request.format,
    style: request.style,
    duration_seconds: request.duration_seconds,
    data: request.data,
    assets: assetDigests,
    audio: audioDigest,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ToolError("timeout", `${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ToolError("render_failed", `Could not start ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new ToolError("render_failed", `${command} exited with code ${code}.`, {
            detail: stderr.slice(0, 2000),
          })
        );
        return;
      }
      resolveProcess({ stdout, stderr });
    });
  });
}

export async function probeVideo(videoPath: string): Promise<VideoProbe> {
  const stat = statSync(videoPath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new ToolError("render_failed", "Rendered output is missing or empty.", {
      out_path: videoPath,
    });
  }

  const { stdout } = await runProcess(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", videoPath],
    30_000
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new ToolError("render_failed", "ffprobe returned invalid JSON.", {
      out_path: videoPath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ToolError("render_failed", "ffprobe returned an invalid payload.", {
      out_path: videoPath,
    });
  }
  const payload = parsed as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const videoStream = payload.streams?.find((stream) => stream.codec_type === "video");
  if (!videoStream) {
    throw new ToolError("render_failed", "Rendered output does not contain a video stream.", {
      out_path: videoPath,
    });
  }

  return {
    bytes: stat.size,
    width: Number(videoStream.width ?? 0),
    height: Number(videoStream.height ?? 0),
    duration_seconds: Number(payload.format?.duration ?? videoStream.duration ?? 0),
    codec: String(videoStream.codec_name ?? "unknown"),
    format_name: String(payload.format?.format_name ?? "unknown"),
  };
}

export async function validateRenderedVideo(
  videoPath: string,
  format: VideoFormat,
  expectedDurationSeconds: number
): Promise<VideoProbe> {
  const probe = await probeVideo(videoPath);
  const expected = VIDEO_FORMATS[format];
  if (probe.width !== expected.width || probe.height !== expected.height) {
    throw new ToolError("render_failed", "Rendered dimensions do not match requested format.", {
      out_path: videoPath,
      expected_width: expected.width,
      expected_height: expected.height,
      actual_width: probe.width,
      actual_height: probe.height,
    });
  }
  if (!Number.isFinite(probe.duration_seconds) || probe.duration_seconds <= 0) {
    throw new ToolError("render_failed", "Rendered duration is invalid.", {
      out_path: videoPath,
      duration_seconds: probe.duration_seconds,
    });
  }
  if (Math.abs(probe.duration_seconds - expectedDurationSeconds) > 1.0) {
    throw new ToolError("render_failed", "Rendered duration is outside tolerance.", {
      out_path: videoPath,
      expected_duration_seconds: expectedDurationSeconds,
      actual_duration_seconds: probe.duration_seconds,
    });
  }
  if (!probe.format_name.includes("mp4") && !probe.format_name.includes("mov")) {
    throw new ToolError("render_failed", "Rendered container is not MP4-compatible.", {
      out_path: videoPath,
      format_name: probe.format_name,
    });
  }
  return probe;
}

export interface OutputMetadata {
  schema: "rudi.video-editor.template-output.v1";
  video_path: string;
  template_id: string;
  template_version: string;
  composition_id: string;
  format: VideoFormat;
  style: string;
  fps: number;
  duration_seconds: number;
  input_hash: string;
  remotion_version: string;
  renderer: "remotion";
  created_at: string;
  bytes: number;
  width: number;
  height: number;
  codec: string;
}

export function writeOutputMetadata(metadataPath: string, metadata: OutputMetadata): void {
  const outputRoot = resolve(DEFAULT_OUTPUT_DIR);
  if (!isRelativeTo(resolve(metadataPath), outputRoot)) {
    throw new ToolError("write_failed", `Metadata path must be inside ${outputRoot}.`, {
      path: metadataPath,
    });
  }
  try {
    statSync(metadataPath);
    throw new ToolError("write_failed", `Output metadata path already exists: ${metadataPath}`, {
      path: metadataPath,
    });
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }
  }
  try {
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }
    throw new ToolError("write_failed", `Could not write output metadata: ${metadataPath}`, {
      path: metadataPath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
