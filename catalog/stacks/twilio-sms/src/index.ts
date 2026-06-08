#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DEFAULT_LIST_LIMIT,
  MAX_BODY_LENGTH,
  MAX_LIST_LIMIT,
  ToolArgs,
  getConfigStatus,
  getMessage,
  listMessages,
  parseGetArgs,
  parseListArgs,
  parseSendArgs,
  sendSms,
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

const server = new Server(
  { name: "twilio-sms", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "twilio_config_status",
      description: "Check whether Twilio SMS credentials and sender configuration are available without revealing secret values.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "twilio_send_sms",
      description: "Send an SMS through Twilio. Calls are dry-run unless confirm_send is true.",
      inputSchema: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient phone number in E.164 format, e.g. +15551234567.",
          },
          body: {
            type: "string",
            description: `SMS body, max ${MAX_BODY_LENGTH} characters.`,
          },
          from: {
            type: "string",
            description: "Optional sender phone number in E.164 format. Defaults to TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER.",
          },
          messaging_service_sid: {
            type: "string",
            description: "Optional Twilio Messaging Service SID. Defaults to TWILIO_MESSAGING_SERVICE_SID.",
          },
          confirm_send: {
            type: "boolean",
            description: "Must be true to send. Omit or false for a dry-run.",
          },
        },
        required: ["to", "body"],
      },
    },
    {
      name: "twilio_list_messages",
      description: "List recent Twilio messages. Message bodies are omitted unless include_body is true.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: `Number of messages to return, 1-${MAX_LIST_LIMIT}. Default ${DEFAULT_LIST_LIMIT}.`,
          },
          to: {
            type: "string",
            description: "Optional recipient filter in E.164 format.",
          },
          from: {
            type: "string",
            description: "Optional sender filter in E.164 format.",
          },
          date_sent_after: {
            type: "string",
            description: "Optional ISO date/datetime lower bound.",
          },
          date_sent_before: {
            type: "string",
            description: "Optional ISO date/datetime upper bound.",
          },
          include_body: {
            type: "boolean",
            description: "Include full SMS bodies in results. Default false.",
          },
        },
      },
    },
    {
      name: "twilio_get_message",
      description: "Fetch one Twilio message by SID. Message body is omitted unless include_body is true.",
      inputSchema: {
        type: "object",
        properties: {
          sid: {
            type: "string",
            description: "Twilio message SID beginning with SM.",
          },
          include_body: {
            type: "boolean",
            description: "Include the full SMS body. Default false.",
          },
        },
        required: ["sid"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "twilio_config_status") {
      return asText(getConfigStatus());
    }

    if (name === "twilio_send_sms") {
      return asText(await sendSms(parseSendArgs(args as ToolArgs)));
    }

    if (name === "twilio_list_messages") {
      return asText(await listMessages(parseListArgs(args as ToolArgs)));
    }

    if (name === "twilio_get_message") {
      return asText(await getMessage(parseGetArgs(args as ToolArgs)));
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
