#!/usr/bin/env node
/**
 * Document QA MCP
 * Screenshots HTML documents and inspects the rendered pages with Claude Vision.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, join, resolve } from "path";
import { homedir } from "os";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(join(__dirname, "..", ".env")) });

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

type JsonRecord = Record<string, unknown>;

export interface InspectionIssue {
  page: number;
  type: string;
  severity: "error" | "warning" | "info";
  description: string;
  location?: string;
  expected?: string;
  found?: string;
}

export interface InspectionResult {
  issues: InspectionIssue[];
  summary: string;
  passedChecks: string[];
}

interface InspectArgs {
  htmlPath: string;
  expectedData: JsonRecord;
  checks: string[];
  outputDir?: string;
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object.");
  }
  return value as JsonRecord;
}

function stringField(args: JsonRecord, field: string): string {
  const value = args[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return value;
}

function optionalStringField(args: JsonRecord, field: string): string | undefined {
  const value = args[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid optional string field: ${field}`);
  }
  return value;
}

function objectField(args: JsonRecord, field: string): JsonRecord {
  const value = args[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Missing required object field: ${field}`);
  }
  return value as JsonRecord;
}

function stringArrayField(args: JsonRecord, field: string): string[] {
  const value = args[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid optional string array field: ${field}`);
  }
  return value;
}

function parseInspectArgs(rawArgs: unknown): InspectArgs {
  const args = asRecord(rawArgs);
  return {
    htmlPath: stringField(args, "html_path"),
    expectedData: objectField(args, "expected_data"),
    checks: stringArrayField(args, "checks"),
    outputDir: optionalStringField(args, "output_dir"),
  };
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for document QA.");
  }
  return new Anthropic({ apiKey });
}

function extractTextContent(response: Anthropic.Messages.Message): string {
  const textBlocks = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text);
  return textBlocks.join("\n").trim();
}

function parseInspectionJson(text: string): {
  issues: Array<Omit<InspectionIssue, "page">>;
  passedChecks: string[];
} {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      issues: [{
        type: "invalid_model_response",
        severity: "error",
        description: "Claude did not return a JSON inspection payload.",
        found: text.slice(0, 500),
      }],
      passedChecks: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as JsonRecord;
    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const issues = rawIssues
      .filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item): Omit<InspectionIssue, "page"> => {
        const severity: InspectionIssue["severity"] =
          item.severity === "warning" || item.severity === "info" ? item.severity : "error";

        return {
          type: typeof item.type === "string" ? item.type : "unspecified",
          severity,
          description: typeof item.description === "string" ? item.description : "Issue reported without a description.",
          location: typeof item.location === "string" ? item.location : undefined,
          expected: typeof item.expected === "string" ? item.expected : undefined,
          found: typeof item.found === "string" ? item.found : undefined,
        };
      });

    const passedChecks = Array.isArray(parsed.passedChecks)
      ? parsed.passedChecks.filter((item): item is string => typeof item === "string")
      : [];

    return { issues, passedChecks };
  } catch (error) {
    return {
      issues: [{
        type: "invalid_model_response",
        severity: "error",
        description: "Claude returned malformed JSON.",
        found: error instanceof Error ? error.message : String(error),
      }],
      passedChecks: [],
    };
  }
}

export async function screenshotHtmlPages(htmlPath: string, outputDir: string): Promise<string[]> {
  const resolvedHtmlPath = resolve(htmlPath);
  if (!existsSync(resolvedHtmlPath)) {
    throw new Error(`HTML file not found: ${resolvedHtmlPath}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${resolvedHtmlPath}`, { waitUntil: "networkidle" });

    const artboards = await page.$$(".artboard");
    const screenshots: string[] = [];

    if (artboards.length > 0) {
      for (let i = 0; i < artboards.length; i++) {
        const screenshotPath = join(outputDir, `page-${String(i + 1).padStart(2, "0")}.png`);
        await artboards[i].scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        await artboards[i].screenshot({ path: screenshotPath });
        screenshots.push(screenshotPath);
      }
      return screenshots;
    }

    const screenshotPath = join(outputDir, "page-01.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return [screenshotPath];
  } finally {
    await browser.close();
  }
}

export async function inspectDocumentPages(
  screenshots: string[],
  expectedData: JsonRecord,
  checks: string[],
  client: Anthropic = getAnthropicClient(),
  model: string = DEFAULT_MODEL,
): Promise<InspectionResult> {
  const issues: InspectionIssue[] = [];
  const passedChecks: string[] = [];

  for (let i = 0; i < screenshots.length; i++) {
    const imageData = readFileSync(screenshots[i]);
    const base64Image = imageData.toString("base64");

    const checksPrompt = checks.length > 0
      ? `Specific checks to perform:\n${checks.map((check, idx) => `${idx + 1}. ${check}`).join("\n")}`
      : "No additional checks were provided.";

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Image,
            },
          },
          {
            type: "text",
            text: `You are a document QA inspector. Analyze page ${i + 1} of ${screenshots.length}.

Expected data:
${JSON.stringify(expectedData, null, 2)}

${checksPrompt}

Check for text mismatches, table math errors, broken images, content overflow, formatting inconsistencies, and missing or incorrect data.

Return only a JSON object with this structure:
{
  "issues": [
    {
      "type": "text_mismatch | table_math_error | broken_image | overflow | formatting | missing_data",
      "severity": "error | warning | info",
      "description": "Clear description of the issue",
      "location": "Where on the page",
      "expected": "What was expected, if applicable",
      "found": "What was actually found, if applicable"
    }
  ],
  "passedChecks": ["List of checks that passed"]
}`,
          },
        ],
      }],
    });

    const payload = parseInspectionJson(extractTextContent(response));
    issues.push(...payload.issues.map((issue) => ({ ...issue, page: i + 1 })));
    passedChecks.push(...payload.passedChecks);
  }

  const summary = issues.length === 0
    ? `All ${screenshots.length} page(s) passed inspection.`
    : `Found ${issues.length} issue(s) across ${screenshots.length} page(s).`;

  return { issues, summary, passedChecks };
}

async function runInspection(rawArgs: unknown): Promise<{
  summary: string;
  issues: InspectionIssue[];
  passedChecks: string[];
  screenshots: string[];
}> {
  const args = parseInspectArgs(rawArgs);
  const outputDir = args.outputDir
    ? resolve(args.outputDir)
    : join(homedir(), ".rudi", "document-qa", basename(args.htmlPath, ".html"));

  const screenshots = await screenshotHtmlPages(args.htmlPath, outputDir);
  const result = await inspectDocumentPages(screenshots, args.expectedData, args.checks);

  return {
    summary: result.summary,
    issues: result.issues,
    passedChecks: result.passedChecks,
    screenshots,
  };
}

function createServer(): Server {
  const server = new Server(
    { name: "document-qa", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "document_qa_inspect",
        description: "Screenshot an HTML document and inspect rendered pages with Claude Vision.",
        inputSchema: {
          type: "object",
          properties: {
            html_path: {
              type: "string",
              description: "Path to the HTML file to inspect.",
            },
            expected_data: {
              type: "object",
              description: "Expected values or facts to validate against.",
            },
            checks: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of specific checks to perform.",
            },
            output_dir: {
              type: "string",
              description: "Optional directory for generated screenshots.",
            },
          },
          required: ["html_path", "expected_data"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;

    try {
      if (name !== "document_qa_inspect") {
        throw new Error(`Unknown tool: ${name}`);
      }

      const result = await runInspection(rawArgs);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
