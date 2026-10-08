#!/usr/bin/env node
/**
 * Video Editor MCP
 * Edit videos with ffmpeg - trim, speed up, extract clips, remove silence, and more
 *
 * Usage:
 *   - As MCP: Run without args, speaks JSON-RPC
 *   - As API: import { videoTrim, videoSpeed, ... } from './index'
 *   - As CLI: node index.ts <command> <input> [options]
 *
 * CLI Examples:
 *   node index.ts info video.mov
 *   node index.ts trim video.mov --last 120
 *   node index.ts speed video.mov --target 120
 *   node index.ts compress video.mov --crf 23
 */

import { videoInfo, videoTrim, videoSpeed, videoExtractAudio, videoRemoveSilence, videoResize, videoCompress, videoConcat, videoFrames, videoExtractSlides, videoThumbnail, getVideoInfo } from "./quick-tools.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { isLegacyCliTool, legacyCliTools, runLegacyCliTool } from "./legacy-cli-tools.js";
import { isTemplateVideoTool, runTemplateVideoTool, templateVideoTools } from "./template-tools.js";
import { isTranscriptionVideoTool, runTranscriptionVideoTool, transcriptionVideoTools } from "./transcription-tools.js";

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new Server(
  { name: "video-editor", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "video_info",
      description: "Get detailed information about a video file (duration, resolution, codec, bitrate, size)",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_trim",
      description: "Trim a video - extract a portion by start/end time, duration, or last N seconds",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          start: { type: "string", description: "Start time (HH:MM:SS or seconds)" },
          end: { type: "string", description: "End time (HH:MM:SS or seconds)" },
          duration: { type: "string", description: "Duration to extract (HH:MM:SS or seconds)" },
          last: { type: "number", description: "Extract last N seconds from end of video" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_speed",
      description: "Change video playback speed - speed up or slow down. Can specify speed multiplier (e.g., 2 for 2x) or target duration",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          speed: { type: "number", description: "Speed multiplier (e.g., 2 for 2x faster, 0.5 for half speed)" },
          targetDuration: { type: "number", description: "Target duration in seconds (calculates speed automatically)" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_extract_audio",
      description: "Extract audio track from a video file",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          format: { type: "string", description: "Audio format: mp3, aac, wav, flac, ogg (default: mp3)" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_remove_silence",
      description: "Automatically detect and remove silent segments from a video",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          threshold: { type: "string", description: "Silence threshold in dB (default: -30dB). Lower = more aggressive" },
          minDuration: { type: "number", description: "Minimum silence duration in seconds to remove (default: 0.5)" },
          padding: { type: "number", description: "Seconds of padding around cuts (default: 0.1)" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_resize",
      description: "Resize video resolution - by dimensions or scale factor",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          width: { type: "number", description: "Target width in pixels" },
          height: { type: "number", description: "Target height in pixels" },
          scale: { type: "number", description: "Scale factor (e.g., 0.5 for half size)" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_compress",
      description: "Compress video to reduce file size using H.264 encoding",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          crf: { type: "number", description: "Quality (0-51, lower=better, default: 28). 18=visually lossless, 28=good compression" },
          preset: { type: "string", description: "Encoding speed: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow" },
          maxBitrate: { type: "string", description: "Maximum bitrate (e.g., '5M' for 5 Mbps)" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_concat",
      description: "Concatenate multiple videos into one",
      inputSchema: {
        type: "object",
        properties: {
          inputs: {
            type: "array",
            items: { type: "string" },
            description: "Array of video file paths to concatenate",
          },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["inputs"],
      },
    },
    {
      name: "video_frames",
      description: "Extract frames from a video - at intervals, specific timestamps, or evenly distributed count",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          interval: { type: "number", description: "Extract a frame every N seconds (default: 10)" },
          count: { type: "number", description: "Extract exactly N frames, evenly distributed" },
          timestamps: {
            type: "array",
            items: { type: "string" },
            description: "Extract frames at specific timestamps (e.g., ['00:01:30', '00:05:00'])",
          },
          format: { type: "string", description: "Image format: jpg, png, webp (default: jpg)" },
          output: { type: "string", description: "Output directory (optional)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_extract_slides",
      description: "Extract presentation slide frames from a video as PNG images with adjacent-frame dedupe",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          output: { type: "string", description: "Output directory (optional)" },
          interval: { type: "number", description: "Extract a candidate slide every N seconds (default: 2)" },
          width: { type: "number", description: "Output image width in pixels (default: 1920)" },
          dedupe: { type: "boolean", description: "Remove adjacent near-duplicate frames by file-size heuristic (default: true)" },
        },
        required: ["input"],
      },
    },
    {
      name: "video_thumbnail",
      description: "Extract a single thumbnail image from a video",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Path to the video file" },
          time: { type: "string", description: "Timestamp to capture (default: 10% into video)" },
          output: { type: "string", description: "Output file path (optional)" },
        },
        required: ["input"],
      },
    },
    ...legacyCliTools,
    ...templateVideoTools,
    ...transcriptionVideoTools,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "video_info":
        result = await videoInfo(args?.input as string);
        break;
      case "video_trim":
        result = await videoTrim(args?.input as string, {
          start: args?.start as string,
          end: args?.end as string,
          duration: args?.duration as string,
          last: args?.last as number,
          output: args?.output as string,
        });
        break;
      case "video_speed":
        result = await videoSpeed(args?.input as string, {
          speed: args?.speed as number,
          targetDuration: args?.targetDuration as number,
          output: args?.output as string,
        });
        break;
      case "video_extract_audio":
        result = await videoExtractAudio(args?.input as string, {
          format: args?.format as string,
          output: args?.output as string,
        });
        break;
      case "video_remove_silence":
        result = await videoRemoveSilence(args?.input as string, {
          threshold: args?.threshold as string,
          minDuration: args?.minDuration as number,
          padding: args?.padding as number,
          output: args?.output as string,
        });
        break;
      case "video_resize":
        result = await videoResize(args?.input as string, {
          width: args?.width as number,
          height: args?.height as number,
          scale: args?.scale as number,
          output: args?.output as string,
        });
        break;
      case "video_compress":
        result = await videoCompress(args?.input as string, {
          crf: args?.crf as number,
          preset: args?.preset as string,
          maxBitrate: args?.maxBitrate as string,
          output: args?.output as string,
        });
        break;
      case "video_concat":
        result = await videoConcat(args?.inputs as string[], {
          output: args?.output as string,
        });
        break;
      case "video_frames":
        result = await videoFrames(args?.input as string, {
          interval: args?.interval as number,
          count: args?.count as number,
          timestamps: args?.timestamps as string[],
          format: args?.format as string,
          output: args?.output as string,
        });
        break;
      case "video_extract_slides":
        result = await videoExtractSlides(args?.input as string, {
          interval: args?.interval as number,
          width: args?.width as number,
          output: args?.output as string,
          dedupe: args?.dedupe as boolean,
        });
        break;
      case "video_thumbnail":
        result = await videoThumbnail(args?.input as string, {
          time: args?.time as string,
          output: args?.output as string,
        });
        break;
      default:
        if (isLegacyCliTool(name)) {
          result = await runLegacyCliTool(name, (args ?? {}) as Record<string, unknown>);
          break;
        }
        if (isTemplateVideoTool(name)) {
          result = await runTemplateVideoTool(name, (args ?? {}) as Record<string, unknown>);
          break;
        }
        if (isTranscriptionVideoTool(name)) {
          result = await runTranscriptionVideoTool(name, (args ?? {}) as Record<string, unknown>);
          break;
        }
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    return { content: [{ type: "text", text: result }] };
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// =============================================================================
// EXPORTS (for API usage)
// =============================================================================

export {
  videoInfo,
  videoTrim,
  videoSpeed,
  videoExtractAudio,
  videoRemoveSilence,
  videoResize,
  videoCompress,
  videoConcat,
  videoFrames,
  videoExtractSlides,
  videoThumbnail,
  getVideoInfo,
};

// =============================================================================
// ENTRY POINT
// =============================================================================

const args = process.argv.slice(2);
const commands = ["info", "trim", "speed", "audio", "silence", "resize", "compress", "concat", "frames", "slides", "thumbnail", "help"];

function parseArgs(args: string[]): Record<string, any> {
  const opts: Record<string, any> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        const numericOptions = ["speed", "target", "last", "min", "padding", "width", "height", "scale", "crf", "interval", "count"];
        opts[key] = numericOptions.includes(key) ? Number(next) : next;
        i++;
      } else {
        opts[key] = true;
      }
    } else if (!opts.input) {
      opts.input = arg;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
Video Editor CLI

Usage: video-editor <command> <input> [options]

Commands:
  info <video>                    Get video information
  trim <video> [options]          Trim video
    --start <time>                Start time (HH:MM:SS or seconds)
    --end <time>                  End time
    --duration <time>             Duration to extract
    --last <seconds>              Extract last N seconds
  speed <video> [options]         Change playback speed
    --speed <multiplier>          Speed multiplier (e.g., 2 for 2x)
    --target <seconds>            Target duration in seconds
  audio <video> [options]         Extract audio
    --format <fmt>                Format: mp3, aac, wav, flac, ogg
  silence <video> [options]       Remove silent segments
    --threshold <dB>              Silence threshold (default: -30dB)
    --min <seconds>               Min silence duration (default: 0.5)
    --padding <seconds>           Padding around cuts (default: 0.1)
  resize <video> [options]        Resize video
    --width <pixels>              Target width
    --height <pixels>             Target height
    --scale <factor>              Scale factor (e.g., 0.5)
  compress <video> [options]      Compress video
    --crf <0-51>                  Quality (lower=better, default: 28)
    --preset <preset>             Speed: ultrafast to veryslow
  concat <video1> <video2> ...    Concatenate videos
  frames <video> [options]        Extract frames as images
    --interval <seconds>          Extract every N seconds (default: 10)
    --count <n>                   Extract exactly N frames, evenly spaced
    --format <fmt>                Image format: jpg, png, webp
  slides <video> [options]        Extract presentation slides as PNG images
    --interval <seconds>          Extract candidate slides every N seconds (default: 2)
    --width <pixels>              Output image width (default: 1920)
    --dedupe <true|false>         Remove adjacent near-duplicate frames (default: true)
  thumbnail <video> [options]     Extract single thumbnail
    --time <timestamp>            Time to capture (default: 10% in)

Common options:
  --output <path>                 Output file path

Examples:
  video-editor info recording.mov
  video-editor trim recording.mov --last 120
  video-editor speed recording.mov --target 120
  video-editor silence podcast.mp4 --threshold -25dB
  video-editor compress raw.mov --crf 23 --preset fast
`);
}

// CLI mode
if (args.length > 0 && commands.includes(args[0])) {
  const command = args[0];
  const opts = parseArgs(args.slice(1));

  (async () => {
    try {
      let result: string;

      switch (command) {
        case "help":
          printHelp();
          process.exit(0);
        case "info":
          result = await videoInfo(opts.input);
          break;
        case "trim":
          result = await videoTrim(opts.input, opts);
          break;
        case "speed":
          result = await videoSpeed(opts.input, {
            speed: opts.speed,
            targetDuration: opts.target,
            output: opts.output,
          });
          break;
        case "audio":
          result = await videoExtractAudio(opts.input, opts);
          break;
        case "silence":
          result = await videoRemoveSilence(opts.input, {
            threshold: opts.threshold,
            minDuration: opts.min,
            padding: opts.padding,
            output: opts.output,
          });
          break;
        case "resize":
          result = await videoResize(opts.input, opts);
          break;
        case "compress":
          result = await videoCompress(opts.input, opts);
          break;
        case "concat":
          // For concat, all non-flag args are inputs
          const inputs = args.slice(1).filter(a => !a.startsWith("--"));
          result = await videoConcat(inputs, { output: opts.output });
          break;
        case "frames":
          result = await videoFrames(opts.input, {
            interval: opts.interval,
            count: opts.count,
            format: opts.format,
            output: opts.output,
          });
          break;
        case "slides":
          result = await videoExtractSlides(opts.input, {
            interval: opts.interval,
            width: opts.width,
            output: opts.output,
            dedupe: opts.dedupe,
          });
          break;
        case "thumbnail":
          result = await videoThumbnail(opts.input, {
            time: opts.time,
            output: opts.output,
          });
          break;
        default:
          printHelp();
          process.exit(1);
      }

      console.log(result);
    } catch (error: any) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  })();
}
// MCP mode (no args or piped input)
else if (args.length === 0 || args[0] === "--mcp") {
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
// Unknown - show help
else {
  printHelp();
}
