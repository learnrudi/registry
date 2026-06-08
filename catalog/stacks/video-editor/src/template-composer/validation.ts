import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  AUDIO_SIGNATURES,
  AUDIO_SUFFIXES,
  DEFAULT_FORMAT,
  DEFAULT_STYLE,
  IMAGE_SIGNATURES,
  IMAGE_SUFFIXES,
  MAX_ASSET_BYTES,
  MAX_AUDIO_BYTES,
  STYLE_PRESETS,
  VIDEO_FORMATS,
  type VideoFormat,
  type VideoStyle,
} from "./constants.js";
import { ToolError } from "./errors.js";
import {
  getTemplate,
  templateSupportsFormat,
  type JsonObjectSchema,
  type JsonValueSchema,
  type VideoTemplate,
} from "./template_registry.js";

export interface NormalizedRenderRequest {
  template: VideoTemplate;
  template_id: string;
  format: VideoFormat;
  style: VideoStyle;
  duration_seconds: number;
  data: Record<string, unknown>;
  assets: Record<string, string>;
  audio_path: string | null;
  out_path: string | null;
}

const RENDER_REQUEST_FIELDS = new Set([
  "template_id",
  "format",
  "style",
  "duration_seconds",
  "data",
  "assets",
  "audio_path",
  "out_path",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasSignature(bytes: Buffer, signature: Uint8Array): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

function requireString(args: Record<string, unknown>, field: string): string {
  const value = args[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolError("validation", `\`${field}\` must be a non-empty string.`, { field });
  }
  return value.trim();
}

export function optionalString(args: Record<string, unknown>, field: string): string | null {
  const value = args[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolError("validation", `\`${field}\` must be a non-empty string when provided.`, {
      field,
    });
  }
  return value.trim();
}

function rejectUnknownFields(args: Record<string, unknown>, allowed: Set<string>, context: string): void {
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      throw new ToolError("validation", `Unknown field for ${context}: ${key}`, { field: key });
    }
  }
}

function validateString(schema: Extract<JsonValueSchema, { type: "string" }>, value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ToolError("validation", `\`${field}\` must be a string.`, { field });
  }
  const text = value.trim();
  if (schema.minLength !== undefined && text.length < schema.minLength) {
    throw new ToolError("validation", `\`${field}\` is too short.`, {
      field,
      min_length: schema.minLength,
    });
  }
  if (schema.maxLength !== undefined && text.length > schema.maxLength) {
    throw new ToolError("validation", `\`${field}\` is too long.`, {
      field,
      max_length: schema.maxLength,
    });
  }
  if (schema.pattern && !new RegExp(schema.pattern).test(text)) {
    throw new ToolError("validation", `\`${field}\` does not match the required pattern.`, {
      field,
    });
  }
  return text;
}

function validateObject(schema: JsonObjectSchema, value: unknown, fieldPrefix: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ToolError("validation", `\`${fieldPrefix}\` must be a JSON object.`, {
      field: fieldPrefix,
    });
  }

  const required = schema.required ?? [];
  for (const key of required) {
    if (!(key in value)) {
      throw new ToolError("validation", `Missing required data field: ${key}`, {
        field: `${fieldPrefix}.${key}`,
      });
    }
  }

  if (!schema.additionalProperties) {
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) {
        throw new ToolError("validation", `Unknown data field: ${key}`, { field: `data.${key}` });
      }
    }
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const property = schema.properties[key];
    if (!property) {
      continue;
    }
    normalized[key] = validateJsonValue(property, raw, `${fieldPrefix}.${key}`);
  }

  return normalized;
}

function validateArray(schema: Extract<JsonValueSchema, { type: "array" }>, value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ToolError("validation", `\`${field}\` must be an array.`, { field });
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    throw new ToolError("validation", `\`${field}\` has too few items.`, {
      field,
      min_items: schema.minItems,
    });
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    throw new ToolError("validation", `\`${field}\` has too many items.`, {
      field,
      max_items: schema.maxItems,
    });
  }
  return value.map((item, index) => validateObject(schema.items, item, `${field}[${index}]`));
}

function validateJsonValue(schema: JsonValueSchema, value: unknown, field: string): unknown {
  if (schema.type === "string") {
    return validateString(schema, value, field);
  }
  if (schema.type === "array") {
    return validateArray(schema, value, field);
  }
  return validateObject(schema, value, field);
}

function validateData(schema: JsonObjectSchema, value: unknown): Record<string, unknown> {
  return validateObject(schema, value, "data");
}

function normalizeDuration(args: Record<string, unknown>, template: VideoTemplate): number {
  const value = args.duration_seconds;
  if (value === undefined || value === null) {
    return template.duration_seconds;
  }
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new ToolError("validation", "`duration_seconds` must be an integer when provided.", {
      field: "duration_seconds",
    });
  }
  if (!template.allowed_duration_seconds.includes(value)) {
    throw new ToolError("validation", "`duration_seconds` is not supported by this template.", {
      field: "duration_seconds",
      template_id: template.template_id,
      allowed: template.allowed_duration_seconds,
    });
  }
  return value;
}

function normalizeStyle(args: Record<string, unknown>, template: VideoTemplate): VideoStyle {
  const rawStyle = optionalString(args, "style") ?? template.default_style ?? DEFAULT_STYLE;
  const style = rawStyle.toLowerCase();
  if (!(style in STYLE_PRESETS)) {
    throw new ToolError("validation", `Unknown style: ${rawStyle}`, {
      field: "style",
      allowed: Object.keys(STYLE_PRESETS),
    });
  }
  if (!template.supported_styles.includes(style as VideoStyle)) {
    throw new ToolError("unsupported_combo", `Template ${template.template_id} does not support ${style}.`, {
      field: "style",
      template_id: template.template_id,
      style,
      supported_styles: template.supported_styles,
    });
  }
  return style as VideoStyle;
}

