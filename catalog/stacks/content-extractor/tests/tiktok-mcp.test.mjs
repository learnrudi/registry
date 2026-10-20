import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP accepts browser caption recovery and returns status with saved timing/raw evidence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tiktok-mcp-"));
  const mock = join(directory, "network.mjs");
  await writeFile(mock, `import { publicHttp } from ${JSON.stringify(new URL("../src/public-http.js", import.meta.url).href)};
  globalThis.fetch = async () => { throw new Error("Raw fetch is forbidden in this fixture"); };
  publicHttp.fetch = async (url) => {
    const page = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":{}}}}}</script>';
    const response = new Response(new URL(url).hostname === 'www.tiktok.com' ? page : "WEBVTT\\n\\n00:00.000 --> 00:01.000\\nFixture caption\\n");
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  };`);
  const client = new Client({ name: "tiktok-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "--import", mock, "src/index.ts", "--mcp"],
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stderr: "pipe",
  });
  t.after(() => client.close());
  await client.connect(transport);
  const listed = await client.listTools();
  const schema = listed.tools.find((tool) => tool.name === "extract_tiktok").inputSchema;
  assert.equal(schema.properties.caption_url.type, "string");
  const output = join(directory, "review.md");
  const result = await client.callTool({ name: "extract_tiktok", arguments: {
    url: "https://www.tiktok.com/@fixture/video/7350000000000000000",
    caption_url: "https://v16m-webapp.tiktokcdn-us.com/resource/?mime_type=video_mp4",
    output,
  } });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.status, "success");
  assert.equal(result.structuredContent.retrievalMethod, "supplied_caption");
  assert.match(result.content[0].text, /success/);
  assert.match(await readFile(output, "utf8"), /00:00:00.000/);
  const evidence = JSON.parse(await readFile(`${output}.json`, "utf8"));
  assert.equal(evidence.coverage.cueCount, 1);
  assert.match(evidence.rawVtt, /^WEBVTT/);
  assert.equal(evidence.segments[0].text, "Fixture caption");
  const absent = await client.callTool({ name: "extract_tiktok", arguments: {
    url: "https://www.tiktok.com/@fixture/video/7350000000000000000", output,
  } });
  assert.equal(absent.structuredContent.status, "captions_not_found");
  assert.equal(absent.structuredContent.hasTranscript, false);
  assert.match(await readFile(output, "utf8"), /does not establish that captions are absent/);
  const noCaptions = JSON.parse(await readFile(`${output}.json`, "utf8"));
  assert.equal(noCaptions.rawVtt, null);
  assert.equal(noCaptions.coverage.cueCount, 0);
});
