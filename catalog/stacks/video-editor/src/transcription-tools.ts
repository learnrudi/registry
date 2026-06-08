import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync, mkdirSync, statSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import { tmpdir } from "os";

type ToolArgs = Record<string, unknown>;
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type ProcessResult = {
  stdout: string;
  stderr: string;
};

const maxOutputBytes = 20 * 1024 * 1024;
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";

const stringProp = (description: string) => ({ type: "string", description });

function stringArg(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalStringArg(args: ToolArgs, key: string): string | null {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string when provided`);
  }
  return value;
}

function expandPath(input: string): string {
  return resolve(input.trim().replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function runProcess(command: string, args: string[], timeoutMs = 300_000): Promise<ProcessResult> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function append(chunk: Buffer, stream: "stdout" | "stderr") {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        reject(new Error(`${command} output exceeded 20MB`));
        return;
      }
      if (stream === "stdout") {
        stdout += chunk.toString("utf8");
      } else {
        stderr += chunk.toString("utf8");
      }
    }

    child.stdout.on("data", (chunk) => append(chunk, "stdout"));
    child.stderr.on("data", (chunk) => append(chunk, "stderr"));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 2000)}`));
        return;
      }
      resolveProcess({ stdout, stderr });
    });
  });
}

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await runProcess(FFPROBE, [
      "-v",
      "quiet",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], 30_000);
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) ? duration : 0;
  } catch {
    return 0;
  }
}

async function extractAudioForTranscript(videoPath: string, outputPath: string) {
  await runProcess(FFMPEG, [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ]);
  const size = statSync(outputPath).size;
  return {
    success: true,
    output_path: outputPath,
    size_bytes: size,
    size_mb: Number((size / (1024 * 1024)).toFixed(2)),
  };
}

async function convertToWav(inputPath: string): Promise<string> {
  const wavPath = join(await mkdtemp(join(tmpdir(), "video-editor-transcribe-")), "audio.wav");
  await runProcess(FFMPEG, [
    "-y",
    "-i",
    inputPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    wavPath,
  ], 120_000);
  return wavPath;
}

function resolveWhisperCommand(): string {
  if (process.env.WHISPER_CMD) {
    return process.env.WHISPER_CMD;
  }
  if (existsSync("/opt/homebrew/bin/whisper")) {
    return "/opt/homebrew/bin/whisper";
  }
  if (existsSync("/opt/homebrew/bin/whisper-cli")) {
    return "/opt/homebrew/bin/whisper-cli";
  }
  return "whisper";
}

async function readOpenAiWhisperJson(outputDir: string, audioPath: string) {
  const jsonPath = join(outputDir, `${basename(audioPath, extname(audioPath))}.json`);
  return JSON.parse(await readFile(jsonPath, "utf8"));
}

