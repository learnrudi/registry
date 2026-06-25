## Phase 0: Baseline And Manual Lookup

- Scope: port local `audio-tools` and `cloudinary` stacks into the public RUDI registry from a clean worktree based on `origin/main`.
- Files to inspect before editing: local stack manifests/source under `~/.rudi/stacks/audio-tools` and `~/.rudi/stacks/cloudinary`, registry manifest examples, `index.json`, current git status.
- Relevant SWE manual sections: `10-Engineering-Operating-Manual-Index.md`; Appendix C / C7A in `01-Master-Engineering-Doctrine.txt`; F5/F6/F7 in `06-Security-Engineering-Standard.md`.
- Current-state commands: `git status -sb`; local stack file inventory; manifest/source reads; registry stack examples.
- Risks and invariants: no local absolute paths, no secrets, no `.DS_Store`, no build artifacts, no unrelated dirty work from `/Users/hoff/dev/RUDI/apps/registry`.
- Exit criteria: use `/tmp/rudi-registry-audio-cloudinary` clean worktree; original dirty checkout remains untouched.

## Phase 1: Scope Lock

- In scope: add `catalog/stacks/audio-tools`, add `catalog/stacks/cloudinary`, add v1/v2 manifests, index entries, focused tests, docs, and registry validation.
- Non-goals: content-extractor changes, Neon changes, Otter cleanup, credential setup, live Cloudinary upload, full social video extractor design.
- Expected files touched: `catalog/stacks/audio-tools/**`, `catalog/stacks/cloudinary/**`, `index.json`, `docs/swe-compliance/2026-06-25-audio-cloudinary-registry.md`, registry tests if needed.
- External inputs and trust boundaries: tool args, file paths, remote URLs, downloaded media, Cloudinary credentials, Cloudinary API responses, shell/binary invocation boundaries.
- Failure behavior to define: reject unsupported URL schemes, do not leak credentials, dry-run Cloudinary uploads unless confirmed, keep audio/video downloads argument-vector based.
- Exit criteria: staged change contains only audio-tools/cloudinary registry work.

## Phase 2: Red Tests

- Observable behavior to prove:
  - Audio defaults are portable and do not include local Hoff paths or `/opt/homebrew`.
  - Audio URL handling rejects non-http(s) schemes before download.
  - Video-page URLs are planned through `yt-dlp` instead of direct file download.
  - Cloudinary manifests and tests remain portable and secret-safe.
- Test files to add or edit: `catalog/stacks/audio-tools/tests/core.test.mjs`, `catalog/stacks/cloudinary/tests/core.test.mjs`, package scripts.
- Red command: `npm test` from `catalog/stacks/audio-tools`.
- Expected failure: copied `audio-tools` did not have portable config helpers, video URL planning, or build/test scripts.
- Actual red result: `npm test` initially failed before implementation because `audio-tools` had no install/build-ready dependency state and then surfaced TypeScript config nullability errors once dependencies were installed.
- Exit criteria: red failure captured before implementation.

## Phase 3: Implementation

- Implementation rules: keep stack self-contained, use structured process args, validate all URL schemes, keep secrets out of logs/results, prefer env/RUDI defaults over local absolute paths.
- Files allowed to change: scope-locked files only.
- Validation and error-handling requirements: URL scheme validation; yt-dlp path in config; ffmpeg/ffprobe/whisper config from env; Cloudinary dry-run and redaction preserved.
- Observability requirements: MCP errors remain explicit but credential-safe.
- Actual implementation:
  - Added remote registry `manifest.v2.json` for `stack:audio-tools` and `stack:cloudinary`.
  - Added root `index.json` entries for both stacks.
  - Made `audio-tools` config portable and env-overridable; removed copied local absolute defaults.
  - Added `yt-dlp` planning for supported video-page URLs and rejected non-http(s) URLs.
  - Sanitized base64 upload filenames into the stack temp directory.
  - Kept `whisper-cli` as a documented transcription prerequisite rather than a registry binary dependency because the current installer attempts to install the system-only `binary:whisper` provider and fails on macOS.
  - Cleaned Cloudinary docs/tool text to generic public-registry wording and removed non-public related-skill references.
- Exit criteria: red tests pass unchanged.

## Phase 4: Green Tests And Refactor

- Green command: `npm test` from both stack directories.
- Refactor constraints: no broad registry refactors; no unrelated stack edits.
- Regression checks: stack builds and registry tests.
- Actual green results:
  - `catalog/stacks/audio-tools`: 5 tests passed.
  - `catalog/stacks/cloudinary`: 6 tests passed.
- Exit criteria: focused stack tests remain green after cleanup.

## Phase 5: Full Verification

- Targeted tests:
  - `npm test` in `catalog/stacks/audio-tools`: passed, 5/5.
  - `npm test` in `catalog/stacks/cloudinary`: passed, 6/6.
  - `npm test` in registry root: passed, 103/103.
- Full suite:
  - `npm test`: 9 files passed, 103 tests passed.
- Build/typecheck/lint:
  - `npm run validate:v2`: passed, 89 catalog packages.
  - `npm run validate:public`: passed, 0 errors and 0 warnings.
  - `npm run build`: passed, generated compiled registry indexes and catalog hash.
- JS/TS debt scan, if applicable:
  - `agent-debt-scan` on `catalog/stacks/audio-tools`: 0 findings.
  - `agent-debt-scan` on `catalog/stacks/cloudinary`: 0 findings.
  - `agent-debt-scan` on `src/audio-cloudinary-stack.test.ts`: 0 findings.
- Live smoke checks:
  - MCP `tools/list` for built `audio-tools`: returned all 5 expected tools.
  - MCP `tools/list` for built `cloudinary`: returned all 3 expected tools.
- Exit criteria: registry validates, builds, tests, public-readiness, and MCP entrypoint smoke checks pass.

## Phase 6: Docs, Contracts, And Closure

- Docs or API contracts updated:
  - `catalog/stacks/audio-tools/README.md`
  - `catalog/stacks/cloudinary/README.md`
  - paired legacy and v2 manifests for both stacks
  - root `index.json`
- Final files touched:
  - `catalog/stacks/audio-tools/**`
  - `catalog/stacks/cloudinary/**`
  - `src/audio-cloudinary-stack.test.ts`
  - `index.json`
  - this compliance checklist
- Commands run and results:
  - `npm install` in both stack dirs and registry root.
  - stack tests, registry validation, registry build, registry tests, debt scans, and MCP smoke checks all passed after fixes.
- Accepted debt:
  - `npm audit` reports dependency advisories in existing package dependency trees: audio-tools install reported 8 advisories, cloudinary install reported 1 low advisory, root install reported 7 advisories. `npm audit fix` was not run because it can rewrite dependency ranges beyond this registry-port scope.
  - Live transcription was not run because it depends on local Whisper model availability and media input; MCP entrypoint and unit-level URL/input behavior were verified.
  - Live Cloudinary upload was not run because uploads are externally visible; dry-run validation and credential-safe config/status behavior were verified.
- Definition of Done:
  - Both stacks are present in the public registry catalog with installable remote v2 manifests.
  - Root registry index exposes both stacks.
  - No stack source/docs contain local Hoff absolute paths or Hoff Digital defaults.
  - Generated artifacts and `node_modules` remain ignored and unstaged.
