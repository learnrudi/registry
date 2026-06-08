import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

export interface UnifiedPost {
  platform: string;
  id: string | null;
  url: string | null;
  title: string | null;
  description?: string | null;
  body?: string | null;
  hashtags: string[];
  created_at?: string | null;
  age_relative?: string | null;
  duration_seconds?: number | null;
  duration?: string | null;
  word_count?: number | null;
  metrics: Record<string, number | null>;
  transcript?: string | null;
  comments?: unknown[];
}

export interface PlatformExport {
  platform: string;
  post_count: number;
  posts: UnifiedPost[];
  error?: string;
}

export interface UnifiedExport {
  creator: string;
  audited_at: string;
  audit_source: string;
  profiles: Record<string, unknown>;
  platforms: Record<string, PlatformExport>;
  summary: {
    total_posts_captured: number;
    by_platform: Record<string, number>;
  };
}

export interface BuildUnifiedExportOptions {
  root: string;
  creatorSlug?: string;
  outputPrefix?: string;
}

export interface BuildUnifiedExportResult {
  root: string;
  jsonPath: string;
  csvPath: string;
  summary: UnifiedExport["summary"];
}

export interface FullAuditInventory {
  root: string;
  exists: boolean;
  platform_dirs: string[];
  files: Record<string, boolean>;
  counts: Record<string, number>;
  symlinks: Array<{ path: string; target_type: "file" | "directory" | "other" }>;
}

export interface ImportLegacyTikTokOptions {
  sourceDir: string;
  root: string;
  overwrite?: boolean;
}

export interface ImportLegacyTikTokResult {
  sourceDir: string;
  targetDir: string;
  copied: number;
  skipped: number;
  manifestPath: string;
}

export interface GenerateAuditDocumentsOptions {
  root: string;
  creatorSlug?: string;
  exportPath?: string;
}