async function transcribeWithOpenAiWhisper(audioPath: string, options: { model: string; language: string }) {
  const outputDir = await mkdtemp(join(tmpdir(), "video-editor-whisper-"));
  try {
    const whisper = resolveWhisperCommand();
    await runProcess(whisper, [
      audioPath,
      "--model",
      options.model,
      "--output_format",
      "json",
      "--output_dir",
      outputDir,
      "--language",
      options.language,
      "--task",
      "transcribe",
      "--word_timestamps",
      "False",
      "--fp16",
      "False",
      "--verbose",
      "False",
    ]);
    const raw = await readOpenAiWhisperJson(outputDir, audioPath);
    return String(raw.text || "").trim();
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function transcribeWithWhisperCpp(audioPath: string): Promise<string> {
  const whisper = resolveWhisperCommand();
  const model = process.env.WHISPER_CPP_MODEL || join(process.env.HOME ?? "", ".whisper-models", "ggml-base.en.bin");
  const wavPath = audioPath.toLowerCase().endsWith(".wav") ? audioPath : await convertToWav(audioPath);
  try {
    const { stdout } = await runProcess(whisper, ["-m", model, "-f", wavPath, "--no-timestamps"]);
    return stdout
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("["))
      .join(" ")
      .trim();
  } finally {
    if (wavPath !== audioPath) {
      await rm(dirname(wavPath), { recursive: true, force: true });
    }
  }
}

export async function transcribeAudioFile(args: ToolArgs) {
  const audioPath = expandPath(stringArg(args, "audio_path"));
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const outputPath = optionalStringArg(args, "output_path");
  const model = optionalStringArg(args, "model") || "base";
  const language = optionalStringArg(args, "language") || "en";
  const whisperCommand = resolveWhisperCommand();
  const transcript = whisperCommand.endsWith("whisper-cli")
    ? await transcribeWithWhisperCpp(audioPath)
    : await transcribeWithOpenAiWhisper(audioPath, { model, language });
  const duration = await getAudioDuration(audioPath);

  const response: Record<string, unknown> = {
    success: true,
    transcript,
    duration_seconds: Number(duration.toFixed(2)),
    duration_formatted: formatDuration(duration),
    word_count: transcript.split(/\s+/).filter(Boolean).length,
    transcribed_at: new Date().toISOString(),
    model,
    language,
  };

  if (outputPath) {
    const basePath = expandPath(outputPath).replace(/\.txt$/i, "");
    const txtPath = `${basePath}.txt`;
    const jsonPath = `${basePath}.json`;
    mkdirSync(dirname(txtPath), { recursive: true });
    await writeFile(txtPath, transcript, "utf8");
    await writeFile(jsonPath, `${JSON.stringify(response, null, 2)}\n`, "utf8");
    response.txt_path = txtPath;
    response.json_path = jsonPath;
  }

  return response;
}

export async function processVideoTranscript(args: ToolArgs) {
  const videoPath = expandPath(stringArg(args, "video_path"));
  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }
  const outputDir = expandPath(optionalStringArg(args, "output_dir") || dirname(videoPath));
  mkdirSync(outputDir, { recursive: true });

  const stem = basename(videoPath, extname(videoPath));
  const audioPath = join(outputDir, `${stem}_audio.m4a`);
  const audio = await extractAudioForTranscript(videoPath, audioPath);
  const transcript = await transcribeAudioFile({
    audio_path: audioPath,
    output_path: join(outputDir, `${stem}_audio`),
    model: optionalStringArg(args, "model") || undefined,
    language: optionalStringArg(args, "language") || undefined,
  });

  return {
    success: true,
    video_path: videoPath,
    audio,
    transcript,
  };
}

export const transcriptionVideoTools: ToolDefinition[] = [
  {
    name: "video_transcribe_audio",
    description: "Transcribe an audio file with local Whisper and optionally write txt/json transcript files.",
    inputSchema: {
      type: "object",
      properties: {
        audio_path: stringProp("Path to an audio file"),
        output_path: stringProp("Optional base path for transcript .txt and .json outputs"),
        model: stringProp("Whisper model name for the OpenAI whisper CLI. Default: base"),
        language: stringProp("Language code. Default: en"),
      },
      required: ["audio_path"],
    },
  },
  {
    name: "video_process_video_transcript",
    description: "Extract audio from a video and transcribe it with local Whisper.",
    inputSchema: {
      type: "object",
      properties: {
        video_path: stringProp("Path to a video file"),
        output_dir: stringProp("Optional directory for extracted audio and transcript outputs"),
        model: stringProp("Whisper model name for the OpenAI whisper CLI. Default: base"),
        language: stringProp("Language code. Default: en"),
      },
      required: ["video_path"],
    },
  },
];

export function isTranscriptionVideoTool(name: string): boolean {
  return transcriptionVideoTools.some((tool) => tool.name === name);
}

export async function runTranscriptionVideoTool(name: string, args: ToolArgs = {}): Promise<string> {
  if (name === "video_transcribe_audio") {
    return JSON.stringify(await transcribeAudioFile(args), null, 2);
  }
  if (name === "video_process_video_transcript") {
    return JSON.stringify(await processVideoTranscript(args), null, 2);
  }
  throw new Error(`Unknown transcription video tool: ${name}`);
}
