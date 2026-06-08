import fs from 'fs/promises';
import path from 'path';
import { runCommand } from '../lib/process.js';

const DEFAULT_INTERVAL_SECONDS = 2;
const DEFAULT_WIDTH = 1920;
const SIZE_DIFF_THRESHOLD_BYTES = 5000;

export function parsePositiveNumber(value, label) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

export function fpsForInterval(intervalSeconds) {
  return Number((1 / intervalSeconds).toFixed(6));
}

export function defaultSlidesDir(videoPath) {
  const parsed = path.parse(videoPath);
  return path.resolve(`${parsed.name}_slides`);
}

async function listPngFiles(directory) {
  const entries = await fs.readdir(directory);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith('.png'))
    .sort()
    .map((entry) => path.join(directory, entry));
}

async function assertSafeOutputDir(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const existingSlides = await listPngFiles(outputDir);
  if (existingSlides.length > 0) {
    throw new Error(`Output directory already contains PNG files: ${outputDir}`);
  }
}

async function dedupeByFileSize(outputDir) {
  const slides = await listPngFiles(outputDir);
  if (slides.length === 0) {
    return { kept: 0, removed: 0 };
  }

  const tempDir = `${outputDir}.dedupe-${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });

  let previousSize = 0;
  let kept = 0;
  let removed = 0;

  for (const slidePath of slides) {
    const stat = await fs.stat(slidePath);
    const diff = Math.abs(stat.size - previousSize);

    if (kept === 0 || diff > SIZE_DIFF_THRESHOLD_BYTES) {
      kept += 1;
      const nextName = `slide_${String(kept).padStart(5, '0')}.png`;
      await fs.copyFile(slidePath, path.join(tempDir, nextName));
      previousSize = stat.size;
    } else {
      removed += 1;
    }
  }

  await Promise.all(slides.map((slidePath) => fs.rm(slidePath, { force: true })));
  const uniqueSlides = await listPngFiles(tempDir);
  await Promise.all(uniqueSlides.map(async (slidePath) => {
    await fs.rename(slidePath, path.join(outputDir, path.basename(slidePath)));
  }));
  await fs.rm(tempDir, { recursive: true, force: true });

  return { kept, removed };
}

export async function extractSlides(videoPath, options = {}) {
  if (!videoPath) {
    throw new Error('Video path is required');
  }

  const sourcePath = path.resolve(videoPath);
  await fs.access(sourcePath);

  const intervalSeconds = parsePositiveNumber(
    options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS,
    'slide interval'
  );
  const width = parsePositiveNumber(options.width ?? DEFAULT_WIDTH, 'slide width');
  const outputDir = path.resolve(options.outputDir || defaultSlidesDir(sourcePath));
  const dedupe = options.dedupe !== false;

  await assertSafeOutputDir(outputDir);

  const fps = fpsForInterval(intervalSeconds);
  const outputPattern = path.join(outputDir, 'slide_%05d.png');

  await runCommand('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    sourcePath,
    '-vf',
    `fps=${fps},scale=${width}:-2`,
    '-q:v',
    '2',
    outputPattern
  ]);

  const extractedSlides = await listPngFiles(outputDir);
  if (extractedSlides.length === 0) {
    await fs.rm(outputDir, { recursive: true, force: true });
    throw new Error('No slides extracted. The source video may be unreadable.');
  }

  const dedupeResult = dedupe
    ? await dedupeByFileSize(outputDir)
    : { kept: extractedSlides.length, removed: 0 };

  return {
    sourcePath,
    outputDir,
    intervalSeconds,
    fps,
    width,
    extracted: extractedSlides.length,
    kept: dedupeResult.kept,
    removed: dedupeResult.removed,
    dedupe
  };
}
