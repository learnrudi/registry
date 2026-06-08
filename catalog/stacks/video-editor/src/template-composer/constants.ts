import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const STACK_NAME = "video-editor-template-composer";
export const STACK_VERSION = "1.0.0";

function expandConfiguredPath(input: string): string {
  return resolve(input.trim().replace(/^~(?=$|\/)/, homedir()));
}

function configuredPath(envName: string, fallback: string): string {
  const value = process.env[envName];
  return value && value.trim() ? expandConfiguredPath(value) : fallback;
}

function resolveRudiHome(): string {
  return configuredPath("RUDI_HOME", join(homedir(), ".rudi"));
}

const STACK_STATE_ROOT = configuredPath(
  "RUDI_VIDEO_EDITOR_STATE_DIR",
  join(resolveRudiHome(), "state", "stacks", "video-editor")
);

export const DEFAULT_OUTPUT_DIR = configuredPath("RUDI_VIDEO_EDITOR_OUTPUT_DIR", join(resolveRudiHome(), "outputs"));
export const STATE_DIR = join(STACK_STATE_ROOT, "template-composer");
export const JOBS_DIR = join(STATE_DIR, "jobs");
export const BUNDLE_DIR = join(STATE_DIR, "bundle");

export const DEFAULT_FORMAT = "story";
export const DEFAULT_STYLE = "editorial";
export const DEFAULT_OUTPUT_EXTENSION = ".mp4";
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const RENDER_TIMEOUT_MS = 120_000;
export const MAX_CONCURRENT_RENDERS = 1;

export const VIDEO_FORMATS = {
  story: {
    label: "Story",
    aspect_ratio: "9:16",
    width: 1080,
    height: 1920,
    description: "Short-form vertical video.",
  },
  landscape: {
    label: "Landscape",
    aspect_ratio: "16:9",
    width: 1920,
    height: 1080,
    description: "Widescreen video.",
  },
  square: {
    label: "Square",
    aspect_ratio: "1:1",
    width: 1080,
    height: 1080,
    description: "Square feed video.",
  },
  portrait: {
    label: "Portrait",
    aspect_ratio: "4:5",
    width: 1080,
    height: 1350,
    description: "Portrait feed video.",
  },
} as const;

export type VideoFormat = keyof typeof VIDEO_FORMATS;

export const STYLE_PRESETS = {
  editorial: {
    label: "Editorial",
    description: "Premium, report-like storytelling with restrained motion.",
  },
  dashboard: {
    label: "Dashboard",
    description: "Operational, metrics-forward visual language.",
  },
  launch: {
    label: "Launch",
    description: "High-energy product and campaign motion.",
  },
  "field-guide": {
    label: "Field Guide",
    description: "Calm instructional style for tutorials and playbooks.",
  },
  neon: {
    label: "Neon",
    description: "Sharper contrast and brighter accents for social hooks.",
  },
  studio: {
    label: "Studio",
    description: "Minimal product-keynote style with polished surfaces and restrained motion.",
  },
} as const;

export type VideoStyle = keyof typeof STYLE_PRESETS;

export const VIDEO_SUFFIXES = new Set([".mp4"]);
export const IMAGE_SUFFIXES = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const AUDIO_SUFFIXES = new Set([".wav", ".mp3", ".m4a", ".aac"]);

export const IMAGE_SIGNATURES: Array<[Uint8Array, string]> = [
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
  [new Uint8Array([0xff, 0xd8, 0xff]), "jpg"],
];

export const AUDIO_SIGNATURES: Array<[Uint8Array, string]> = [
  [new Uint8Array([0x49, 0x44, 0x33]), "mp3"],
  [new Uint8Array([0xff, 0xfb]), "mp3"],
  [new Uint8Array([0xff, 0xf3]), "mp3"],
  [new Uint8Array([0xff, 0xf1]), "aac"],
];
