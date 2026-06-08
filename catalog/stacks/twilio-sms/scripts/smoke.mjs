import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/index.ts"],
  cwd: process.cwd(),
  env: process.env,
});

const client = new Client(
  { name: "twilio-sms-smoke", version: "0.1.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  const expectedTools = [
    "twilio_config_status",
    "twilio_get_message",
    "twilio_list_messages",
    "twilio_send_sms",
  ];

  for (const tool of expectedTools) {
    if (!toolNames.includes(tool)) {
      throw new Error(`Missing MCP tool: ${tool}`);
    }
  }

  const status = await client.callTool({
    name: "twilio_config_status",
    arguments: {},
  });
  const dryRun = await client.callTool({
    name: "twilio_send_sms",
    arguments: {
      to: "+15551234567",
      from: "+15557654321",
      body: "RUDI Twilio MCP dry run",
      confirm_send: false,
    },
  });

  const dryRunData = JSON.parse(dryRun.content[0].text);
  if (dryRunData.sent !== false || dryRunData.dry_run !== true) {
    throw new Error("Dry-run smoke call did not return dry_run=true");
  }

  console.log(JSON.stringify({
    ok: true,
    tools: toolNames,
    status: JSON.parse(status.content[0].text),
    dry_run: dryRunData,
  }, null, 2));
} finally {
  await client.close();
}
