import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildUnifiedExport, generateAuditDocuments, inspectFullAudit } from "../src/full-audit.js";

test("buildUnifiedExport normalizes supported platform artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "creator-full-audit-"));
  mkdirSync(join(root, "tiktok", "extracted-videos"), { recursive: true });
  mkdirSync(join(root, "youtube", "transcripts"), { recursive: true });
  mkdirSync(join(root, "substack"), { recursive: true });
  mkdirSync(join(root, "linkedin"), { recursive: true });

  writeFileSync(join(root, "tiktok", "extracted-videos", "tiktok-123.json"), JSON.stringify({
    url: "https://www.tiktok.com/@fixture/video/123",
    title: "TikTok fixture #ai",
    description: "TikTok body #ai",
    hashtags: ["ai"],
    transcript: "TikTok transcript",
    comments: [{ text: "nice" }],
    metadata: {
      videoId: "123",
      createdAt: "2026-01-01T00:00:00.000Z",
      views: 1000,
      likes: 100,
      comments: 10,
      shares: 5,
      saves: 2,
      duration: 42,
    },
  }));
  writeFileSync(join(root, "youtube", "catalog.json"), JSON.stringify([
    { id: "abc", title: "YouTube fixture #mcp", views: "1.2K views", duration: "3:21" },
  ]));
  writeFileSync(join(root, "youtube", "transcripts", "yt-abc.md"), [
    "# Transcript",
    "",
    "## Transcript",
    "",
    "YouTube transcript body",
  ].join("\n"));
  writeFileSync(join(root, "substack", "01-post.md"), [
    "**Title:** Substack Fixture",
    "**Author:** Test Author",
    "**URL:** https://example.com/post",
    "**Words:** 9",
    "",
    "---",
    "",
    "Substack body #newsletter",
  ].join("\n"));
  writeFileSync(join(root, "linkedin", "posts-clean.json"), JSON.stringify([
    { urn: "urn:li:activity:1", body: "LinkedIn body #b2b", like_count: 7, comments: 2, reposts: 1 },
  ]));

  const result = buildUnifiedExport({ root, creatorSlug: "fixture" });
  const exportJson = JSON.parse(readFileSync(result.jsonPath, "utf8"));
  const csv = readFileSync(result.csvPath, "utf8");

  assert.equal(result.summary.total_posts_captured, 4);
  assert.deepEqual(result.summary.by_platform, {
    tiktok: 1,
    youtube: 1,
    substack: 1,
    linkedin: 1,
  });
  assert.equal(exportJson.platforms.tiktok.posts[0].metrics.views, 1000);
  assert.equal(exportJson.platforms.youtube.posts[0].metrics.views, 1200);
  assert.match(exportJson.platforms.youtube.posts[0].transcript, /YouTube transcript body/);
  assert.match(csv, /^platform,id,url,title/m);
  assert.match(csv, /TikTok transcript/);
});

test("generateAuditDocuments writes deterministic full-audit markdown", () => {
  const root = mkdtempSync(join(tmpdir(), "creator-full-docs-"));
  mkdirSync(join(root, "tiktok", "extracted-videos"), { recursive: true });
  mkdirSync(join(root, "youtube"), { recursive: true });
  mkdirSync(join(root, "substack"), { recursive: true });
  mkdirSync(join(root, "linkedin"), { recursive: true });

  writeFileSync(join(root, "tiktok", "extracted-videos", "tiktok-999.json"), JSON.stringify({
    url: "https://www.tiktok.com/@fixture/video/999",
    title: "Top TikTok",
    transcript: "Top TikTok transcript",
    metadata: { videoId: "999", views: 9000, likes: 900 },
  }));
  writeFileSync(join(root, "youtube", "catalog.json"), JSON.stringify([
    { id: "yt1", title: "YouTube One", views: "500 views", duration: "1:00" },
  ]));
  writeFileSync(join(root, "substack", "01-one.md"), [
    "**Title:** Substack One",
    "",
    "---",
    "",
    "Substack body",
  ].join("\n"));
  writeFileSync(join(root, "linkedin", "posts-clean.json"), JSON.stringify([
    { urn: "urn:li:activity:2", body: "LinkedIn one", like_count: 3 },
  ]));
  buildUnifiedExport({ root, creatorSlug: "fixture" });

  const docs = generateAuditDocuments({ root, creatorSlug: "fixture" });
  const registry = readFileSync(docs.platformRegistryPath, "utf8");
  const snapshot = readFileSync(docs.crossPlatformSnapshotPath, "utf8");
  const synthesis = readFileSync(docs.finalSynthesisPath, "utf8");

  assert.match(registry, /fixture Platform Registry/);
  assert.match(snapshot, /Total captured content items: 4/);
  assert.match(synthesis, /Top TikTok by views/);
  assert.match(synthesis, /Top TikTok/);
});

test("inspectFullAudit detects existing unified exports that do not match folder name", () => {
  const root = mkdtempSync(join(tmpdir(), "creator-full-inventory-"));
  mkdirSync(join(root, "tiktok"), { recursive: true });
  writeFileSync(join(root, "custom-unified-export.json"), "{}\n");
  writeFileSync(join(root, "custom-unified-export.csv"), "platform,id\n");

  const inventory = inspectFullAudit(root);

  assert.equal(inventory.files.unified_export_json, true);
  assert.equal(inventory.files.unified_export_csv, true);
});
