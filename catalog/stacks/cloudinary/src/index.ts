#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ToolArgs,
  errorMessage,
  getConfigStatus,
  getResource,
  loadCloudinaryEnv,
  redactSecrets,
  uploadVideo,
} from "./core.js";

function asText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

loadCloudinaryEnv();

const server = new Server(
  { name: "cloudinary", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "cloudinary_config_status",
      description: "Check whether Cloudinary upload credentials are available without revealing secret values.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "cloudinary_upload_video",
      description: "Upload a local video to Cloudinary. Calls are dry-run unless confirm_upload is true.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Absolute local path to the video file.",
          },
          folder: {
            type: "string",
            description: "Cloudinary folder, e.g. brand/shortform/2026/story-slug.",
          },
          public_id: {
            type: "string",
            description: "File-style public ID without folder or extension.",
          },
          overwrite: {
            type: "boolean",
            description: "Whether Cloudinary may overwrite an existing asset. Default false.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional Cloudinary tags.",
          },
          context: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Optional Cloudinary context metadata with string values.",
          },
          confirm_upload: {
            type: "boolean",
            description: "Must be true to perform the upload. Omit or false for dry-run.",
          },
          dry_run: {
            type: "boolean",
            description: "Set true to force a dry-run even when confirm_upload is true.",
          },
        },
        required: ["file_path", "folder", "public_id"],
      },
    },
    {
      name: "cloudinary_get_resource",
      description: "Fetch a Cloudinary resource by public ID and return a credential-safe resource summary.",
      inputSchema: {
        type: "object",
        properties: {
          public_id: {
            type: "string",
            description: "Cloudinary public ID, including folder path.",
          },
          resource_type: {
            type: "string",
            enum: ["image", "video", "raw"],
            description: "Cloudinary resource type. Default video.",
          },
        },
        required: ["public_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "cloudinary_config_status") {
      return asText(getConfigStatus());
    }

    if (name === "cloudinary_upload_video") {
      return asText(await uploadVideo((args || {}) as ToolArgs));
    }

    if (name === "cloudinary_get_resource") {
      return asText(await getResource((args || {}) as ToolArgs));
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error: unknown) {
    const message = errorMessage(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${redactSecrets(message)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((error: unknown) => {
  const message = errorMessage(error);
  console.error(redactSecrets(message));
});
