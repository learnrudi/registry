#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { normalizePlaidError } from "./api/client.js";
import { listAccounts, getBalances } from "./logic/accounts.js";
import {
  completeHostedLink,
  createHostedLinkToken,
  exchangePublicToken,
  getHostedLinkStatus,
} from "./logic/link.js";
import { listLinkedItems } from "./logic/tokens.js";
import { syncTransactions } from "./logic/transactions.js";
import { McpInputSchemas } from "./schemas.js";

const server = new Server(
  { name: "plaid", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

function jsonResponse(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResponse(error: unknown) {
  return {
    ...jsonResponse({ error: normalizePlaidError(error) }),
    isError: true,
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "plaid_create_link",
      description:
        "Create a Plaid Hosted Link session URL for linking a bank account. Open the returned hostedLinkUrl in a browser.",
      inputSchema: McpInputSchemas.createLink,
    },
    {
      name: "plaid_complete_hosted_link",
      description:
        "Poll a Hosted Link token for completed Item adds, exchange any public tokens, and save access tokens locally.",
      inputSchema: McpInputSchemas.completeHostedLink,
    },
    {
      name: "plaid_get_link_status",
      description:
        "Get redacted Hosted Link session status for debugging a Link token.",
      inputSchema: McpInputSchemas.linkStatus,
    },
    {
      name: "plaid_exchange_public_token",
      description:
        "Exchange a one-time Plaid public token for an access token and save it in the local token store.",
      inputSchema: McpInputSchemas.exchangePublicToken,
    },
    {
      name: "plaid_list_items",
      description:
        "List locally linked Plaid Items without exposing access tokens.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "plaid_list_accounts",
      description:
        "List accounts for a linked Plaid Item. Defaults to the local default Item.",
      inputSchema: McpInputSchemas.itemSelector,
    },
    {
      name: "plaid_get_balances",
      description:
        "Fetch current balances for accounts under a linked Plaid Item.",
      inputSchema: McpInputSchemas.itemSelector,
    },
    {
      name: "plaid_sync_transactions",
      description:
        "Run cursor-based /transactions/sync for a linked Item and persist the next cursor after a complete sync.",
      inputSchema: McpInputSchemas.syncTransactions,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};

  try {
    switch (request.params.name) {
      case "plaid_create_link":
        return jsonResponse(await createHostedLinkToken(args));
      case "plaid_complete_hosted_link":
        return jsonResponse(
          await completeHostedLink(args as Parameters<typeof completeHostedLink>[0])
        );
      case "plaid_get_link_status":
        return jsonResponse(
          await getHostedLinkStatus(String(args.linkToken || ""))
        );
      case "plaid_exchange_public_token":
        return jsonResponse(
          await exchangePublicToken(args as Parameters<typeof exchangePublicToken>[0])
        );
      case "plaid_list_items":
        return jsonResponse(await listLinkedItems());
      case "plaid_list_accounts":
        return jsonResponse(await listAccounts(args));
      case "plaid_get_balances":
        return jsonResponse(await getBalances(args));
      case "plaid_sync_transactions":
        return jsonResponse(await syncTransactions(args));
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return errorResponse(error);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
