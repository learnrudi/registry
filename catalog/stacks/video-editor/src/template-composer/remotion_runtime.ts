import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, type RenderMediaOnProgress } from "@remotion/renderer";
import { VERSION as REMOTION_VERSION } from "remotion";

import { BUNDLE_DIR, RENDER_TIMEOUT_MS } from "./constants.js";
import type { NormalizedRenderRequest } from "./validation.js";

export interface RenderTemplateInput {
  request: NormalizedRenderRequest;
  outputPath: string;
  onProgress: (progress: number) => void;
}

export interface RenderTemplateResult {
  remotion_version: string;
}

export type RenderTemplateRuntime = (input: RenderTemplateInput) => Promise<RenderTemplateResult>;

const currentFile = fileURLToPath(import.meta.url);
const stackRoot = resolve(dirname(currentFile));
const remotionEntryPoint = resolve(stackRoot, "remotion", "index.ts");

let bundlePromise: Promise<string> | null = null;

function browserExecutable(): string | undefined {
  const candidates = [
    process.env.RUDI_CHROMIUM_PATH,
    process.env.CHROMIUM_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/opt/homebrew/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}

function imageMimeType(assetPath: string): string {
  const lowered = assetPath.toLowerCase();
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowered.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function imageDataUrl(assetPath: string): string {
  const bytes = readFileSync(assetPath);
  return `data:${imageMimeType(assetPath)};base64,${bytes.toString("base64")}`;
}

async function getBundle(onProgress: (progress: number) => void): Promise<string> {
  if (!bundlePromise) {
    mkdirSync(BUNDLE_DIR, { recursive: true });
    bundlePromise = bundle({
      entryPoint: remotionEntryPoint,
      outDir: BUNDLE_DIR,
      rootDir: stackRoot,
      onProgress: (progress) => onProgress(Math.min(10, Math.round(progress / 10))),
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          extensionAlias: {
            ...config.resolve?.extensionAlias,
            ".js": [".ts", ".tsx", ".js"],
            ".jsx": [".tsx", ".jsx"],
          },
        },
      }),
    });
  }
  return bundlePromise;
}

export const renderTemplateToFile: RenderTemplateRuntime = async ({
  request,
  outputPath,
  onProgress,
}) => {
  mkdirSync(dirname(outputPath), { recursive: true });
  const serveUrl = await getBundle(onProgress);
  const executable = browserExecutable();
  const inputProps = {
    format: request.format,
    style: request.style,
    durationSeconds: request.duration_seconds,
    data: request.data,
    assetSrcs: Object.fromEntries(
      Object.entries(request.assets).map(([key, assetPath]) => [
        key,
        imageDataUrl(assetPath),
      ])
    ),
    audioSrc: request.audio_path ? pathToFileURL(request.audio_path).toString() : null,
  };
  const commonBrowserOptions = executable ? { browserExecutable: executable } : {};

  const composition = await selectComposition({
    serveUrl,
    id: request.template.composition_id,
    inputProps,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    logLevel: "warn",
    ...commonBrowserOptions,
  });

  const handleProgress: RenderMediaOnProgress = ({ progress }) => {
    if (typeof progress === "number" && Number.isFinite(progress)) {
      onProgress(10 + Math.round(progress * 85));
    }
  };

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    imageFormat: "jpeg",
    jpegQuality: 90,
    outputLocation: outputPath,
    inputProps,
    overwrite: false,
    concurrency: 1,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    logLevel: "warn",
    onProgress: handleProgress,
    ...commonBrowserOptions,
  });

  onProgress(95);
  return { remotion_version: REMOTION_VERSION };
};

export function resetBundleForTests(): void {
  bundlePromise = null;
}
