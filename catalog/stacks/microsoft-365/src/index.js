import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import { publicError } from './contracts.js';
import { createToolkit } from './tools.js';

export function createServer(accounts) {
  const toolkit = createToolkit(accounts);
  const server = new Server({ name: 'microsoft-365', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolkit.tools }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const data = await toolkit.call(request.params.name, request.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: publicError(error) }) }] };
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await createServer().connect(new StdioServerTransport()); }
  catch { process.stderr.write('Microsoft 365 MCP startup failed.\n'); process.exitCode = 1; }
}
