import { parseFrameRate, validateQuickOptions } from "./quick-validation.js";
import { runCommand } from "./lib/process.js";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, mkdtempSync } from "fs";
import { basename, dirname, join, extname } from "path";

const runMedia = (command: string, args: string[]) => runCommand(command, args, { capture: true, maxBuffer: 50 * 1024 * 1024, timeoutMs: 600_000 });

// Use homebrew ffmpeg/ffprobe if available, otherwise fall back to PATH
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";

// =============================================================================
// UTILITIES
// =============================================================================

function sanitizePath(inputPath: string): string {
  // Handle paths with unicode characters (like macOS narrow no-break space)
  return inputPath.trim();
}

async function findFile(pattern: string, dir: string): Promise<string | null> {
  // Handle files with special unicode characters in names
  try {
    const files = readdirSync(dir);
    const match = files.find(f => f.includes(pattern));
    if (match) return join(dir, match);
  } catch {}
  return null;
}

async function resolveInputPath(input: string): Promise<string> {
  const sanitized = sanitizePath(input);
  if (existsSync(sanitized)) return sanitized;

  // Try to find file by pattern if direct path fails (unicode issues)
  const dir = dirname(sanitized);
  const name = basename(sanitized);
  const found = await findFile(name.slice(0, 20), dir);
  if (found) return found;

  throw new Error(`File not found: ${input}`);
}

function getOutputPath(input: string, suffix: string, outputDir?: string): string {
  const dir = outputDir || dirname(input);
  const ext = extname(input);
  const name = basename(input, ext);
  return join(dir, `${name}${suffix}${ext}`);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

function parsePositiveNumber(value: number | string | undefined, fallback: number, label: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function listPngFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort()
    .map((file) => join(directory, file));
}

function dedupeSlidesByFileSize(outputDir: string): { kept: number; removed: number } {
  const files = listPngFiles(outputDir);
  if (files.length <= 1) {
    return { kept: files.length, removed: 0 };
  }

  const uniqueFiles: string[] = [];
  let previousSize: number | null = null;

  for (const file of files) {
    const size = statSync(file).size;
    if (previousSize === null || Math.abs(size - previousSize) > 5000) {
      uniqueFiles.push(file);
      previousSize = size;
    }
  }

  const tempDir = join(outputDir, ".dedupe");
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  uniqueFiles.forEach((file, index) => {
    const filename = `slide_${String(index + 1).padStart(5, "0")}.png`;
    copyFileSync(file, join(tempDir, filename));
  });

  files.forEach((file) => unlinkSync(file));
  readdirSync(tempDir).forEach((file) => {
    renameSync(join(tempDir, file), join(outputDir, file));
  });
  rmSync(tempDir, { recursive: true, force: true });

  return { kept: uniqueFiles.length, removed: files.length - uniqueFiles.length };
}

export async function getVideoInfo(inputPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  audioCodec: string;
  size: number;
}> {
  const { stdout } = await runMedia(FFPROBE, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath]);
  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find((s: any) => s.codec_type === "video") || {};
  const audioStream = data.streams?.find((s: any) => s.codec_type === "audio") || {};

  return {
    duration: parseFloat(data.format?.duration || "0"),
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    fps: parseFrameRate(videoStream.r_frame_rate),
    bitrate: parseInt(data.format?.bit_rate || "0"),
    codec: videoStream.codec_name || "unknown",
    audioCodec: audioStream.codec_name || "none",
    size: parseInt(data.format?.size || "0"),
  };
}

// =============================================================================
// VIDEO OPERATIONS
// =============================================================================

export async function videoInfo(input: string): Promise<string> {
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  return `**Video Info**

**File:** ${basename(inputPath)}
**Duration:** ${formatDuration(info.duration)}
**Resolution:** ${info.width}x${info.height}
**FPS:** ${info.fps.toFixed(2)}
**Video Codec:** ${info.codec}
**Audio Codec:** ${info.audioCodec}
**Bitrate:** ${(info.bitrate / 1e6).toFixed(1)} Mbps
**Size:** ${formatBytes(info.size)}`;
}

