#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { availabilityTool } from './tool.js';
import { getAvailability, safeError } from './core.js';
import { main } from './cli.js';

async function serveMcp() {
  const server = new Server({ name: 'rudi-booking-pages', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [availabilityTool] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (request.params.name !== availabilityTool.name) throw new Error('Unknown tool');
      const result = await getAvailability(request.params.arguments, extra.signal);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const result = { error: safeError(error) };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    }
  });
  await server.connect(new StdioServerTransport());
}

// RUDI's installer normalizes the run command to the MCP entry point. The
// runner always supplies RUDI_INPUTS; regular MCP hosts use the stdio protocol.
if (Object.hasOwn(process.env, 'RUDI_INPUTS')) await main([], process.env.RUDI_INPUTS);
else await serveMcp();
