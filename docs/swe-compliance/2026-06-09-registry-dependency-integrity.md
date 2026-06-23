# Registry Dependency Integrity Check

This checklist governs the registry-side fix for stack dependency declarations after the CLI stopped creating placeholder installs.

## Phase 0: Baseline And Manual Lookup

- Status: complete.
- Scope:
  - [x] Check every root `index.json` stack dependency, not only `stack:video-editor`.
  - [x] Treat the root `index.json` and v1 catalog files as the current user-facing source because the CLI consumes `https://raw.githubusercontent.com/learnrudi/registry/main/index.json`.
  - [x] Do not restore fallback placeholder behavior in the CLI.
- Files to inspect before editing:
  - [x] `AGENTS.md`
  - [x] `index.json`
  - [x] `catalog/stacks/*/manifest.json`
  - [x] `catalog/binaries/*.json`
  - [x] `src/public-readiness.ts`
  - [x] `src/public-readiness.test.ts`
  - [x] CLI resolver/downloader behavior in `/Users/hoff/dev/RUDI/apps/cli/packages/registry-client/src/index.js`
- Relevant SWE manual sections:
  - [x] Master doctrine: boundaries, explicit invariants, designed failure behavior.
  - [x] Testing doctrine: red-green proof for behavior-bearing checks.
- Current-state findings:
  - [x] `stack:video-editor` exposes `whisper`, `chromium`, and `ffprobe` dependency metadata gaps.
  - [x] `stack:creator-intelligence` exposes `yt-dlp` id/path mismatch and `ffprobe` alias dependency.
  - [x] `stack:document-processor` requires `pdftoppm` but no binary manifest exists.
  - [x] `stack:rudi-processor` requires `tesseract` as check-only/system metadata.
- Exit criteria:
  - [x] A registry validation command fails on unresolved stack binary dependencies.
  - Evidence: `npm run validate:public -- --json` initially reported unresolved `yt-dlp` plus uninstallable `whisper` and `chromium` providers.

## Phase 1: Scope Lock

- In scope:
  - [x] Add a public-readiness validation gate for stack-required binaries.
  - [x] Fix root-index/catalog metadata for all current stack binary requirements.
  - [x] Keep system dependencies explicit instead of fake-installing them.
- Non-goals:
  - [x] No placeholder installs.
  - [x] No broad root index generation migration.
  - [x] No unrelated stack feature work.
- Expected files touched:
  - [x] `src/public-readiness.ts`
  - [x] `src/public-readiness.test.ts`
  - [x] `index.json`
  - [x] Selected `catalog/binaries/*.json`
  - [x] CLI downloader/installer/runtime files needed to make the registry metadata truthful.
- External inputs and trust boundaries:
  - [x] Registry JSON is a supply-chain boundary for the CLI.
  - [x] Download URLs and binary names must be explicit and validated.
  - [x] System-only dependencies must be declared as system/detected dependencies, not silent install successes.
- Exit criteria:
  - [x] The intended file set is locked before catalog edits.

## Phase 2: Red Tests

- Observable behavior to prove:
  - [x] Public readiness reports stack-required binaries that cannot be resolved to an indexed package or a binary provided by an indexed package.
  - [x] Public readiness reports required binary providers without supported install/detect metadata.
  - [x] CLI raw binary downloads install as executable files without shell command execution.
  - [x] CLI system binaries register from detected system commands instead of falling through to downloads.
  - [x] Stack runtime environments expose RUDI-managed binary directories on `PATH`.
- Test files to edit:
  - [x] `src/public-readiness.test.ts`
  - [x] `/Users/hoff/dev/RUDI/apps/cli/packages/registry-client/src/__tests__/unit/command-execution.test.js`
  - [x] `/Users/hoff/dev/RUDI/apps/cli/packages/core/src/__tests__/unit/installer-state-preservation.test.js`
  - [x] `/Users/hoff/dev/RUDI/apps/cli/packages/runner/src/__tests__/unit/spawn-path.test.js`
- Red command:
  - [x] `npm test -- src/public-readiness.test.ts`
  - [x] `npm test -- src/__tests__/unit/command-execution.test.js` from `packages/registry-client`
  - [x] `npm test -- packages/core/src/__tests__/unit/installer-state-preservation.test.js`
  - [x] `npm test -- packages/runner/src/__tests__/unit/spawn-path.test.js`
