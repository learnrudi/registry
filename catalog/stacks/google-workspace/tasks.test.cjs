#!/usr/bin/env node
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  await testTaskRequestBuilders();
  await testTaskToolSchemas();
}

async function testTaskRequestBuilders() {
  const {
    buildTaskInsert,
    buildTaskList,
    buildTaskPatch,
    DEFAULT_TASKLIST_ID,
  } = await import("./src/tasks.ts");

  const insert = buildTaskInsert({
    tasklist_id: "team-list",
    title: "Follow up with Elena",
    notes: "Send onboarding checklist",
    due: "2026-06-17T00:00:00.000Z",
    parent: "parent-task",
    previous: "previous-task",
  });

  assert.equal(DEFAULT_TASKLIST_ID, "@default");
  assert.equal(insert.tasklist, "team-list");
  assert.equal(insert.parent, "parent-task");
  assert.equal(insert.previous, "previous-task");
  assert.deepEqual(insert.requestBody, {
    title: "Follow up with Elena",
    notes: "Send onboarding checklist",
    due: "2026-06-17T00:00:00.000Z",
  });

  const list = buildTaskList({
    tasklist_id: "team-list",
    max_results: 25,
    next_page_token: "next-page",
    show_completed: false,
    show_hidden: true,
    due_min: "2026-06-16T00:00:00.000Z",
  });

  assert.deepEqual(list, {
    tasklist: "team-list",
    maxResults: 25,
    pageToken: "next-page",
    showCompleted: false,
    showHidden: true,
    dueMin: "2026-06-16T00:00:00.000Z",
  });

  const patch = buildTaskPatch({
    tasklist_id: "team-list",
    task_id: "task-123",
    title: "Updated title",
    status: "completed",
  });

  assert.equal(patch.tasklist, "team-list");
  assert.equal(patch.task, "task-123");
  assert.deepEqual(patch.requestBody, {
    title: "Updated title",
    status: "completed",
  });

  assert.throws(
    () => buildTaskInsert({ title: "Invalid", due: "tomorrow" }),
    /due must be an RFC 3339 datetime/
  );
  assert.throws(
    () => buildTaskPatch({ task_id: "task-123", status: "done" }),
    /status must be one of: needsAction, completed/
  );
}

async function testTaskToolSchemas() {
  const stateDir = mkdtempSync(path.join(tmpdir(), "google-workspace-task-tools-"));
  const client = new Client(
    { name: "google-workspace-task-test", version: "0.0.0" },
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

    for (const name of [
      "tasks_tasklists_list",
      "tasks_list",
      "tasks_create",
      "tasks_update",
      "tasks_complete",
      "tasks_delete",
    ]) {
      assert(byName[name], `${name} must be exposed`);
      assert(byName[name].inputSchema.properties.account, `${name} must support account`);
    }

    assert(byName.tasks_list.inputSchema.properties.tasklist_id);
    assert(byName.tasks_list.inputSchema.properties.show_completed);
    assert(byName.tasks_create.inputSchema.properties.due);
    assert(byName.tasks_create.inputSchema.required.includes("title"));
    assert(byName.tasks_update.inputSchema.properties.status);
    assert(byName.tasks_update.inputSchema.required.includes("task_id"));
    assert(byName.tasks_complete.inputSchema.required.includes("task_id"));
  } finally {
    await client.close();
    rmSync(stateDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
