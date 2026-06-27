# Content Extractor Stack Port

This checklist governs the registry-side work to make the `content-extractor` stack portable, testable, and suitable for GitHub distribution from the public RUDI registry.

## Phase 0: Baseline And Manual Lookup

- Status: complete for the first no-credential Reddit portability increment.
- Scope:
  - [x] Use the existing registry stack at `catalog/stacks/content-extractor` as the target boundary.
  - [x] Compare private Content Engine extractor behavior from `/Users/hoff/dev/tools/private/content-engine/backend/extractors` without copying local-only assumptions.
  - [x] Exclude betting extractors from the first pass.
  - [x] Establish current build, validation, and test state before implementation.
- Files to inspect before editing:
  - [x] `AGENTS.md`
  - [x] `catalog/stacks/content-extractor/manifest.json`
  - [x] `catalog/stacks/content-extractor/manifest.v2.json`
  - [x] `catalog/stacks/content-extractor/package.json`
  - [x] `catalog/stacks/content-extractor/src/index.ts`
  - [x] `catalog/stacks/content-extractor/README.md`
  - [x] Private extractor sources for Reddit, YouTube, article, and TikTok only as comparison material.
- Relevant SWE manual sections:
  - [x] API standard: schemas, validation, error model, documentation, agent-readable contracts.
  - [x] Security standard: trust boundaries, secrets handling, supply-chain dependencies, agent tool inputs.
  - [x] Backend standard: explicit inputs/outputs, failure modes, configuration, observability.
  - [x] Infrastructure standard: reproducible packaging, artifact traceability, runtime configuration.
  - [x] Testing doctrine: behavior-level red-green-refactor.
- Current-state commands:
  - [x] `git status -sb`
  - [x] `find catalog/stacks/content-extractor -maxdepth 2 -type f -not -path '*/node_modules/*' | sort`
  - [x] `npm run build` from `catalog/stacks/content-extractor` passed before implementation.
  - [x] `npm run validate:v2` passed before implementation.
  - [x] `npm run validate:public` passed before implementation.
- Risks and invariants:
  - [x] Registry packages must not reference `/Users/hoff/dev/tools/private/...`.
  - [x] Secrets must be declared in manifests and never logged or embedded.
  - [x] External URLs, page HTML, API responses, and agent tool arguments are untrusted inputs.
  - [x] Extractor outputs must have stable shapes and clear failure behavior.
  - [x] Existing staged Neon stack changes are unrelated and must not be reverted or mixed into this work.
- Exit criteria:
  - [x] Baseline commands passed with no current stack or registry validation failures.
  - [x] First behavior selected: Reddit public JSON `403` falls back without requiring Reddit API credentials.

## Phase 1: Scope Lock

- In scope:
  - [x] Harden the existing `content-extractor` registry stack for the first portability increment.
  - [x] Port useful Reddit OAuth fallback, old Reddit HTML fallback, URL canonicalization, bounded comments, retry behavior, and response-shape validation.
  - [x] Keep YouTube, article, TikTok, email, and betting as follow-on work.
  - [x] Ensure manifests, README, `.env.example`, and package scripts describe the verified behavior.
- Non-goals:
  - [x] No betting extractor port in this pass.
  - [x] No private path references, account-specific defaults, or local run artifacts.
  - [x] No unrelated stack work outside `content-extractor`.
  - [x] No dependency additions unless the current stack cannot meet the verified behavior without them.
- Expected files touched:
  - [x] `docs/swe-compliance/2026-06-24-content-extractor-stack-port.md`
  - [x] `catalog/stacks/content-extractor/src/index.ts`
  - [x] `catalog/stacks/content-extractor/tests/*`
  - [x] `catalog/stacks/content-extractor/package.json`
  - [x] `catalog/stacks/content-extractor/.env.example`
  - [x] `catalog/stacks/content-extractor/README.md`
  - [x] `catalog/stacks/content-extractor/manifest.json`
  - [x] `catalog/stacks/content-extractor/manifest.v2.json`
- External inputs and trust boundaries:
  - [x] MCP tool arguments: untrusted, schema-declared, and bounded where modified.
  - [x] Remote HTTP responses: untrusted, status checked and Reddit payload shape validated before dereferencing.
  - [x] Optional API secrets: read from environment only, not returned in results.
  - [x] Output paths: unchanged, user-provided filesystem inputs remain constrained to explicit save behavior.