- Expected failure:
  - [x] New dependency-integrity assertions fail before validator implementation.

## Phase 3: Implementation

- Implementation rules:
  - [x] Prefer registry metadata fixes over CLI fallbacks.
  - [x] Preserve existing package conventions unless correcting a broken id/path invariant.
  - [x] Keep aliases explicit through provider bins where one package supplies multiple executables.
  - [x] Add real CLI support where registry truth required it: raw downloads, system binary registration, and stack `PATH` composition.
- Files allowed to change:
  - [x] `src/public-readiness.ts`
  - [x] `src/public-readiness.test.ts`
  - [x] `index.json`
  - [x] Affected stack/binary catalog files only.
  - [x] CLI files required by current install/runtime behavior.
- Exit criteria:
  - [x] Root registry dependency validation passes.

## Phase 4: Green Tests And Refactor

- Green command:
  - [x] `npm test -- src/public-readiness.test.ts`
- Refactor constraints:
  - [x] Keep validation small and deterministic.
  - [x] Do not add runtime dependencies.
- Regression checks:
  - [x] `npm test`
  - [x] `npm run build`
- Exit criteria:
  - [x] Focused and full registry checks pass.

## Phase 5: Full Verification

- Targeted tests:
  - [x] Public readiness dependency-integrity tests.
  - [x] CLI raw binary download test.
  - [x] CLI system binary registration test.
  - [x] CLI stack runtime `PATH` test.
- Full suite:
  - [x] Registry `npm test`
  - [x] CLI `npm test`
- Build/typecheck/lint:
  - [x] Registry `npm run build`
  - [x] Registry `npm run validate:public -- --json`
  - [x] CLI `npm run build`
  - [x] CLI JS/TS debt scan: zero findings.
  - [x] Registry fallback debt scan: one non-blocking orphan warning for `src/public-readiness.ts`, accepted because it is invoked by `npm run validate:public`.
- Live smoke checks:
  - [ ] Temp-home `rudi install stack:video-editor --force --no-related-skills`.
  - [x] Temp-home `rudi install binary:yt-dlp --force` from local registry, then execute installed `yt-dlp --version`.
  - [x] System-binary registration smoke covered by isolated CLI test fixture.
- Exit criteria:
  - [x] No unresolved stack binary dependency remains in the registry.

## Phase 6: Docs, Contracts, And Closure

- Docs or API contracts to update:
  - [x] This checklist.
- Final files touched:
  - [x] Registry: `src/public-readiness.ts`, `src/public-readiness.test.ts`, `index.json`, `catalog/binaries/chromium.json`, `catalog/binaries/whisper.json`, `catalog/binaries/tesseract.json`, `catalog/binaries/yt-dlp.json`, `catalog/binaries/pdftoppm.json`, removed `catalog/binaries/ytdlp.json`.
  - [x] CLI: `packages/registry-client/src/index.js`, `packages/registry-client/src/__tests__/unit/command-execution.test.js`, `packages/core/src/installer.js`, `packages/core/src/__tests__/unit/installer-state-preservation.test.js`, `packages/runner/src/spawn.js`, `packages/runner/src/__tests__/unit/spawn-path.test.js`, `packages/runner/package.json`, `packages/core/src/tool-index.js`, `src/router-mcp.js`.
- Commands run and results:
  - [x] Registry focused test: pass.
  - [x] Registry public validation: pass, 0 errors, 0 warnings.
  - [x] Registry full tests: 100 passed.
  - [x] Registry build: pass.
  - [x] CLI focused tests: pass.
  - [x] CLI full tests: 994 passed.
  - [x] CLI build: pass.
  - [x] Temp-home `binary:yt-dlp` smoke: pass, printed `2024.12.23`.
- Accepted debt:
  - [x] None for fake installs or unresolved required binaries.
  - [x] Registry fallback debt scan orphan warning for `src/public-readiness.ts` is accepted as scanner configuration noise; command invocation is proven by `npm run validate:public`.
- Definition of Done:
  - [x] Registry validation catches this class of issue automatically.
  - [x] Catalog metadata is internally consistent with the CLI install path.
  - [x] Smoke checks prove affected binary install behavior.
