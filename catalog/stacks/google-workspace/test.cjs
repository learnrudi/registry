#!/usr/bin/env node
/**
 * Live smoke test for Google Workspace API access.
 */
const { google } = require("googleapis");
const assert = require("node:assert/strict");
const {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const STATE_DIR =
  process.env.RUDI_STACK_STATE_DIR ||
  path.join(homedir(), ".rudi", "state", "stacks", "google-workspace");

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function loadTokenData() {
  const state = readJsonIfExists(path.join(STATE_DIR, "state.json"));
  if (state?.currentAccount) {
    const accountToken = readJsonIfExists(
      path.join(STATE_DIR, "accounts", state.currentAccount, "token.json")
    );
    if (accountToken) return accountToken;
  }

  const defaultToken = readJsonIfExists(path.join(STATE_DIR, "token.json"));
  if (defaultToken) return defaultToken;

  throw new Error(`No Google token found in RUDI state: ${STATE_DIR}`);
}

function loadOAuthClientConfig(tokenData) {
  if (tokenData.client_id && tokenData.client_secret) {
    return tokenData;
  }

  const secret = process.env.GOOGLE_CREDENTIALS?.trim();
  if (!secret) {
    throw new Error("Token is missing OAuth client credentials. Set GOOGLE_CREDENTIALS.");
  }

  const credentials = secret.startsWith("{")
    ? JSON.parse(secret)
    : JSON.parse(readFileSync(secret, "utf-8"));
  const config = credentials.installed || credentials.web;
  if (!config?.client_id || !config?.client_secret) {
    throw new Error("GOOGLE_CREDENTIALS must include installed or web client credentials.");
  }
  return config;
}

async function connectMcpClient() {
  const client = new Client(
    { name: "google-workspace-smoke-test", version: "0.0.0" },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  await client.connect(transport);
  return client;
}

async function callJsonTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text || "";
  assert.equal(result.isError, undefined, `${name} failed: ${text}`);
  return JSON.parse(text);
}

async function test() {
  console.log("=== Google Workspace TS MCP Test ===\n");

  const tokenData = loadTokenData();
  const clientConfig = loadOAuthClientConfig(tokenData);
  const client = await connectMcpClient();
  const cleanupFileIds = [];
  const tempDir = mkdtempSync(path.join(tmpdir(), "google-workspace-smoke-"));

  const oauth2Client = new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret
  );
  oauth2Client.setCredentials({
    access_token: tokenData.token,
    refresh_token: tokenData.refresh_token,
    expiry_date: tokenData.expiry ? new Date(tokenData.expiry).getTime() : undefined,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  try {
  // Test Gmail
  console.log("1. Gmail - List recent emails:");
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const messages = await gmail.users.messages.list({
    userId: "me",
    maxResults: 3,
  });
  for (const msg of messages.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: "me", id: msg.id });
    const subject = full.data.payload?.headers?.find(h => h.name === "Subject")?.value;
    console.log(`   - ${subject || "(no subject)"}`);
  }

  // Test Calendar
  console.log("\n2. Calendar - Upcoming events:");
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const events = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: 3,
    singleEvents: true,
    orderBy: "startTime",
  });
  (events.data.items || []).forEach(e => {
    const start = e.start?.dateTime || e.start?.date;
    console.log(`   - ${e.summary} (${start})`);
  });

  // Test Drive
  console.log("\n3. Drive - Recent files:");
  const files = await drive.files.list({
    pageSize: 3,
    fields: "files(id, name, mimeType)",
  });
  (files.data.files || []).forEach(f => {
    console.log(`   - ${f.name}`);
  });

  console.log("\n4. Drive - Create folder:");
  const folderName = `RUDI_Create_Folder_${Date.now()}`;
  const folder = await callJsonTool(client, "drive_create_folder", {
    name: folderName,
  });
  cleanupFileIds.push(folder.id);
  assert(folder.id, "created folder must include id");
  assert.equal(folder.name, folderName);
  assert.equal(folder.mimeType, "application/vnd.google-apps.folder");
  console.log(`   Created: ${folder.name} (${folder.id})`);

  console.log("\n5. Drive - Move file:");
  const destFolder = await callJsonTool(client, "drive_create_folder", {
    name: `RUDI_Move_Dest_${Date.now()}`,
  });
  cleanupFileIds.push(destFolder.id);

  const uploadPath = path.join(tempDir, "move-source.txt");
  const fileContents = `move smoke test ${Date.now()}\n`;
  writeFileSync(uploadPath, fileContents, "utf-8");
  const uploaded = await drive.files.create({
    requestBody: {
      name: `RUDI_Move_Source_${Date.now()}.txt`,
      parents: [folder.id],
    },
    media: {
      mimeType: "text/plain",
      body: createReadStream(uploadPath),
    },
    fields: "id, name, parents",
  });
  cleanupFileIds.unshift(uploaded.data.id);

  const moved = await callJsonTool(client, "drive_move_file", {
    file_id: uploaded.data.id,
    new_parent_id: destFolder.id,
  });
  assert(moved.parents.includes(destFolder.id), "moved file must include destination parent");
  assert(!moved.parents.includes(folder.id), "moved file must not include source parent");
  console.log(`   Moved: ${uploaded.data.name} -> ${destFolder.name}`);

  console.log("\n6. Drive - Download file:");
  const downloadPath = path.join(tempDir, "downloaded.txt");
  const downloaded = await callJsonTool(client, "drive_download", {
    file_id: uploaded.data.id,
    output_path: downloadPath,
  });
  assert.equal(downloaded.path, downloadPath);
  assert.equal(downloaded.bytes, Buffer.byteLength(fileContents));
  assert.equal(statSync(downloadPath).size, downloaded.bytes);
  assert.equal(readFileSync(downloadPath, "utf-8"), fileContents);
  console.log(`   Downloaded ${downloaded.bytes} bytes`);

  console.log("\n✓ All tests passed!");
  } finally {
    for (const fileId of cleanupFileIds) {
      try {
        await drive.files.delete({ fileId });
      } catch (error) {
        console.error(`Cleanup failed for ${fileId}: ${error.message}`);
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
    await client.close();
  }
}

test().catch((error) => {
  console.error(error);
  process.exit(1);
});
