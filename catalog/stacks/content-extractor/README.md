# Content Extractor

RUDI MCP stack for extracting useful text from URLs.

## Tools

| Tool | Purpose |
| --- | --- |
| `extract_youtube` | Extract YouTube metadata and transcript when captions are available. |
| `extract_reddit` | Extract a Reddit post and threaded comments. |
| `extract_tiktok` | Extract TikTok captions/transcript when available. |
| `extract_article` | Extract clean article text with Readability and markdown output. |
| `extract_links` | Extract and categorize page links as markdown, JSON, or CSV. |

## Install

```bash
rudi install stack:content-extractor
rudi integrate claude
```

Installed stacks run from `~/.rudi/stacks/content-extractor`.

## Local Development

```bash
npm install
npm run build
npx tsx src/index.ts links https://example.com
```

The MCP server runs on stdio:

```bash
npx tsx src/index.ts --mcp
```

## Notes

- YouTube can use `SUPA_DATA_API` when configured; otherwise it falls back to
  local transcript methods.
- TikTok extraction depends on TikTok page data and captions being available.
- URL arguments are validated as HTTP(S) URLs before network requests.