function normalizeLocalPath(value: string, field: string): string {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("http://") || lowered.startsWith("https://") || lowered.startsWith("data:")) {
    throw new ToolError("validation", `\`${field}\` must be a local file path.`, { field });
  }
  return resolve(trimmed.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
}

function validateReadableFile(path: string, field: string, maxBytes: number): Buffer {
  let size = 0;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) {
      throw new ToolError("validation", `\`${field}\` must point to a file.`, { field, path });
    }
    size = stat.size;
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }
    throw new ToolError("validation", `File not found or unreadable: ${path}`, { field, path });
  }
  if (size <= 0 || size > maxBytes) {
    throw new ToolError("validation", `\`${field}\` size is outside the allowed range.`, {
      field,
      path,
      bytes: size,
      max_bytes: maxBytes,
    });
  }
  return readFileSync(path, { flag: "r" }).subarray(0, 16);
}

function validateImageAsset(path: string, field: string): void {
  const lowered = path.toLowerCase();
  const suffix = lowered.slice(lowered.lastIndexOf("."));
  if (!IMAGE_SUFFIXES.has(suffix)) {
    throw new ToolError("validation", `\`${field}\` must be a PNG, JPEG, or WebP image.`, {
      field,
      path,
    });
  }
  const bytes = validateReadableFile(path, field, MAX_ASSET_BYTES);
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const isKnownImage = IMAGE_SIGNATURES.some(([signature]) => hasSignature(bytes, signature)) || isWebp;
  if (!isKnownImage) {
    throw new ToolError("validation", `\`${field}\` bytes are not a supported image.`, {
      field,
      path,
    });
  }
}

function validateAudioPath(value: string): string {
  const path = normalizeLocalPath(value, "audio_path");
  const lowered = path.toLowerCase();
  const suffix = lowered.slice(lowered.lastIndexOf("."));
  if (!AUDIO_SUFFIXES.has(suffix)) {
    throw new ToolError("validation", "`audio_path` must be WAV, MP3, AAC, or M4A.", {
      field: "audio_path",
      path,
    });
  }
  const bytes = validateReadableFile(path, "audio_path", MAX_AUDIO_BYTES);
  const isWav = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE";
  const isM4a = bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  const isKnownAudio = AUDIO_SIGNATURES.some(([signature]) => hasSignature(bytes, signature)) || isWav || isM4a;
  if (!isKnownAudio) {
    throw new ToolError("validation", "`audio_path` bytes are not a supported audio file.", {
      field: "audio_path",
      path,
    });
  }
  return path;
}

function normalizeAssets(template: VideoTemplate, value: unknown): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new ToolError("validation", "`assets` must be a JSON object when provided.", {
      field: "assets",
    });
  }
  const allowed = template.asset_schema.properties;
  if (!template.asset_schema.additionalProperties) {
    for (const key of Object.keys(value)) {
      if (!(key in allowed)) {
        throw new ToolError("validation", `Unknown asset field: ${key}`, {
          field: `assets.${key}`,
        });
      }
    }
  }

  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new ToolError("validation", `\`assets.${key}\` must be a non-empty local file path.`, {
        field: `assets.${key}`,
      });
    }
    const path = normalizeLocalPath(raw, `assets.${key}`);
    validateImageAsset(path, `assets.${key}`);
    normalized[key] = path;
  }
  return normalized;
}

export function normalizeRenderRequest(args: Record<string, unknown>): NormalizedRenderRequest {
  rejectUnknownFields(args, RENDER_REQUEST_FIELDS, "video_render_template");

  const templateId = requireString(args, "template_id");
  const template = getTemplate(templateId);

  const rawFormat = optionalString(args, "format") ?? DEFAULT_FORMAT;
  const format = rawFormat.toLowerCase();
  if (!(format in VIDEO_FORMATS)) {
    throw new ToolError("validation", `Unknown format: ${rawFormat}`, {
      field: "format",
      allowed: Object.keys(VIDEO_FORMATS),
    });
  }
  if (!templateSupportsFormat(template, format)) {
    throw new ToolError("unsupported_combo", `Template ${template.template_id} does not support ${format}.`, {
      field: "format",
      template_id: template.template_id,
      format,
      supported_formats: template.formats,
    });
  }

  const data = validateData(template.data_schema, args.data);
  const style = normalizeStyle(args, template);
  const durationSeconds = normalizeDuration(args, template);
  const assets = normalizeAssets(template, args.assets);
  const audio = optionalString(args, "audio_path");

  return {
    template,
    template_id: template.template_id,
    format,
    style,
    duration_seconds: durationSeconds,
    data,
    assets,
    audio_path: audio ? validateAudioPath(audio) : null,
    out_path: optionalString(args, "out_path"),
  };
}

export function normalizeStatus(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolError("validation", "`status` must be a non-empty string when provided.", {
      field: "status",
    });
  }
  const status = value.trim();
  if (!["draft", "beta", "current", "deprecated"].includes(status)) {
    throw new ToolError("validation", "`status` is not a supported template status.", {
      field: "status",
      allowed: ["draft", "beta", "current", "deprecated"],
    });
  }
  return status;
}

export function normalizeJobId(args: Record<string, unknown>): string {
  rejectUnknownFields(args, new Set(["job_id"]), "video_get_render_job");
  return requireString(args, "job_id");
}
