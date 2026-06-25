/**
 * AI enrichment — calls an agent CLI to extract metadata from transcripts.
 */

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { getConfig } from "./config.js";

export interface EnrichmentResult {
  title?: string;
  summary?: string;
  tags?: string[];
  keywords?: string[];
  people?: string[];
  topics?: string[];
  sentiment?: string;
  action_items?: string[];
  enriched_at?: string;
}

function buildPrompt(template: string, record: Record<string, any>): string {
  return template
    .replace("{{date}}", record.date || "unknown")
    .replace("{{duration}}", record.duration_formatted || "unknown")
    .replace("{{transcript}}", record.transcript || "");
}

function callAgent(prompt: string, model: string, command: string[]): Record<string, any> {
  const cmd = command.map(part =>
    part.replace("{prompt}", prompt).replace("{model}", model)
  );

  const [bin, ...args] = cmd;
  const result = execFileSync(bin, args, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }).toString();

  // Parse response — handle Claude CLI wrapper format
  let parsed = JSON.parse(result);
  if (typeof parsed === "object" && parsed !== null && "result" in parsed) {
    parsed = parsed.result;
  }

  // Extract JSON from string content
  if (typeof parsed === "string") {
    const start = parsed.indexOf("{");
    const end = parsed.lastIndexOf("}") + 1;
    if (start >= 0 && end > start) {
      return JSON.parse(parsed.slice(start, end));
    }
    throw new Error("No JSON found in agent response");
  }

  return parsed;
}

export async function enrich(jsonPath: string): Promise<EnrichmentResult> {
  const cfg = getConfig();
  const record = JSON.parse(readFileSync(jsonPath, "utf-8"));

  if (record.enriched_at) {
    return { enriched_at: record.enriched_at };
  }
  if (!record.transcript) {
    throw new Error("No transcript to enrich");
  }
  if (!cfg.agent.prompt_template) {
    throw new Error("No prompt template configured. Ensure agents/enricher/prompt.md exists.");
  }

  const prompt = buildPrompt(cfg.agent.prompt_template, record);
  const enrichment = callAgent(prompt, cfg.agent.model, cfg.agent.command);

  // Merge and save
  const updated = { ...record, ...enrichment, enriched_at: new Date().toISOString() };
  writeFileSync(jsonPath, JSON.stringify(updated, null, 2));

  return {
    title: enrichment.title,
    summary: enrichment.summary,
    tags: enrichment.tags,
    keywords: enrichment.keywords,
    people: enrichment.people,
    topics: enrichment.topics,
    sentiment: enrichment.sentiment,
    action_items: enrichment.action_items,
    enriched_at: updated.enriched_at,
  };
}
