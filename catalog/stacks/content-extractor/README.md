# Content Extractor

RUDI MCP stack for extracting useful text from URLs.

## Tools

| Tool | Purpose |
| --- | --- |
| `extract_youtube` | Extract YouTube metadata and transcript when captions are available. |
| `extract_reddit` | Extract a Reddit post, top comments, and bounded threaded replies. |
| `extract_tiktok` | Extract TikTok captions/transcript when available. |
| `extract_article` | Extract clean article text with Readability and markdown output. |
| `extract_github` | Extract GitHub repositories, files, gists, and releases; binary release assets are classified without download. |
| `extract_links` | Extract and categorize page links as markdown, JSON, or CSV. |
| `extract_batch` | Extract URL arrays, metadata items, or CSV rows into deduped per-link artifact folders, a manifest, a CSV report, and JSONL results. |

## Install

```bash
rudi install stack:content-extractor
rudi integrate claude
```

Installed stacks run from `~/.rudi/stacks/content-extractor`.
The stack declares `playwright` and `tesseract` binaries so RUDI-managed installs
can provide the browser CLI and OCR classifier used by optional screenshot
fallback. Local development can also set `RUDI_PLAYWRIGHT_BIN` /
`PLAYWRIGHT_BIN` and `RUDI_TESSERACT_BIN` / `TESSERACT_BIN` to existing
binaries.

## Local Development

```bash
npm install
npm test
npm run build
npx tsx src/index.ts links https://example.com
npx tsx src/index.ts https://github.com/openai/openai-node
```

To compare capture providers for a difficult URL:

```bash
npm run build
node scripts/browser-provider-probe.mjs \
  --url https://openai.com/index/introducing-genebench-pro \
  --expected-text "Introducing GeneBench-Pro"
```

The probe writes `probe_report.json` plus per-provider screenshots where a
provider can capture an image. The default providers are non-interactive:
`fetch`, `rudi_playwright`, `playwright_chromium_cli`, and
`playwright_chrome_channel`. Add `user_chrome_osascript` explicitly when the
probe should drive the local macOS Chrome app.

The MCP server runs on stdio:

```bash
npx tsx src/index.ts --mcp
```

## Notes

- YouTube transcript extraction is most reliable with `SUPA_DATA_API`
  configured. Without it, the stack falls back to public no-key methods that
  may return video metadata with `hasTranscript: false` when YouTube blocks or
  changes caption access.
- Reddit uses old Reddit HTML as the primary no-credential path for direct post
  extraction, then falls back to public JSON and optional OAuth if configured.
  Browser login and Reddit API credentials are not required for the primary
  path. By default, Reddit output includes top-level comments plus direct
  replies (`max_depth: 2`); use `max_depth: 1` for only top-level comments.
- TikTok extraction depends on TikTok page data and captions being available.
  Videos without public captions return metadata with `hasTranscript: false`;
  challenged or removed TikTok pages can fail before metadata is available.
- GitHub repository extraction uses the GitHub API for metadata and raw content
  for README/file bodies. Set `GITHUB_TOKEN` in the environment when higher
  GitHub API rate limits are needed; it is optional and not declared as a
  required stack secret.
- Batch extraction accepts `urls`, `items`, or `csv_path`. It validates URLs,
  deduplicates normalized URLs before fetching, and records per-row duplicates
  in `batch_report.csv`.
- Batch outputs include `links/<item-id>/source.json`, `result.json`,
  `content.md` when content exists, and `error.json` when extraction fails.
  Blocked/rate-limited fetches are classified as `blocked`, `rate_limited`, or
  `fetch_failed` instead of being collapsed into generic `error`.
- Playwright browser screenshot fallback is disabled until browser egress is
  guarded. Existing `browser_fallback` arguments remain accepted for compatibility;
  failed rows retain their original extraction status and record
  `browserFallback.status: "unavailable"` with the security reason. No browser is
  launched and no screenshot is produced.
- URL arguments are validated as HTTP(S) URLs before network requests.

## Public network boundary

Generic article/link requests, public YouTube/TikTok page/caption fetches and raw
GitHub text downloads accept only public HTTP(S) destinations without URL
credentials. All DNS answers must be public; the selected address is pinned at
connect while retaining hostname certificate validation. Every redirect is vetted
again (maximum five). Responses have a 5 MiB streamed-byte cap and a 15-second total
DNS/request/body timeout. Compressed responses are rejected after requesting
identity encoding. Missing or dishonest Content-Length cannot bypass the cap.

GitHub bearer credentials are attached only to the exact `https://api.github.com`
origin, with redirects refused; raw GitHub/gist origins receive no API bearer.
This changes private raw-content access: use a dedicated authenticated GitHub tool
when raw files require credentials.

The public transport guarantee does not cover the separate `youtube-transcript`
library, fixed-origin authenticated provider API implementations, or manually run
browser-provider diagnostic scripts. The production batch browser fallback is
disabled because a generic browser can request private redirects/subresources.
