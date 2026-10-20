# Content Extractor

RUDI MCP stack for extracting useful text from URLs.

## Tools

| Tool | Purpose |
| --- | --- |
| `extract_youtube` | Extract YouTube metadata and transcript when captions are available. |
| `extract_reddit` | Extract a Reddit post, top comments, and bounded threaded replies. |
| `extract_tiktok` | Extract TikTok page captions or an explicitly supplied browser-discovered caption resource, with timing and raw evidence. |
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
- TikTok extraction returns `status: success` only after parsing nonempty WebVTT
  cues. `captions_not_found` means the initial page contained no caption tracks;
  it does not prove that captions do not exist. HTTP, page parsing, identity,
  network and caption validation failures are errors, not empty successes.
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

## TikTok browser recovery and evidence

When the initial page is incomplete or blocked, inspect the exact video in the
host's browser. Resolve its canonical `/@creator/video/id` URL, then inspect
page caption metadata or caption network requests. A caption resource can have
no `.vtt` suffix and can misleadingly advertise `mime_type=video_mp4`; the stack
validates its WebVTT body. Do not infer a resource URL or associate it with a
video solely because its host looks right.

Call MCP `extract_tiktok` with `url` set to that canonical video URL and optional
`caption_url` set to the exact observed caption resource. This bypasses the
initial-page fetch and labels `retrievalMethod: supplied_caption`. The operator
must verify the video/resource association; the stack cannot independently
prove it. The API equivalent is
`extractTikTok(videoUrl, "eng", { captionUrl: observedCaptionUrl })`.
The positional CLI uses initial-page extraction; recovery is exposed through
MCP and the API. Batch extraction also uses the initial page.

TikTok requests require HTTPS, no credentials/custom port, and TikTok page
hosts or approved TikTok CDN hosts (`tiktok.com`, `tiktokcdn.com`,
`tiktokcdn-us.com`, `tiktokcdn-eu.com`, including subdomains). Every redirect is
validated, with at most three redirects within one 15-second deadline per page
or caption acquisition.
Page bodies are limited to 5 MiB and caption bodies to 2 MiB. A new CDN family
requires a reviewed allowlist change. Signed caption resource URLs are not
included in results or saved evidence.

Results preserve legacy `hasTranscript`, `transcript`, `wordCount` and metadata,
and add `status`, `retrievalMethod`, `rawVtt`, timestamped `segments` (seconds),
and `coverage` (cue count, first start, last end, and gaps over three seconds).
Gaps indicate uncaptioned intervals, not proven missing speech; track endpoints
do not prove full video coverage. Caption wording is not audio-verified and
speaker names are not inferred. Preserve raw text and flag uncertain wording
before summarizing or checking factual claims.

MCP always returns structured evidence. With `output`, MCP and CLI write a
timestamped Markdown review at that path and full evidence, including raw VTT,
at `<output>.json`. Batch stores evidence in `metadata.captionEvidence` in each
`result.json`, retaining its general `no_transcript` status for absent tracks.
## Public network boundary

Generic article/link requests, public YouTube/TikTok page/caption fetches and raw
GitHub text downloads accept only public HTTP(S) destinations without URL
credentials. All DNS answers must be public; the selected address is pinned at
connect while retaining hostname certificate validation. Every redirect is vetted
again (maximum five). Responses have a 5 MiB streamed-byte cap and a 15-second total
DNS/request/body timeout. Compressed responses are rejected after requesting
identity encoding. Missing or dishonest Content-Length cannot bypass the cap.

TikTok acquisition uses this same transport in manual-redirect mode so its
stricter HTTPS TikTok/CDN host policy is checked before every next hop. Each
page or caption acquisition allows at most three redirects within one 15-second
deadline; pages are capped at 5 MiB and caption resources at 2 MiB. The transport
still vets all DNS answers and pins each connection. Other consumers retain
the default automatic redirect behavior and its five-redirect limit.

GitHub bearer credentials are attached only to the exact `https://api.github.com`
origin, with redirects refused; raw GitHub/gist origins receive no API bearer.
This changes private raw-content access: use a dedicated authenticated GitHub tool
when raw files require credentials.

The public transport guarantee does not cover the separate `youtube-transcript`
library, fixed-origin authenticated provider API implementations, or manually run
browser-provider diagnostic scripts. The production batch browser fallback is
disabled because a generic browser can request private redirects/subresources.
