# TikTok caption recovery

## Phase 0: Baseline and manual lookup

- Baseline: clean registry main at bb257decedf7f2313ccbc9ab6c9daad43ac12c1a on both peers.
- Evidence: direct extraction reported unknown creator/no captions; browser recovery yielded a valid WebVTT track with 170 cues. Runtime currently checks only initial subtitleInfos, strips timing, and does not validate HTTP or VTT responses.
- Standards: engineering index, master doctrine Appendices C/D, co-pilot standard, horizontal engineering standard.
- Risk: medium; additive MCP/API contract and untrusted network caption input.
- Horizontal scan: TikTok is called by MCP, CLI and batch. All must use one parser/formatter. Browser interaction stays in the host; no new browser runtime or dependencies.

## Phase 1: Scope lock

- Fix misleading caption absence reporting; preserve existing hasTranscript/transcript/wordCount fields.
- Add explicit browser-discovered caption_url ingestion for canonical TikTok video URLs. The operator must verify the resource belongs to that video; the stack must label supplied provenance and must not claim independent identity verification.
- Validate TikTok/CDN URL boundaries, redirects, HTTP responses, size/time limits and WebVTT cue contents.
- Retain raw VTT, timestamped segments, coverage and gaps; gaps mean uncaptioned intervals, not proven missing speech.
- Wire API, MCP, CLI and batch behavior; update README/operator skill and generated index.
- Non-goals: automatic login, cookie export, automatic audio transcription, caption correction, diarization, unrelated platform refactors.
- Commit slices: (1) implementation/tests; (2) docs/version/index. No commit, push, PR or registry publication authorized. Local package update authorized by the task. Peer propagation preserves remote work and follows the repository's Git policy: a checked task-only Git patch reconciles the clean same-baseline peer without commits or publication; documented local-registry rudi update installs each accepted source tree.
- Exit: focused and package tests/build, registry gates, debt scan, live recovery smoke, fresh-context review, local install validation, and explicit peer disposition.

## Phase 2–4: Red, implementation, green/refactor

- Repeated command for one behavior at a time: package `npx tsx --test tests/tiktok.test.mjs`. Observed red, then unchanged assertions green for: incomplete-page status (missing status), supplied resource (incorrect page fetch), HTTP failures (missing rejection), redirect host boundary (unvalidated redirect), streaming size (body parsed instead of bounded), video identity (missing mismatch rejection), batch evidence (missing captionEvidence), and elapsed-hour formatting (24h wrapped to zero).
- MCP red/green: `npx tsx --test tests/tiktok-mcp.test.mjs`; red was missing caption_url schema. Green verifies the real stdio SDK boundary, structured status, Markdown/JSON evidence, and replacing previous successful artifacts with truthful absent-track evidence.
- Refactor verification: `npx tsx --test tests/tiktok.test.mjs tests/core.test.mjs` after extracting the canonical TikTok module; all passed. No parallel parser implementation was added.
- Test harness corrections: old response mocks now expose actual response streams and observed URLs. Corrected the new batch test's saved-path field to the existing resultPath contract. Corrected a nonclosing synthetic oversize stream before recording its behavioral red.
- Supplemental checks cover malformed/empty/unordered cues, overlap coverage, CRLF/BOM, settings/markup, and redirect exhaustion. No new dependencies.

## Phase 5: Verification

- Package `npm test`: 48/48 pass; `npm run build`: pass. Supplemental MCP read-back after final test edit: pass.
- Registry `npm test`, `npm run validate`, `npm run indexes:sync`, `npm run indexes:check`, `npm run build`, `npm pack --dry-run --json`: pass. Initial hygiene gate correctly reported task-created package node_modules/dist. Removed those generated directories after package verification; final catalog:clean:check, indexes:check, build and pack all pass.
- Final scoped swe_debt_scan: package graph, all six edited/new source and test JS/TS files, zero errors/warnings/info. The initial expanded invocation supplied globs to regex options and was rejected; corrected regex options ran successfully.
- Live original-video smoke: initial page captions_not_found with correct video identity; supplied browser-observed resource succeeds, 170 cues / 1282 words / 0.140–375.998s; all three gaps preserved. Raw VTT byte-for-byte matches prior browser extraction. Raw SHA-256 4aa9221fcd92986c2468d854f24fcce8922e833203c64931980a84acc6dbe253. Private smoke script and outputs stay outside this public catalog.
- Independent fresh-context rudi-code-review: Standards pass, Spec pass, Proof pass for source, no actionable findings; independently reran 11 focused checks. Delivery checks below close the remaining installation/hygiene/peer gates.
- Boundaries: caption/video association requires operator observation; no audio verification, speaker assignment or proof of full-video coverage. Recovery is exposed in MCP/API; positional CLI and batch retain initial-page acquisition.

## Phase 6: Closure

- Source, manifest/package/lock and operator skill are 1.1.0; generated index is synchronized. No dependencies added.
- Both peers installed stack and skill through `USE_LOCAL_REGISTRY=true RUDI_REGISTRY_ROOT=<verified-registry> rudi update stack:content-extractor --with-related-skills --preserve-state`, with selected native skill synchronization. Exact Codex content-extract projection required scoped force after comparing and preserving unmanaged source; Claude uses its managed projection. Both host skill names remain content-extract, with equal content checksums across peers.
- Each peer's installed source equals the reviewed catalog files. All twelve package/skill/index file checksums match across the clean same-baseline peers after task-only Git patch application. Remote repository identity, instructions, executable resolution, branch, revision, dirty and ignored state were checked first; git apply --check passed. No secrets, media, caches, databases, logs or runtime state were synchronized.
- Local and admin installed-package `npm test`: 48/48 pass each; installed-package `npm run build`: pass each. Both registry suites: 356/356 pass; both peers' required validate, indexes:sync/check, catalog:clean:check, build and pack dry-run gates pass.
- Live installed API and real MCP stdio smoke recovered the original video: 170 cues, 1282 words, raw equality and saved Markdown/JSON read-back passed. Positional CLI subprocess with the original page saved captions_not_found and null raw evidence correctly. Tool index includes caption_url; existing host sessions may need reopening to refresh cached schemas.
- Reviewed module-size boundary passes; one TikTok parser serves MCP/CLI/batch. Horizontal disposition: consolidate implementation in this change, obligation closed. No unrelated platform behavior changed.
- Planned commit slices remain uncommitted on both existing primary checkouts; no task worktree was created. No push, PR, merge or public registry release occurred. A later public update requires separately authorized publication.
- Known proof gaps: deadline test asserts AbortSignal wiring and failure handling, not an actual stalled connection. Future caption CDN changes/expired resources remain external risks. Operator-provided video association, caption accuracy, speaker identity and full-video coverage remain explicitly unverified; these are not extraction completion claims.
- Definition of Done: source, instructions, local installs, peer parity and verification complete; no accepted source debt or unresolved review findings. Final verdict: ready for local use; unpublished.