export async function videoTrim(
  input: string,
  options: { start?: string; end?: string; duration?: string; last?: number; output?: string }
): Promise<string> {
  validateQuickOptions("videoTrim", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  let ffmpegArgs: string[] = [];
  let suffix = "-trimmed";

  if (options.last) {
    // Extract last N seconds
    ffmpegArgs = ["-sseof", `-${options.last}`];
    suffix = `-last${options.last}s`;
  } else if (options.start && options.end) {
    ffmpegArgs = ["-ss", options.start, "-to", options.end];
    suffix = `-${options.start.replace(/:/g, "")}-${options.end.replace(/:/g, "")}`;
  } else if (options.start && options.duration) {
    ffmpegArgs = ["-ss", options.start, "-t", options.duration];
    suffix = `-from${options.start.replace(/:/g, "")}`;
  } else if (options.start) {
    ffmpegArgs = ["-ss", options.start];
    suffix = `-from${options.start.replace(/:/g, "")}`;
  } else if (options.duration) {
    ffmpegArgs = ["-t", options.duration];
    suffix = `-first${options.duration}`;
  }

  const outputPath = options.output || getOutputPath(inputPath, suffix);

  await runMedia(FFMPEG, ["-y", ...ffmpegArgs, "-i", inputPath, "-c", "copy", outputPath]);

  const outputInfo = await getVideoInfo(outputPath);

  return `**Trimmed Video**

**Input:** ${basename(inputPath)} (${formatDuration(info.duration)})
**Output:** ${outputPath}
**Duration:** ${formatDuration(outputInfo.duration)}
**Size:** ${formatBytes(outputInfo.size)}`;
}

export async function videoSpeed(
  input: string,
  options: { speed?: number; targetDuration?: number; output?: string }
): Promise<string> {
  validateQuickOptions("videoSpeed", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  let speed = options.speed || 1;

  if (options.targetDuration) {
    speed = info.duration / options.targetDuration;
  }

  const outputPath = options.output || getOutputPath(inputPath, `-${speed}x`, dirname(inputPath));
  const ext = extname(outputPath).toLowerCase();

  // For high speed factors, drop audio (can't speed up audio >4x reasonably)
  const dropAudio = speed > 4;

  const videoFilter = `setpts=PTS/${speed}`;
  const audioArgs = dropAudio ? ["-an"] : ["-filter:a", `atempo=${Math.min(speed, 2)}`];

  // Use mp4 for better compatibility with speed changes
  const outputExt = ext === ".mov" ? ".mp4" : ext;
  const finalOutput = outputPath.replace(ext, outputExt);

  await runMedia(FFMPEG, ["-y", "-i", inputPath, "-filter:v", videoFilter, ...audioArgs, "-c:v", "libx264", "-preset", "fast", "-crf", "23", finalOutput]);

  const outputInfo = await getVideoInfo(finalOutput);

  return `**Speed Changed Video**

**Input:** ${basename(inputPath)} (${formatDuration(info.duration)})
**Speed:** ${speed.toFixed(1)}x${dropAudio ? " (audio removed)" : ""}
**Output:** ${finalOutput}
**Duration:** ${formatDuration(outputInfo.duration)}
**Size:** ${formatBytes(outputInfo.size)}`;
}

export async function videoExtractAudio(
  input: string,
  options: { format?: string; output?: string }
): Promise<string> {
  validateQuickOptions("videoExtractAudio", options);
  const inputPath = await resolveInputPath(input);
  const format = options.format || "mp3";
  const ext = extname(inputPath);
  const outputPath = options.output || inputPath.replace(ext, `.${format}`);

  const codecMap: Record<string, string> = {
    mp3: "libmp3lame",
    aac: "aac",
    wav: "pcm_s16le",
    flac: "flac",
    ogg: "libvorbis",
  };

  const codec = codecMap[format] || "copy";

  await runMedia(FFMPEG, ["-y", "-i", inputPath, "-vn", "-acodec", codec, outputPath]);

  const stat = statSync(outputPath);

  return `**Audio Extracted**

**Input:** ${basename(inputPath)}
**Output:** ${outputPath}
**Format:** ${format.toUpperCase()}
**Size:** ${formatBytes(stat.size)}`;
}

export async function videoRemoveSilence(
  input: string,
  options: { threshold?: string; minDuration?: number; padding?: number; output?: string }
): Promise<string> {
  validateQuickOptions("videoRemoveSilence", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  const threshold = options.threshold || "-30dB";
  const minDuration = options.minDuration || 0.5;
  const padding = options.padding ?? 0.1;

  // Detect silence
  const { stderr } = await runMedia(FFMPEG, ["-i", inputPath, "-af", `silencedetect=noise=${threshold}:d=${minDuration}`, "-f", "null", "-"]);

  // Parse silence periods
  const silenceStarts: number[] = [];
  const silenceEnds: number[] = [];

  const startRegex = /silence_start: ([\d.]+)/g;
  const endRegex = /silence_end: ([\d.]+)/g;

  let match;
  while ((match = startRegex.exec(stderr)) !== null) {
    silenceStarts.push(parseFloat(match[1]));
  }
  while ((match = endRegex.exec(stderr)) !== null) {
    silenceEnds.push(parseFloat(match[1]));
  }

  if (silenceStarts.length === 0) {
    return `**No Silence Detected**

**Input:** ${basename(inputPath)}
**Threshold:** ${threshold}
**Min Duration:** ${minDuration}s

No silent segments found matching criteria.`;
  }

  // Calculate segments to keep
  const segments: { start: number; end: number }[] = [];
  let lastEnd = 0;

  for (let i = 0; i < silenceStarts.length; i++) {
    const silenceStart = silenceStarts[i];
    const silenceEnd = silenceEnds[i] || info.duration;

    if (silenceStart > lastEnd + padding) {
      segments.push({
        start: Math.max(0, lastEnd - padding),
        end: Math.min(info.duration, silenceStart + padding),
      });
    }
    lastEnd = silenceEnd;
  }

  // Add final segment
  if (lastEnd < info.duration - padding) {
    segments.push({
      start: Math.max(0, lastEnd - padding),
      end: info.duration,
    });
  }

  // Create temp directory and extract segments
  const tempDir = mkdtempSync(join(dirname(inputPath), ".silence-temp-"));

  const concatFile = join(tempDir, "concat.txt");
  const segmentPaths: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segPath = join(tempDir, `seg${i.toString().padStart(3, "0")}.ts`);
    segmentPaths.push(segPath);

    await runMedia(FFMPEG, ["-y", "-ss", String(seg.start), "-t", String(seg.end - seg.start), "-i", inputPath, "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", segPath]);
  }

  // Write concat file
  const concatContent = segmentPaths.map(p => `file '${basename(p)}'`).join("\n");
  writeFileSync(concatFile, concatContent, { flag: "wx" });

  // Concatenate
  const outputPath = options.output || getOutputPath(inputPath, "-nosilence");
  await runMedia(FFMPEG, ["-y", "-f", "concat", "-safe", "1", "-i", concatFile, "-c", "copy", outputPath]);

  // Cleanup
  rmSync(tempDir, { recursive: true, force: true });

  const outputInfo = await getVideoInfo(outputPath);
  const removed = info.duration - outputInfo.duration;
  const percentRemoved = ((removed / info.duration) * 100).toFixed(1);

  return `**Silence Removed**

**Input:** ${basename(inputPath)} (${formatDuration(info.duration)})
**Output:** ${outputPath}
**Duration:** ${formatDuration(outputInfo.duration)}
**Removed:** ${formatDuration(removed)} (${percentRemoved}%)
**Silent Segments:** ${silenceStarts.length}
**Threshold:** ${threshold}`;
}

export async function videoResize(
  input: string,
  options: { width?: number; height?: number; scale?: number; output?: string }
): Promise<string> {
  validateQuickOptions("videoResize", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  let filter: string;
  let suffix: string;

  if (options.scale) {
    const newWidth = Math.round(info.width * options.scale);
    const newHeight = Math.round(info.height * options.scale);
    filter = `scale=${newWidth}:${newHeight}`;
    suffix = `-${Math.round(options.scale * 100)}pct`;
  } else if (options.width && options.height) {
    filter = `scale=${options.width}:${options.height}`;
    suffix = `-${options.width}x${options.height}`;
  } else if (options.width) {
    filter = `scale=${options.width}:-2`;
    suffix = `-w${options.width}`;
  } else if (options.height) {
    filter = `scale=-2:${options.height}`;
    suffix = `-h${options.height}`;
  } else {
    throw new Error("Must specify width, height, or scale");
  }

  const outputPath = options.output || getOutputPath(inputPath, suffix);

  await runMedia(FFMPEG, ["-y", "-i", inputPath, "-vf", filter, "-c:a", "copy", outputPath]);

  const outputInfo = await getVideoInfo(outputPath);

  return `**Resized Video**

**Input:** ${basename(inputPath)} (${info.width}x${info.height})
**Output:** ${outputPath}
**Resolution:** ${outputInfo.width}x${outputInfo.height}
**Size:** ${formatBytes(outputInfo.size)}`;
}

export async function videoCompress(
  input: string,
  options: { crf?: number; preset?: string; maxBitrate?: string; output?: string }
): Promise<string> {
  validateQuickOptions("videoCompress", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  const crf = options.crf ?? 28;
  const preset = options.preset || "medium";

  const outputPath = options.output || getOutputPath(inputPath, "-compressed", dirname(inputPath));

  const args = ["-y", "-i", inputPath, "-c:v", "libx264", "-crf", String(crf), "-preset", preset, "-c:a", "aac", "-b:a", "128k"];
  if (options.maxBitrate) args.push("-maxrate", options.maxBitrate, "-bufsize", options.maxBitrate);
  args.push(outputPath);
  await runMedia(FFMPEG, args);

  const outputInfo = await getVideoInfo(outputPath);
  const reduction = ((1 - outputInfo.size / info.size) * 100).toFixed(1);

  return `**Compressed Video**

**Input:** ${basename(inputPath)} (${formatBytes(info.size)})
**Output:** ${outputPath}
**Size:** ${formatBytes(outputInfo.size)} (${reduction}% smaller)
**CRF:** ${crf}
**Preset:** ${preset}`;
}

export async function videoFrames(
  input: string,
  options: { interval?: number; count?: number; timestamps?: string[]; format?: string; output?: string }
): Promise<string> {
  validateQuickOptions("videoFrames", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);
  const format = options.format || "jpg";

  // Create output directory
  const inputName = basename(inputPath, extname(inputPath));
  const outputDir = options.output || join(dirname(inputPath), `${inputName}-frames`);
  mkdirSync(outputDir, { recursive: true });

  let extractedCount = 0;
  const outputPaths: string[] = [];

  if (options.timestamps && options.timestamps.length > 0) {
    // Extract frames at specific timestamps
    for (let i = 0; i < options.timestamps.length; i++) {
      const ts = options.timestamps[i];
      const outPath = join(outputDir, `frame-${ts.replace(/:/g, "-")}.${format}`);
      await runMedia(FFMPEG, ["-y", "-ss", String(ts), "-i", inputPath, "-vframes", "1", "-q:v", "2", outPath]);
      outputPaths.push(outPath);
      extractedCount++;
    }
  } else if (options.count) {
    // Extract N frames evenly distributed
    const interval = info.duration / (options.count + 1);
    for (let i = 1; i <= options.count; i++) {
      const ts = interval * i;
      const outPath = join(outputDir, `frame-${i.toString().padStart(3, "0")}.${format}`);
      await runMedia(FFMPEG, ["-y", "-ss", String(ts), "-i", inputPath, "-vframes", "1", "-q:v", "2", outPath]);
      outputPaths.push(outPath);
      extractedCount++;
    }
  } else {
    // Extract frames at interval (default: every 10 seconds)
    const interval = options.interval || 10;
    let ts = 0;
    let frameNum = 1;
    while (ts < info.duration) {
      const outPath = join(outputDir, `frame-${frameNum.toString().padStart(3, "0")}.${format}`);
      await runMedia(FFMPEG, ["-y", "-ss", String(ts), "-i", inputPath, "-vframes", "1", "-q:v", "2", outPath]);
      outputPaths.push(outPath);
      extractedCount++;
      ts += interval;
      frameNum++;
    }
  }

  return `**Frames Extracted**

**Input:** ${basename(inputPath)} (${formatDuration(info.duration)})
**Output:** ${outputDir}
**Frames:** ${extractedCount}
**Format:** ${format.toUpperCase()}
**Files:**
${outputPaths.slice(0, 10).map(p => `  - ${basename(p)}`).join("\n")}${outputPaths.length > 10 ? `\n  ... and ${outputPaths.length - 10} more` : ""}`;
}

export async function videoExtractSlides(
  input: string,
  options: { interval?: number | string; width?: number | string; output?: string; dedupe?: boolean | string }
): Promise<string> {
  validateQuickOptions("videoExtractSlides", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);
  const interval = parsePositiveNumber(options.interval, 2, "interval");
  const width = Math.round(parsePositiveNumber(options.width, 1920, "width"));
  const shouldDedupe = options.dedupe !== false && options.dedupe !== "false";

  const inputName = basename(inputPath, extname(inputPath));
  const outputDir = options.output || join(dirname(inputPath), `${inputName}-slides`);
  const outputDirExisted = existsSync(outputDir);

  mkdirSync(outputDir, { recursive: true });
  const existingPngs = listPngFiles(outputDir);
  if (existingPngs.length > 0) {
    throw new Error(`Output directory already contains PNG files: ${outputDir}`);
  }

  await runMedia(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", inputPath, "-vf", `fps=1/${interval},scale=${width}:-2`, "-q:v", "2", join(outputDir, "slide_%05d.png")]);

  const rawSlides = listPngFiles(outputDir);
  if (rawSlides.length === 0) {
    if (!outputDirExisted) {
      rmSync(outputDir, { recursive: true, force: true });
    }
    throw new Error("No slides were extracted from the video");
  }

  const dedupe = shouldDedupe
    ? dedupeSlidesByFileSize(outputDir)
    : { kept: rawSlides.length, removed: 0 };
  const finalSlides = listPngFiles(outputDir);

  return `**Slides Extracted**

**Input:** ${basename(inputPath)} (${formatDuration(info.duration)})
**Output:** ${outputDir}
**Interval:** every ${interval}s
**Width:** ${width}px
**Raw Frames:** ${rawSlides.length}
**Slides Kept:** ${dedupe.kept}
**Duplicates Removed:** ${dedupe.removed}
**Files:**
${finalSlides.slice(0, 10).map(p => `  - ${basename(p)}`).join("\n")}${finalSlides.length > 10 ? `\n  ... and ${finalSlides.length - 10} more` : ""}`;
}

export async function videoThumbnail(
  input: string,
  options: { time?: string; output?: string }
): Promise<string> {
  validateQuickOptions("videoThumbnail", options);
  const inputPath = await resolveInputPath(input);
  const info = await getVideoInfo(inputPath);

  // Default to 10% into the video for thumbnail
  const time = options.time || (info.duration * 0.1).toString();
  const inputName = basename(inputPath, extname(inputPath));
  const outputPath = options.output || join(dirname(inputPath), `${inputName}-thumb.jpg`);

  await runMedia(FFMPEG, ["-y", "-ss", time, "-i", inputPath, "-vframes", "1", "-q:v", "2", outputPath]);

  const stat = statSync(outputPath);

  return `**Thumbnail Created**

**Input:** ${basename(inputPath)}
**Output:** ${outputPath}
**Time:** ${time}s
**Size:** ${formatBytes(stat.size)}`;
}

export async function videoConcat(
  inputs: string[],
  options: { output?: string }
): Promise<string> {
  validateQuickOptions("videoConcat", options);
  const inputPaths = await Promise.all(inputs.map(resolveInputPath));

  const tempDir = mkdtempSync(join(dirname(inputPaths[0]), ".concat-temp-"));

  // Convert all to ts format for concatenation
  const tsPaths: string[] = [];
  for (let i = 0; i < inputPaths.length; i++) {
    const tsPath = join(tempDir, `part${i.toString().padStart(3, "0")}.ts`);
    tsPaths.push(tsPath);
    await runMedia(FFMPEG, ["-y", "-i", inputPaths[i], "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", tsPath]);
  }

  // Create concat file
  const concatFile = join(tempDir, "concat.txt");
  const concatContent = tsPaths.map(p => `file '${basename(p)}'`).join("\n");
  writeFileSync(concatFile, concatContent, { flag: "wx" });

  // Concatenate
  const outputPath = options.output || getOutputPath(inputPaths[0], "-merged");
  await runMedia(FFMPEG, ["-y", "-f", "concat", "-safe", "1", "-i", concatFile, "-c", "copy", outputPath]);

  // Cleanup
  rmSync(tempDir, { recursive: true, force: true });

  const outputInfo = await getVideoInfo(outputPath);

  return `**Concatenated Videos**

**Inputs:** ${inputPaths.length} files
${inputPaths.map(p => `  - ${basename(p)}`).join("\n")}
**Output:** ${outputPath}
**Duration:** ${formatDuration(outputInfo.duration)}
**Size:** ${formatBytes(outputInfo.size)}`;
}
