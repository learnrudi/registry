/**
 * Audio Tools — MCP Server
 *
 * Tools:
 *   audio_transcribe  — Transcribe audio to text (ffmpeg + whisper)
 *   audio_enrich      — Add AI metadata to a transcript
 *   audio_sync        — Sync JSON transcripts to SQLite
 *   audio_stats       — Show database statistics
 *   audio_query       — Run ad-hoc SQL against the transcript database
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { resolveInput } from "./resolve-input.js";
import { transcribe } from "./transcribe.js";
import { enrich } from "./enrich.js";
import { sync, stats, query } from "./db.js";

const server = new Server(
  { name: "audio-tools", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "audio_transcribe",
      description:
        "Transcribe audio to text using local Whisper. Accepts a local media file, direct remote media URL, supported video-page URL via yt-dlp, or base64-encoded media data. Returns transcript metadata and saves JSON + Markdown output.",
      inputSchema: {
        type: "object" as const,
        properties: {
          file: {
            type: "string",
            description: "Local file path to an audio file",
          },
          url: {
            type: "string",
            description:
              "HTTP(S) URL to direct media or a supported video page. Video pages are extracted with yt-dlp first.",
          },
          data: {
            type: "string",
            description: "Base64-encoded audio data",
          },
          filename: {
            type: "string",
            description:
              "Original filename (used for date parsing and output naming). Required with 'data', optional with 'url'.",
          },
        },
      },
    },
    {
      name: "audio_enrich",
      description:
        "Enrich a transcript JSON file with AI-generated metadata (title, summary, tags, sentiment, etc.). Provide the path to a transcript JSON file.",
      inputSchema: {
        type: "object" as const,
        properties: {
          file: {
            type: "string",
            description: "Path to transcript JSON file",
          },
        },
        required: ["file"],
      },
    },
    {
      name: "audio_sync",
      description:
        "Rebuild the SQLite database from all JSON transcript files. Call this after transcribing or enriching to update the query layer.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "audio_stats",
      description:
        "Show database statistics: note counts, top tags, sentiment distribution.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "audio_query",
      description:
        "Run an ad-hoc SQL query against the transcript database. Useful for searching, filtering, and analyzing transcripts.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sql: {
            type: "string",
            description:
              'SQL query to execute (e.g., "SELECT title, sentiment FROM notes")',
          },
        },
        required: ["sql"],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "audio_transcribe": {
        const input = await resolveInput({
          file: args?.file as string | undefined,
          url: args?.url as string | undefined,
          data: args?.data as string | undefined,
          filename: args?.filename as string | undefined,
        });

        try {
          const record = await transcribe(input.path, input.filename);
          const summary = [
            `Transcribed: ${record.filename}`,
            `Duration: ${record.duration_formatted}`,
            `Words: ${record.transcript.split(/\s+/).length}`,
            `Date: ${record.date}`,
            `Saved: ${record.json_path}`,
            "",
            "--- Transcript ---",
            record.transcript,
          ].join("\n");
          return { content: [{ type: "text", text: summary }] };
        } finally {
          input.cleanup();
        }
      }

      case "audio_enrich": {
        const result = await enrich(args?.file as string);
        if (result.enriched_at && !result.title) {
          return {
            content: [{ type: "text", text: "Already enriched. Skipped." }],
          };
        }
        const summary = [
          `Title: ${result.title}`,
          `Summary: ${result.summary}`,
          `Tags: ${(result.tags || []).join(", ")}`,
          `Sentiment: ${result.sentiment}`,
          `Topics: ${(result.topics || []).join(", ")}`,
          `People: ${(result.people || []).join(", ") || "(none)"}`,
          `Action items: ${(result.action_items || []).length}`,
        ].join("\n");
        return { content: [{ type: "text", text: summary }] };
      }

      case "audio_sync": {
        const result = await sync();
        return { content: [{ type: "text", text: result }] };
      }

      case "audio_stats": {
        const result = await stats();
        return { content: [{ type: "text", text: result }] };
      }

      case "audio_query": {
        const result = await query(args?.sql as string);
        return { content: [{ type: "text", text: result }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