- Failure behavior to define:
  - [x] Invalid Reddit URLs are rejected before network calls.
  - [x] Non-Reddit URLs receive a specific Reddit extractor error.
  - [x] Remote Reddit failures return stable, non-secret error messages.
  - [x] Reddit `max_comments` is clamped to `0..100`.
- Exit criteria:
  - [x] File scope and public stack contract were locked before implementation.

## Phase 2: Red Tests

- Observable behavior to prove:
  - [x] Reddit extraction falls back to OAuth bearer when public JSON is blocked, using fixture data without network access.
  - [x] Reddit extraction falls back to old Reddit HTML when public JSON is blocked and OAuth is not configured.
  - [x] Reddit extraction uses old Reddit HTML as the primary no-credential path.
  - [x] Reddit extraction defaults to depth 2, meaning top-level comments plus direct replies.
  - [x] Reddit extraction supports `max_depth: 1` for only top-level comments and `max_depth: 3` for grandchildren replies.
  - [x] Reddit extraction accepts mobile Reddit links.
  - [x] Reddit invalid input is rejected before fetch.
  - [x] Reddit explains failure if both public JSON and old Reddit HTML are blocked.
  - [x] MCP tool declarations match manifest-declared tool names.
  - [x] MCP `extract_reddit` exposes and forwards `max_depth`.
  - [x] Optional Reddit secrets are declared in both manifest formats.
  - [x] Stack files do not reference the private Content Engine path.
- Test files to add or edit:
  - [x] `catalog/stacks/content-extractor/tests/core.test.mjs`
  - [x] `catalog/stacks/content-extractor/tests/mcp-contract.test.mjs`
- Red command:
  - [x] `npm test` from `catalog/stacks/content-extractor`
- Expected failure:
  - [x] First red failure: `extractReddit falls back to Reddit OAuth bearer when public JSON is blocked` failed with `Error: HTTP 403: Forbidden`.
  - [x] Second red failure: manifest contract test failed because `REDDIT_BEARER_TOKEN` was not declared.
  - [x] Third red failure: old Reddit HTML fallback tests failed because the stack only returned `HTTP 403: Blocked`.
  - [x] Fourth red failure: primary-path test showed the extractor still called JSON before old Reddit HTML.
  - [x] Fifth red failure: MCP depth contract failed because `extract_reddit` did not expose or forward `max_depth`.
- Exit criteria:
  - [x] Behavior-level tests failed for the expected reasons before implementation and contract updates.

## Phase 3: Implementation

- Implementation rules:
  - [x] Keep the public stack self-contained under `catalog/stacks/content-extractor`.
  - [x] Prefer exported core functions for behavior tests and a live MCP process only for smoke.
  - [x] Validate Reddit tool inputs before network calls.
  - [x] Keep optional secrets behind environment variables declared in manifests.
  - [x] Return stable, agent-readable Reddit errors without leaking tokens, including public JSON and old Reddit HTML failure context.
- Files allowed to change:
  - [x] The expected files from Phase 1 only.
- Validation and error-handling requirements:
  - [x] Reddit URL validator enforces protocol and platform.
  - [x] Reddit numeric options have documented bounds in code and behavior tests.
  - [x] Reddit `max_depth` is clamped to `1..5`, with default `2`.
  - [x] Reddit response parsing validates shape before dereferencing nested fields.
  - [x] Output save behavior was not changed.
- Observability requirements:
  - [x] MCP responses continue to identify extraction failures through `isError`.
  - [x] README documents no-credential Reddit HTML fallback, optional OAuth fallback, and existing external extraction limitations.
- Exit criteria:
  - [x] The red tests pass without weakening assertions.

## Phase 4: Green Tests And Refactor

- Green command:
  - [x] `npm test` from `catalog/stacks/content-extractor`
- Refactor constraints:
  - [x] Refactor only after the relevant test was green.
  - [x] Avoided broad module churn; kept the existing single-file stack shape.
- Regression checks:
  - [x] Re-ran targeted stack tests after contract-test adjustment.
- Exit criteria:
  - [x] Targeted stack tests remain green after cleanup.

