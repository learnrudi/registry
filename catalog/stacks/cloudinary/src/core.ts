import { constants, existsSync, statSync, accessSync } from "fs";
import { homedir } from "os";
import { basename, extname, isAbsolute, join } from "path";
import { config as loadDotenv } from "dotenv";
import { v2 as cloudinary } from "cloudinary";

export type ToolArgs = Record<string, unknown>;
export type EnvMap = Record<string, string | undefined>;

export const STACK_ENV_PATH = join(homedir(), ".rudi", "secrets", "cloudinary.env");
export const ALLOWED_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
export const MAX_TAGS = 20;

type CloudinaryConfig = {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  cloudinaryUrlPresent: boolean;
};

type ValidatedVideo = {
  file_path: string;
  basename: string;
  extension: string;
  size_bytes: number;
};

type UploadVideoArgs = {
  filePath: string;
  folder: string;
  publicId: string;
  overwrite: boolean;
  tags: string[];
  context?: Record<string, string>;
  confirmUpload: boolean;
  dryRun: boolean;
};

export function loadCloudinaryEnv(envPaths = [join(process.cwd(), ".env"), STACK_ENV_PATH]): void {
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false });
    }
  }
}

function parseCloudinaryUrl(rawUrl: string | undefined): Partial<CloudinaryConfig> {
  if (!rawUrl) {
    return {};
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "cloudinary:") {
      return {};
    }

    return {
      cloudName: parsed.hostname || undefined,
      apiKey: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      apiSecret: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      cloudinaryUrlPresent: true,
    };
  } catch {
    return { cloudinaryUrlPresent: true };
  }
}

function resolveCloudinaryConfig(env: EnvMap): CloudinaryConfig {
  const fromUrl = parseCloudinaryUrl(env.CLOUDINARY_URL);

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME || fromUrl.cloudName,
    apiKey: env.CLOUDINARY_API_KEY || fromUrl.apiKey,
    apiSecret: env.CLOUDINARY_API_SECRET || fromUrl.apiSecret,
    cloudinaryUrlPresent: Boolean(env.CLOUDINARY_URL),
  };
}

export function getConfigStatus(env: EnvMap = process.env): Record<string, unknown> {
  const resolved = resolveCloudinaryConfig(env);
  const missing = [];
  if (!resolved.cloudName) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!resolved.apiKey) missing.push("CLOUDINARY_API_KEY");
  if (!resolved.apiSecret) missing.push("CLOUDINARY_API_SECRET");

  return {
    configured: missing.length === 0,
    cloud_name: resolved.cloudName || null,
    cloudinary_url_present: resolved.cloudinaryUrlPresent,
    cloud_name_present: Boolean(resolved.cloudName),
    api_key_present: Boolean(resolved.apiKey),
    api_secret_present: Boolean(resolved.apiSecret),
    missing,
  };
}

function configureCloudinary(env: EnvMap): void {
  const resolved = resolveCloudinaryConfig(env);
  if (!resolved.cloudName || !resolved.apiKey || !resolved.apiSecret) {
    throw new Error(`Cloudinary credentials are incomplete: ${(getConfigStatus(env).missing as string[]).join(", ")}`);
  }

  cloudinary.config({
    cloud_name: resolved.cloudName,
    api_key: resolved.apiKey,
    api_secret: resolved.apiSecret,
    secure: true,
  });
}

function stringArg(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalBoolean(args: ToolArgs, key: string, defaultValue: boolean): boolean {
  const value = args[key];
  if (typeof value === "undefined") {
    return defaultValue;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function normalizeFolder(value: string): string {
  const folder = value.replace(/^\/+|\/+$/g, "").trim();
  if (!folder) {
    throw new Error("folder is required");
  }
  if (folder.includes("\\") || folder.includes("..") || folder.split("/").some((part) => part.length === 0)) {
    throw new Error("folder must be a slash-separated Cloudinary folder without empty or parent-path segments");
  }
  if (!/^[A-Za-z0-9_.\-\/]+$/.test(folder)) {
    throw new Error("folder may only contain letters, numbers, dots, underscores, hyphens, and slashes");
  }
  return folder;
}

function normalizePublicId(value: string): string {
  const publicId = value.trim().replace(/\.[A-Za-z0-9]+$/, "");
  if (!publicId) {
    throw new Error("public_id is required");
  }
  if (publicId.includes("/") || publicId.includes("\\") || publicId.includes("..")) {
    throw new Error("public_id must be a file-style identifier without path separators");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(publicId)) {
    throw new Error("public_id may only contain letters, numbers, dots, underscores, and hyphens");
  }
  return publicId;
}

function normalizeTags(value: unknown): string[] {
  if (typeof value === "undefined") {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("tags must be an array of strings");
  }
  if (value.length > MAX_TAGS) {
    throw new Error(`tags cannot contain more than ${MAX_TAGS} values`);
  }
  return value.map((tag) => {
    if (typeof tag !== "string" || tag.trim().length === 0) {
      throw new Error("tags must be non-empty strings");
    }
    return tag.trim();
  });
}

function normalizeContext(value: unknown): Record<string, string> | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("context must be an object with string values");
  }

  const normalized: Record<string, string> = {};
  for (const [key, contextValue] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      throw new Error("context keys may only contain letters, numbers, dots, underscores, and hyphens");
    }
    if (typeof contextValue !== "string") {
      throw new Error("context values must be strings");
    }
    normalized[key] = contextValue;
  }
  return normalized;
}

