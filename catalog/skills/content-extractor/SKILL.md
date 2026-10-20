---
name: "Content Extractor Operator"
description: "Extract content from YouTube, Reddit, TikTok, web articles, GitHub, and link batches"
version: 1.1.0
category: "data"
tags:
  - rudi
  - operator
  - content-extractor
  - capability:extract
requires:
  stacks:
    - stack:content-extractor
---

# Content Extractor Operator

Use this skill as the host-native operating layer for `stack:content-extractor`.
Translate the user's intent into the smallest safe sequence of stack tool calls,
then verify and report the result.

## When To Use

Extract content from YouTube, Reddit, TikTok, web articles, GitHub, and link batches

Use the stack when the request needs these capabilities. Do not substitute
invented results when the stack, a required secret, or a supporting service is
unavailable.

## Task Routing And Verification

Route the exact source URL by input type: YouTube to `extract_youtube`, Reddit to
`extract_reddit`, TikTok to `extract_tiktok`, articles to `extract_article`, and
repository content to `extract_github`. Use `extract_links` for link discovery and
`extract_batch` only for a bounded accepted list. Inspect the live schema first.

Verify that every result matches its requested URL and includes substantive source
content. Record retrieved versus expected comments, pages, transcript segments or
batch items when available. Detect login pages, blocked responses, empty text and
truncation before summarizing. Report partial extraction and failed URLs explicitly;
never present a title, metadata-only response or sample as complete source coverage.

## Workflow

### TikTok Caption Recovery

With stack 1.1.0 or later, inspect `status`, `hasTranscript`, `segments` and
`coverage`. `captions_not_found` means the initial page did not expose tracks;
it is not proof that captions are absent. Page challenges, HTTP errors and
malformed responses are failures, never successful extraction. Avoid repeating
the same failed page fetch without new evidence.

If needed, inspect the exact video in the host browser, resolve its canonical
`/@creator/video/id` URL, and find its caption resource in page metadata or
network requests. Observe the resource/video association directly. Do not guess
URLs or export cookies. Caption resources may lack a `.vtt` suffix and may use
`mime_type=video_mp4`; validate their content rather than their filename.

Pass the canonical video `url` and exact observed `caption_url` to
`extract_tiktok` only if the live schema supports it. This route skips the page
fetch and reports `retrievalMethod: supplied_caption`; its association is
operator-provided, not independently verified by the stack. Reinspect expired
resources rather than modifying signed query strings or retrying blindly.

Use `output` to preserve timestamped Markdown and `<output>.json` containing raw
VTT, cue segments and coverage. Report cue count and first/last cue times;
compare with observed video duration when available. Flag gaps over three
seconds as uncaptioned intervals, not proven missing speech. Do not claim full
coverage from a track endpoint alone. Keep uncertain wording unchanged in the
raw evidence, separate suggested corrections, and do not invent speakers.

Only summarize or fact-check claims actually recovered from the source.
Separate extraction quality from claim accuracy. If no caption resource is
accessible, report the limitation; use an available audio transcription skill
when appropriate and label that result as a separate transcription method.

### General Operation

1. Identify the user's requested outcome, inputs, constraints, and whether the
   action changes external state.
2. Inspect the active MCP tool schema before calling a tool. The runtime schema
   is authoritative for parameter names, required fields, and enums.
3. Start with discovery, inspection, validation, preview, or dry-run tools when
   the stack provides them.
4. Use the fewest tool calls that can complete the request. Reuse returned IDs
   and paths instead of guessing them.
5. Before a destructive, irreversible, public, paid, or externally visible
   action, obtain the user's confirmation unless they already authorized that
   exact action.
6. Validate tool results before using them as inputs to another call. Stop on
   malformed results, explicit errors, missing required data, or partial
   completion that makes the next action unsafe.
7. Verify mutations with a read-back, status, inspection, or artifact check
   when the stack supports one.
8. Report what was attempted, what succeeded, what failed, and any output IDs,
   URLs, or paths the user needs.

## Stack Tools

- `extract_youtube`
- `extract_reddit`
- `extract_tiktok`
- `extract_article`
- `extract_github`
- `extract_links`
- `extract_batch`

Use only tools that are actually available in the active RUDI router. If the
installed stack exposes a different tool set than this catalog version, report
the mismatch and use the live tool schema only when doing so remains within the
user's request.

## Failure Behavior

- Missing stack or tools: stop and ask the user to install, index, or integrate
  `stack:content-extractor`; do not simulate a successful tool call.
- Missing credentials or authorization: name the required setup without
  printing secret values.
- Invalid input: explain the rejected field or constraint and request only the
  information needed to continue.
- Tool or dependency failure: preserve successful prior work, avoid blind
  retries of mutations, and report a safe retry or recovery step.
- Partial completion: distinguish completed actions from pending or failed
  actions so the user can recover without duplicating side effects.