## Phase 5: Full Verification

- Targeted tests:
  - [x] `npm test` from `catalog/stacks/content-extractor`: 13 passed.
- Full suite:
  - [x] Registry `npm test`: 100 passed.
- Build/typecheck/lint:
  - [x] `npm run build` from `catalog/stacks/content-extractor`: passed.
  - [x] Registry `npm run validate:v2`: 88 passed.
  - [x] Registry `npm run validate:public`: 0 errors, 0 warnings.
  - [x] Registry `npm run build`: passed.
- JS/TS debt scan, if applicable:
  - [x] Ran structural fallback debt scan for edited JS/TS files; 0 findings.
- Live smoke checks:
  - [x] Started the content extractor MCP server and called `tools/list`; returned the five declared tools.
  - [x] Live unauthenticated Reddit listing smoke returned `HTTP 403: Blocked`.
  - [x] Live unauthenticated direct Reddit post smoke succeeded through old Reddit HTML fallback.
  - [x] Live link-style smoke passed for `www.reddit.com`, `old.reddit.com`, `reddit.com`, `new.reddit.com`, `m.reddit.com`, `/comments/{id}`, `old.reddit.com/comments/{id}`, and `redd.it/{id}`.
  - [x] Live multi-comment smoke selected a thread with 161 comments and extracted the requested top 5 comments.
  - [x] Live nested-comment smoke with `maxDepth=2` extracted 5 top comments and 8 total comments through old Reddit HTML, including direct replies.
  - [x] Live MCP `tools/call` smoke with `max_depth: 2` returned a Reddit extraction result containing indented direct replies.
  - [x] RUDI local secrets check found no configured Reddit secrets.
  - [x] Ran no-network unit smoke with fixture-backed Reddit behavior.
  - [x] Skipped authenticated Reddit smoke because no `REDDIT_BEARER_TOKEN`, `REDDIT_CLIENT_ID`, or `REDDIT_CLIENT_SECRET` is configured locally and credentials are not required for the verified HTML fallback path.
  - [x] Skipped YouTube/TikTok/article network extraction smoke because this increment touched Reddit behavior only.
- Exit criteria:
  - [x] No blocking test, build, validation, or debt findings remain unexplained.

## Phase 6: Docs, Contracts, And Closure

- Docs or API contracts to update:
  - [x] `catalog/stacks/content-extractor/README.md`
  - [x] `catalog/stacks/content-extractor/manifest.json`
  - [x] `catalog/stacks/content-extractor/manifest.v2.json`
  - [x] `catalog/stacks/content-extractor/.env.example`
- Final files touched:
  - [x] `docs/swe-compliance/2026-06-24-content-extractor-stack-port.md`
  - [x] `catalog/stacks/content-extractor/.env.example`
  - [x] `catalog/stacks/content-extractor/README.md`
  - [x] `catalog/stacks/content-extractor/manifest.json`
  - [x] `catalog/stacks/content-extractor/manifest.v2.json`
  - [x] `catalog/stacks/content-extractor/package.json`
  - [x] `catalog/stacks/content-extractor/src/index.ts`
  - [x] `catalog/stacks/content-extractor/tests/core.test.mjs`
  - [x] `catalog/stacks/content-extractor/tests/mcp-contract.test.mjs`
- Commands run and results:
  - [x] Baseline `npm run build` in `catalog/stacks/content-extractor`: passed.
  - [x] Baseline `npm run validate:v2`: passed.
  - [x] Baseline `npm run validate:public`: passed.
  - [x] Red `npm test` in `catalog/stacks/content-extractor`: failed on expected Reddit OAuth fallback behavior.
  - [x] Red manifest-contract `npm test` in `catalog/stacks/content-extractor`: failed on missing Reddit secret declarations.
  - [x] Final `npm test` in `catalog/stacks/content-extractor`: 13 passed.
  - [x] Final `npm run build` in `catalog/stacks/content-extractor`: passed.
  - [x] Final registry `npm test`: 100 passed.
  - [x] Final registry `npm run validate:v2`: 88 passed.
  - [x] Final registry `npm run validate:public`: 0 errors, 0 warnings.
  - [x] Final registry `npm run build`: passed.
  - [x] Final structural debt scan: 0 findings.
  - [x] Final MCP `tools/list` and `tools/call` smoke: passed.