export interface GenerateAuditDocumentsResult {
  root: string;
  platformRegistryPath: string;
  crossPlatformSnapshotPath: string;
  finalSynthesisPath: string;
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseViews(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value)
    .replace(/\s*views?\s*/i, "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return null;
  const suffix = cleaned.slice(-1).toUpperCase();
  const multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : 1;
  const numeric = multiplier === 1 ? Number(cleaned) : Number(cleaned.slice(0, -1));
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : null;
}

function extractHashtags(text: unknown): string[] {
  const matches = cleanText(text).matchAll(/#([\p{L}\p{N}_]+)/gu);
  return [...new Set([...matches].map((match) => match[1]))];
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function safeReadJson(path: string): any | null {
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function countFiles(dir: string, predicate: (name: string) => boolean): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(predicate).length;
}

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(predicate)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

function hasUnifiedExport(root: string, extension: "json" | "csv"): boolean {
  if (!existsSync(root)) return false;
  return readdirSync(root).some((name) => {
    const path = join(root, name);
    return name.endsWith(`-unified-export.${extension}`) && statSync(path).isFile();
  });
}

function flattenPosts(platforms: Record<string, PlatformExport>): UnifiedPost[] {
  return Object.values(platforms).flatMap((platform) => platform.posts);
}

function writeUnifiedCsv(path: string, posts: UnifiedPost[]) {
  const headers = [
    "platform",
    "id",
    "url",
    "title",
    "created_at",
    "views",
    "likes",
    "comments",
    "duration",
    "word_count",
    "hashtags",
    "transcript_or_body_excerpt",
  ];
  const rows = [
    headers.join(","),
    ...posts.map((post) => {
      const text = cleanText(post.transcript || post.body || post.description || "").slice(0, 500);
      return [
        post.platform,
        post.id,
        post.url,
        post.title,
        post.created_at || post.age_relative || "",
        post.metrics.views,
        post.metrics.likes,
        post.metrics.comments,
        post.duration_seconds ?? post.duration ?? "",
        post.word_count ?? "",
        post.hashtags.join(";"),
        text,
      ].map(csvEscape).join(",");
    }),
  ];
  writeFileSync(path, `${rows.join("\n")}\n`);
}

function loadTikTok(root: string): PlatformExport {
  const extractedDir = join(root, "tiktok", "extracted-videos");
  if (!existsSync(extractedDir)) {
    return { platform: "tiktok", post_count: 0, posts: [], error: "extracted-videos directory not found" };
  }
  const posts = listFiles(extractedDir, (name) => /^tiktok-.*\.json$/.test(name))
    .map((path) => safeReadJson(path))
    .filter(Boolean)
    .map((data: any): UnifiedPost => {
      const metadata = data.metadata || {};
      const title = cleanText(data.title || data.description).slice(0, 200) || null;
      return {
        platform: "tiktok",
        id: metadata.videoId ? String(metadata.videoId) : null,
        url: data.url || null,
        title,
        description: data.description || null,
        hashtags: Array.isArray(data.hashtags) ? data.hashtags : extractHashtags(`${data.title || ""} ${data.description || ""}`),
        created_at: metadata.createdAt || null,
        duration_seconds: Number.isFinite(Number(metadata.duration)) ? Number(metadata.duration) : null,
        metrics: {
          views: parseViews(metadata.views),
          likes: parseViews(metadata.likes),
          comments: parseViews(metadata.comments),
          shares: parseViews(metadata.shares),
          saves: parseViews(metadata.saves),
        },
        transcript: data.transcript || null,
        comments: Array.isArray(data.comments) ? data.comments : [],
      };
    });
  return { platform: "tiktok", post_count: posts.length, posts };
}

function extractMarkdownTranscript(markdown: string): string | null {
  const match = markdown.match(/## Transcript(?:\s*\([^)]*\))?\s*\n\n([\s\S]*?)(?:\n## |\n---\n|$)/i);
  return match ? match[1].trim() : null;
}

function loadYouTube(root: string): PlatformExport {
  const youtubeDir = join(root, "youtube");
  const catalogPath = join(youtubeDir, "catalog.json");
  if (!existsSync(catalogPath)) {
    return { platform: "youtube", post_count: 0, posts: [], error: "catalog.json not found" };
  }
  const catalog = safeReadJson(catalogPath);
  if (!Array.isArray(catalog)) {
    return { platform: "youtube", post_count: 0, posts: [], error: "catalog.json is not an array" };
  }
  const transcriptFiles = new Map<string, string>();
  for (const path of listFiles(join(youtubeDir, "transcripts"), (name) => name.startsWith("yt-") && name.endsWith(".md"))) {
    const match = basename(path).match(/^yt-([^-.]+)/);
    if (match) transcriptFiles.set(match[1], path);
  }
  const posts = catalog.map((video: any): UnifiedPost => {
    const id = video.id ? String(video.id) : null;
    const transcriptPath = id ? transcriptFiles.get(id) : null;
    const transcript = transcriptPath ? extractMarkdownTranscript(readFileSync(transcriptPath, "utf8")) : null;
    return {
      platform: "youtube",
      id,
      url: id ? `https://www.youtube.com/watch?v=${id}` : null,
      title: video.title || null,
      hashtags: extractHashtags(video.title),
      age_relative: video.age || null,
      duration: video.duration || null,
      metrics: {
        views: parseViews(video.views),
        likes: parseViews(video.likes),
        comments: parseViews(video.comments),
      },
      transcript,
    };
  });
  return { platform: "youtube", post_count: posts.length, posts };
}

function loadSubstack(root: string): PlatformExport {
  const substackDir = join(root, "substack");
  if (!existsSync(substackDir)) {
    return { platform: "substack", post_count: 0, posts: [], error: "substack directory not found" };
  }
  const posts = listFiles(substackDir, (name) => /^\d+-.*\.md$/.test(name)).map((path): UnifiedPost => {
    const content = readFileSync(path, "utf8");
    const title = content.match(/^\*\*Title:\*\*\s*(.+)$/m)?.[1]?.trim() || basename(path, ".md");
    const author = content.match(/^\*\*Author:\*\*\s*(.+)$/m)?.[1]?.trim() || null;
    const url = content.match(/^\*\*URL:\*\*\s*(.+)$/m)?.[1]?.trim() || null;
    const wordCount = Number(content.match(/^\*\*Words:\*\*\s*(\d+)/m)?.[1]);
    const body = content.split("\n---\n", 2)[1]?.trim() || content;
    return {
      platform: "substack",
      id: basename(path, ".md"),
      url,
      title,
      description: author,
      body,
      hashtags: extractHashtags(body),
      word_count: Number.isFinite(wordCount) ? wordCount : body.split(/\s+/).filter(Boolean).length,
      metrics: {
        views: null,
        likes: null,
        comments: null,
      },
    };
  });
  return { platform: "substack", post_count: posts.length, posts };
}

function loadLinkedIn(root: string): PlatformExport {
  const path = join(root, "linkedin", "posts-clean.json");
  if (!existsSync(path)) {
    return { platform: "linkedin", post_count: 0, posts: [], error: "posts-clean.json not found" };
  }
  const raw = safeReadJson(path);
  if (!Array.isArray(raw)) {
    return { platform: "linkedin", post_count: 0, posts: [], error: "posts-clean.json is not an array" };
  }
  const posts = raw.map((post: any): UnifiedPost => {
    const body = cleanText(post.body);
    const title = body ? body.split(".")[0].slice(0, 120).trim() : null;
    return {
      platform: "linkedin",
      id: post.urn || null,
      url: post.urn ? `https://www.linkedin.com/feed/update/${post.urn}/` : null,
      title,
      body: body.slice(0, 3000),
      hashtags: extractHashtags(body),
      age_relative: body.match(/(\d+[hdwmy])\s*[••]/)?.[1] || null,
      metrics: {
        views: null,
        likes: parseViews(post.like_count),
        comments: parseViews(post.comments),
        reposts: parseViews(post.reposts),
      },
    };
  });
  return { platform: "linkedin", post_count: posts.length, posts };
}

function readExistingProfiles(root: string): Record<string, unknown> {
  const existing = join(root, `${basename(root)}-unified-export.json`);
  const data = existsSync(existing) ? safeReadJson(existing) : null;
  return data?.profiles && typeof data.profiles === "object" ? data.profiles : {};
}

export function buildUnifiedExport(options: BuildUnifiedExportOptions): BuildUnifiedExportResult {
  const root = resolve(options.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`audit root not found: ${root}`);
  }
  const creatorSlug = options.creatorSlug || basename(root);
  const outputPrefix = options.outputPrefix || `${creatorSlug}-unified-export`;
  const platforms: Record<string, PlatformExport> = {
    tiktok: loadTikTok(root),
    youtube: loadYouTube(root),
    substack: loadSubstack(root),
    linkedin: loadLinkedIn(root),
  };
  const byPlatform = Object.fromEntries(
    Object.entries(platforms).map(([platform, data]) => [platform, data.post_count])
  );
  const total = Object.values(byPlatform).reduce((sum, count) => sum + count, 0);
  const exported: UnifiedExport = {
    creator: creatorSlug,
    audited_at: new Date().toISOString(),
    audit_source: root,
    profiles: readExistingProfiles(root),
    platforms,
    summary: {
      total_posts_captured: total,
      by_platform: byPlatform,
    },
  };
  const jsonPath = join(root, `${outputPrefix}.json`);
  const csvPath = join(root, `${outputPrefix}.csv`);
  writeFileSync(jsonPath, `${JSON.stringify(exported, null, 2)}\n`);
  writeUnifiedCsv(csvPath, flattenPosts(platforms));
  return { root, jsonPath, csvPath, summary: exported.summary };
}

function readUnifiedExportForDocs(options: GenerateAuditDocumentsOptions): UnifiedExport {
  const root = resolve(options.root);
  const creatorSlug = options.creatorSlug || basename(root);
  const exportPath = options.exportPath || join(root, `${creatorSlug}-unified-export.json`);
  if (!existsSync(exportPath)) {
    buildUnifiedExport({ root, creatorSlug });
  }
  return readJson(exportPath) as UnifiedExport;
}

function formatCount(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "unknown";
}

function topPostBy(posts: UnifiedPost[], metric: string): UnifiedPost | null {
  return [...posts]
    .filter((post) => Number.isFinite(Number(post.metrics[metric])))
    .sort((a, b) => Number(b.metrics[metric]) - Number(a.metrics[metric]))[0] || null;
}

function platformRegistryMarkdown(exported: UnifiedExport): string {
  const rows = Object.entries(exported.platforms).map(([platform, data]) =>
    `| ${platform} | ${data.post_count} | ${data.error ? `partial: ${data.error}` : "captured"} |`
  );
  return [
    `# ${exported.creator} Platform Registry`,
    "",
    `Generated: ${exported.audited_at}`,
    `Audit source: ${exported.audit_source}`,
    "",
    "| Platform | Captured Items | Status |",
    "|---|---:|---|",
    ...rows,
    "",
    "## Contract Notes",
    "",
    "- Counts are computed from local captured artifacts, not live platform APIs.",
    "- Missing platforms are reported as zero or partial instead of silently omitted.",
    "- Browser-only fields such as pinned posts, profile visuals, and some follower metrics require a separate capture layer.",
  ].join("\n") + "\n";
}

function crossPlatformSnapshotMarkdown(exported: UnifiedExport): string {
  const total = exported.summary.total_posts_captured;
  const rows = Object.entries(exported.summary.by_platform).map(([platform, count]) =>
    `| ${platform} | ${count} |`
  );
  return [
    `# ${exported.creator} Cross-Platform Snapshot`,
    "",
    `Generated: ${exported.audited_at}`,
    "",
    `Total captured content items: ${total}`,
    "",
    "| Platform | Items |",
    "|---|---:|",
    ...rows,
    "",
    "## Current Read",
    "",
    "- This snapshot is generated from the normalized local export.",
    "- Use it as the factual base before writing subjective strategy recommendations.",
  ].join("\n") + "\n";
}

function finalSynthesisMarkdown(exported: UnifiedExport): string {
  const tiktokTop = topPostBy(exported.platforms.tiktok?.posts || [], "views");
  const youtubeTop = topPostBy(exported.platforms.youtube?.posts || [], "views");
  const linkedinTop = topPostBy(exported.platforms.linkedin?.posts || [], "likes");
  const lines = [
    `# ${exported.creator} Final Synthesis`,
    "",
    `Generated: ${exported.audited_at}`,
    "",
    "## Evidence Base",
    "",
    `- Total captured items: ${exported.summary.total_posts_captured}`,
    ...Object.entries(exported.summary.by_platform).map(([platform, count]) => `- ${platform}: ${count}`),
    "",
    "## Top Signals",
    "",
    "### Top TikTok by views",
    "",
    tiktokTop ? `- ${formatCount(tiktokTop.metrics.views)} views: ${tiktokTop.title || tiktokTop.url}` : "- No TikTok posts captured.",
    "",
    "### Top YouTube by views",
    "",
    youtubeTop ? `- ${formatCount(youtubeTop.metrics.views)} views: ${youtubeTop.title || youtubeTop.url}` : "- No YouTube videos captured.",
    "",
    "### Top LinkedIn by likes",
    "",
    linkedinTop ? `- ${formatCount(linkedinTop.metrics.likes)} likes: ${linkedinTop.title || linkedinTop.url}` : "- No LinkedIn posts captured.",
    "",
    "## Engineering Notes",
    "",
    "- This synthesis is deterministic and evidence-based. It does not invent strategy beyond captured metrics.",
    "- Use human or LLM review on top of this file for deeper narrative recommendations.",
  ];
  return lines.join("\n") + "\n";
}

export function generateAuditDocuments(options: GenerateAuditDocumentsOptions): GenerateAuditDocumentsResult {
  const root = resolve(options.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`audit root not found: ${root}`);
  }
  const exported = readUnifiedExportForDocs(options);
  const platformRegistryPath = join(root, "PLATFORM-REGISTRY.md");
  const crossPlatformSnapshotPath = join(root, "CROSS-PLATFORM-SNAPSHOT.md");
  const finalSynthesisPath = join(root, "FINAL-SYNTHESIS.md");
  writeFileSync(platformRegistryPath, platformRegistryMarkdown(exported));
  writeFileSync(crossPlatformSnapshotPath, crossPlatformSnapshotMarkdown(exported));
  writeFileSync(finalSynthesisPath, finalSynthesisMarkdown(exported));
  return {
    root,
    platformRegistryPath,
    crossPlatformSnapshotPath,
    finalSynthesisPath,
  };
}

export function inspectFullAudit(rootInput: string): FullAuditInventory {
  const root = resolve(rootInput);
  const exists = existsSync(root);
  const platformDirs = exists
    ? readdirSync(root).filter((name) => {
      const path = join(root, name);
      return statSync(path).isDirectory() && ["tiktok", "youtube", "substack", "linkedin", "instagram", "twitter", "x"].includes(name);
    }).sort()
    : [];
  const symlinks: FullAuditInventory["symlinks"] = [];
  if (exists) {
    for (const platform of platformDirs) {
      const platformPath = join(root, platform);
      for (const name of readdirSync(platformPath)) {
        const path = join(platformPath, name);
        if (!lstatSync(path).isSymbolicLink()) continue;
        const stat = statSync(path);
        symlinks.push({
          path,
          target_type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
        });
      }
    }
  }
  return {
    root,
    exists,
    platform_dirs: platformDirs,
    files: {
      platform_registry: existsSync(join(root, "PLATFORM-REGISTRY.md")),
      cross_platform_snapshot: existsSync(join(root, "CROSS-PLATFORM-SNAPSHOT.md")),
      final_synthesis: existsSync(join(root, "FINAL-SYNTHESIS.md")),
      unified_export_json: hasUnifiedExport(root, "json"),
      unified_export_csv: hasUnifiedExport(root, "csv"),
    },
    counts: {
      tiktok_extract_json: countFiles(join(root, "tiktok", "extracted-videos"), (name) => /^tiktok-.*\.json$/.test(name)),
      youtube_catalog_rows: loadYouTube(root).post_count,
      substack_posts: loadSubstack(root).post_count,
      linkedin_posts: loadLinkedIn(root).post_count,
    },
    symlinks,
  };
}

export function importLegacyTikTokExtracts(options: ImportLegacyTikTokOptions): ImportLegacyTikTokResult {
  const sourceDir = resolve(options.sourceDir);
  const root = resolve(options.root);
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`sourceDir not found: ${sourceDir}`);
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`root not found: ${root}`);
  }
  const targetDir = join(root, "tiktok", "extracted-videos");
  mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  let skipped = 0;
  const copiedFiles: string[] = [];
  for (const sourcePath of listFiles(sourceDir, (name) =>
    /^tiktok-.*\.json$/.test(name) || /^analysis-.*\.csv$/.test(name) || ["master.json", "summary.csv"].includes(name)
  )) {
    const targetPath = join(targetDir, basename(sourcePath));
    if (existsSync(targetPath) && !options.overwrite) {
      skipped++;
      continue;
    }
    copyFileSync(sourcePath, targetPath);
    copied++;
    copiedFiles.push(targetPath);
  }
  const manifestPath = join(targetDir, "IMPORT-MANIFEST.json");
  writeFileSync(manifestPath, `${JSON.stringify({
    sourceDir,
    targetDir,
    copied,
    skipped,
    copiedFiles,
    importedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  return { sourceDir, targetDir, copied, skipped, manifestPath };
}