function validateLocalVideo(filePath: string): ValidatedVideo {
  if (!isAbsolute(filePath)) {
    throw new Error("file_path must be an absolute local path");
  }
  if (!existsSync(filePath)) {
    throw new Error("file_path does not exist");
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error("file_path must point to a file");
  }
  if (stats.size <= 0) {
    throw new Error("file_path must not be empty");
  }

  accessSync(filePath, constants.R_OK);

  const extension = extname(filePath).toLowerCase();
  if (!ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
    throw new Error(`unsupported video extension: ${extension || "(none)"}`);
  }

  return {
    file_path: filePath,
    basename: basename(filePath),
    extension,
    size_bytes: stats.size,
  };
}

function parseUploadVideoArgs(args: ToolArgs): UploadVideoArgs {
  const confirmUpload = optionalBoolean(args, "confirm_upload", false);
  const dryRun = !confirmUpload || optionalBoolean(args, "dry_run", false);
  const filePath = stringArg(args, "file_path");
  const folder = normalizeFolder(stringArg(args, "folder"));
  const publicId = normalizePublicId(stringArg(args, "public_id"));

  return {
    filePath,
    folder,
    publicId,
    overwrite: optionalBoolean(args, "overwrite", false),
    tags: normalizeTags(args.tags),
    context: normalizeContext(args.context),
    confirmUpload,
    dryRun,
  };
}

function publicIdForUpload(folder: string, publicId: string): string {
  return `${folder}/${publicId}`;
}

export function sanitizeCloudinaryResult(result: Record<string, unknown>): Record<string, unknown> {
  const allowedKeys = [
    "asset_id",
    "public_id",
    "resource_type",
    "type",
    "format",
    "version",
    "bytes",
    "width",
    "height",
    "duration",
    "frame_rate",
    "secure_url",
    "url",
    "created_at",
    "folder",
    "playback_url",
  ];

  return Object.fromEntries(
    allowedKeys
      .filter((key) => typeof result[key] !== "undefined")
      .map((key) => [key, result[key]])
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}

function uploadLargeVideo(filePath: string, options: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, options, (error: unknown, result: unknown) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(errorMessage(error)));
        return;
      }
      if (!result || typeof result !== "object") {
        reject(new Error("Cloudinary upload did not return a resource object"));
        return;
      }
      resolve(result as Record<string, unknown>);
    });
  });
}

export async function uploadVideo(args: ToolArgs, env: EnvMap = process.env): Promise<Record<string, unknown>> {
  const parsed = parseUploadVideoArgs(args);
  const video = validateLocalVideo(parsed.filePath);
  const publicId = publicIdForUpload(parsed.folder, parsed.publicId);
  const configStatus = getConfigStatus(env);

  if (parsed.dryRun) {
    return {
      dry_run: true,
      configured: configStatus.configured,
      upload: {
        resource_type: "video",
        public_id: publicId,
        overwrite: parsed.overwrite,
        tags: parsed.tags,
        context_keys: parsed.context ? Object.keys(parsed.context) : [],
      },
      file: video,
    };
  }

  configureCloudinary(env);

  const uploadOptions: Record<string, unknown> = {
    resource_type: "video",
    public_id: publicId,
    overwrite: parsed.overwrite,
    tags: parsed.tags,
    use_filename: false,
    unique_filename: false,
  };
  if (parsed.context) {
    uploadOptions.context = parsed.context;
  }

  const result = await uploadLargeVideo(parsed.filePath, uploadOptions);
  return {
    dry_run: false,
    file: video,
    resource: sanitizeCloudinaryResult(result),
  };
}

function parseResourceArgs(args: ToolArgs): { publicId: string; resourceType: "image" | "video" | "raw" } {
  const publicId = stringArg(args, "public_id").replace(/^\/+|\/+$/g, "");
  if (!publicId || publicId.includes("\\") || publicId.includes("..")) {
    throw new Error("public_id must be a Cloudinary public ID without parent-path segments");
  }

  const rawResourceType = typeof args.resource_type === "string" ? args.resource_type : "video";
  if (!["image", "video", "raw"].includes(rawResourceType)) {
    throw new Error("resource_type must be image, video, or raw");
  }

  return {
    publicId,
    resourceType: rawResourceType as "image" | "video" | "raw",
  };
}

export async function getResource(args: ToolArgs, env: EnvMap = process.env): Promise<Record<string, unknown>> {
  const parsed = parseResourceArgs(args);
  configureCloudinary(env);
  const result = await cloudinary.api.resource(parsed.publicId, {
    resource_type: parsed.resourceType,
  });

  return {
    resource: sanitizeCloudinaryResult(result as Record<string, unknown>),
  };
}

export function redactSecrets(text: string, env: EnvMap = process.env): string {
  let redacted = text.replace(/cloudinary:\/\/[^@\s]+@/g, "cloudinary://[redacted]@");
  for (const key of ["CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_URL"]) {
    const value = env[key];
    if (typeof value === "string" && value.length > 3) {
      redacted = redacted.split(value).join("[redacted]");
    }
  }
  return redacted;
}