- Accepted debt:
  - [x] YouTube, article, TikTok, email, and betting ports remain follow-on work; betting is intentionally low priority.
  - [x] Browser-based Reddit fallback from the private extractor was not ported because old Reddit HTML provides a portable no-credential fallback without Playwright runtime complexity.
  - [x] Reddit public JSON remains blocked in this environment, but direct post extraction is proven through old Reddit HTML.
- Definition of Done:
  - [x] The stack is self-contained and does not depend on private local paths.
  - [x] Behavior-level tests prove the first Reddit extractor contract, including default depth-2 replies.
  - [x] Registry validations pass.
  - [x] Documentation matches verified behavior.

## Follow-Up Slice: YouTube, TikTok, Article, And Link Extractor Proof

- Scope:
  - [x] Prove the existing non-Reddit extractor tools with deterministic tests before publishing the stack.
  - [x] Keep `extract_article` and `extract_links` as separate tool contracts because article extraction returns cleaned reading content while link extraction returns a categorized URL inventory.
  - [x] Avoid live TikTok/YouTube dependence in automated tests because public pages are anti-bot and unstable.
- Files touched:
  - [x] `catalog/stacks/content-extractor/tests/core.test.mjs`
  - [x] `docs/swe-compliance/2026-06-24-content-extractor-stack-port.md`
- Observable behavior proven:
  - [x] `extract_youtube` uses configured Supadata transcript extraction and returns video metadata, transcript, duration, word count, and extraction method.
  - [x] `extract_tiktok` parses TikTok rehydration page data, chooses an English VTT caption track, strips VTT timing, and returns transcript metadata.
  - [x] `extract_article` fetches HTML, runs Readability, converts article HTML to markdown, preserves useful formatting, and removes media.
  - [x] `extract_links` fetches HTML, ignores non-web links, deduplicates URLs, categorizes links, and returns CSV output.
  - [x] MCP `tools/call` smoke passed for `extract_links` and `extract_article` against a local HTTP fixture.
  - [x] Live link smoke passed for `example.com`, `wikipedia.org`, and a GitHub repository page.
  - [x] Live article smoke passed for IANA documentation and a Wikipedia article.
  - [x] Live Reddit direct-post smoke passed through old Reddit HTML with `max_depth: 2`.
  - [x] Live TikTok developer-example smoke returned metadata with `hasTranscript: false` for a video without public captions.
  - [x] Live YouTube smoke returned video metadata but no transcript without `SUPA_DATA_API`.
- Commands run and results:
  - [x] Baseline `npm test` from `catalog/stacks/content-extractor`: 13 passed.
  - [x] Baseline `npm run build` from `catalog/stacks/content-extractor`: passed.
  - [x] Final `npm test` from `catalog/stacks/content-extractor`: 19 passed.
  - [x] Final `npm run build` from `catalog/stacks/content-extractor`: passed.
  - [x] Local MCP smoke with `tools/list`, `extract_links`, and `extract_article`: passed.
  - [x] Registry `npm run validate:v2`: 89 passed.
  - [x] Registry `npm run validate:public`: 0 errors, 0 warnings.
  - [x] Registry `npm run build`: passed.
  - [x] Registry `npm test`: 101 passed.
  - [x] Structural debt scan fallback returned 0 findings, but the scanner's no-policy graph is `src`-rooted and did not directly report the untracked `tests/core.test.mjs` file.
  - [x] Manifest v2 validation rejected secret-level `description`; user-facing Supadata guidance now lives in README, `.env.example`, v1 manifest description, and MCP tool description while v2 keeps the allowed optional secret fields.
- Accepted debt:
  - [x] YouTube transcripts should be treated as requiring `SUPA_DATA_API` for reliable user use; no Supadata secret was configured locally, and public no-key fallbacks returned metadata without transcripts for tested videos.
  - [x] TikTok transcript extraction is best-effort because videos may have no public caption track and TikTok can return challenge/removed-item payloads even with HTTP 200.
  - [x] The registry worktree still contains unrelated staged Neon work and Otter/content-extractor mixed local state; publishing this stack requires cleanup or a clean branch before commit/push.
