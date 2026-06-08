#!/usr/bin/env node
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  await testCalendarEventBuilder();
  await testCalendarCreateExportUsesSharedBuilder();
  await testCalendarToolSchemas();
}

async function testCalendarEventBuilder() {
  const { buildCalendarEventInsert } = await import("./src/calendar.ts");
  const insert = buildCalendarEventInsert({
    calendar_id: "rudi@learnrudi.com",
    summary: "Elena intro",
    start: "2026-06-02T15:00:00-04:00",
    end: "2026-06-02T15:30:00-04:00",
    time_zone: "America/New_York",
    description: "Discuss setup",
    location: "Google Meet",
    attendees: ["elena@example.com", "brandon@example.com"],
    create_meet: true,
    send_updates: "all",
  });

  assert.equal(insert.calendarId, "rudi@learnrudi.com");
  assert.equal(insert.conferenceDataVersion, 1);
  assert.equal(insert.sendUpdates, "all");
  assert.deepEqual(insert.requestBody.attendees, [
    { email: "elena@example.com" },
    { email: "brandon@example.com" },
  ]);
  assert.equal(insert.requestBody.conferenceData?.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.match(insert.requestBody.conferenceData?.createRequest.requestId || "", /^rudi-/);
  assert.equal(insert.requestBody.start.timeZone, "America/New_York");
  assert.equal(insert.requestBody.end.timeZone, "America/New_York");
}

async function testCalendarCreateExportUsesSharedBuilder() {
  const source = require("node:fs").readFileSync("./src/index.ts", "utf8");
  const exportStart = source.indexOf("export async function calendarCreate");
  assert(exportStart >= 0, "calendarCreate export must exist");
  const exportBody = source.slice(exportStart, source.indexOf("// Only start MCP", exportStart));
  assert(
    exportBody.includes("buildCalendarEventInsert(options)"),
    "calendarCreate export must use the same event builder as the MCP handler"
  );
  assert(
    exportBody.includes("meetLink"),
    "calendarCreate export must return Meet link metadata when Google provides it"
  );
}

async function testCalendarToolSchemas() {
  const stateDir = mkdtempSync(path.join(tmpdir(), "google-workspace-calendar-tools-"));
  const client = new Client(
    { name: "google-workspace-calendar-test", version: "0.0.0" },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    cwd: process.cwd(),
    env: { RUDI_STACK_STATE_DIR: stateDir },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const createProps = byName.calendar_create.inputSchema.properties;

    for (const field of [
      "calendar_id",
      "account",
      "attendees",
      "create_meet",
      "send_updates",
      "time_zone",
    ]) {
      assert(createProps[field], `calendar_create must expose ${field}`);
    }

    for (const name of ["calendar_list", "calendar_quick_add", "calendar_delete"]) {
      assert(byName[name].inputSchema.properties.calendar_id, `${name} must support calendar_id`);
      assert(byName[name].inputSchema.properties.account, `${name} must support account`);
    }
  } finally {
    await client.close();
    rmSync(stateDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
