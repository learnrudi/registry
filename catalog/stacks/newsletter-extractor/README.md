# Newsletter Extractor

RUDI MCP stack for extracting useful content from newsletters and feeds.

This stack does not own mailbox OAuth. Use `stack:google-workspace` or another
mail stack to fetch Gmail/email messages, then pass the message HTML/text into
these tools.

## Tools

| Tool | Purpose |
| --- | --- |
| `extract_newsletter_email` | Normalize a newsletter email body into title, text, links, sender/date metadata, and domains. |
| `extract_newsletter_links` | Extract and normalize links from newsletter HTML or plain text. |
| `extract_rss_feed` | Fetch an RSS/Atom feed and return normalized feed items. |

## Install

```bash
rudi install stack:newsletter-extractor
rudi integrate codex
```

Installed stacks run from `~/.rudi/stacks/newsletter-extractor`.

## Local Development

```bash
npm install
npm run build
npx tsx src/index.ts
```

The MCP server runs on stdio:

```bash
npx tsx src/index.ts --mcp
```

## Boundary

- `newsletter-extractor` owns parsing, link normalization, and RSS/Atom feed
  extraction.
- `google-workspace` owns Gmail OAuth, Gmail search, and Gmail message fetches.
- Applications such as Content Engine own persistence, enrichment, queueing,
  and user-facing workflows.

## RSS network limits

Feed requests are restricted to public HTTP(S) destinations without URL
credentials. Every DNS answer is checked and the selected address is pinned at
connect; each redirect repeats validation (maximum five redirects). The total
DNS/request/body timeout uses the bounded `timeout_ms` value (1–60 seconds).
Responses are capped at 5 MiB while streaming, regardless of Content-Length.
Compressed responses are rejected after requesting identity encoding. Local and
private-network feeds are intentionally unsupported. Parsing email HTML/text and
normalizing links does not fetch those links.

Run `npm test` for isolated network-boundary tests; provider requests are mocked.
