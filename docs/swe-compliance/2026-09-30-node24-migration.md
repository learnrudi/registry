# Node24 registry migration — execution checklist

## Phase0: Baseline and manual lookup — complete

High risk shared runtime default. Baseline `b4bc855`; retain the earlier Wrangler22/schema changes and unrelated primary Google Workspace work. Apply paired-peer instructions and SWE testing/review standards.

## Phase1: Scope lock — complete

Change only default `catalog/runtimes/node.json` to24.21.0 with official darwin-arm64, darwin-x64, linux-arm64 and linux-x64 hashes; keep `node-20-20-2` and Wrangler's `node-22-23-2` identities. Update runtime catalog contract, CI quality contract, Node22/24 validation matrix, SCHEMA example and generated indexes. No stack dependency version change was needed after fresh native builds passed.

## Phase2: Red tests — complete

```sh
npx vitest run src/runtime-catalog-contract.test.ts src/quality-gates.test.ts
```

Red/green evidence covers the default version, exact URLs and all four SHA-256 values, supported CI matrix, and unique per-matrix artifact names.

## Phase3: Implementation — complete

Use official Node downloads; maintain schema-v2 and mapped bin layout. Validate both22/24; release and cross-platform validation use24. Each matrix job uploads a distinct artifact. SCHEMA's complete runtime example now matches the real catalog descriptor.

## Phase4: Green and refactor — complete

Focused5 tests and full358-test suite passed. No implementation refactor was needed.

## Phase5: Full verification — preparation and local activation passed

Clean scoped worktrees on both Macs contain only runtime changes and baseline Wrangler work. Native modules are rebuilt on each architecture. Required test/build/index/hygiene/public/debt/package gates pass; focused SWE scan has0 findings. Final independent review passes Standards, Spec and Proof for verified preparation; both peer registry majors pass.

## Phase6: Docs, contracts and closure — local activation complete; publication separate

Commit plan, not authorization: catalog/CI/docs/contracts plus generated index in this repository, after CLI runtime-safety publication is accepted. Do not release Node24 default ahead of its compatible CLI installer. No commit or publication. Local activation was separately approved and completed on both Macs. Preserve canonical dirty work and isolated verification checkouts; all ten primary/peer receipts exist and require preservation.

## Verification and authority boundary

- Source preparation and authorized local activation are complete. Both Macs now select managed Node 24.21.0; installed CLI/native dependencies and active launchers were refreshed. No commit, push, pull request, registry/npm publication or retained-runtime removal was performed.
- Baselines and raw red/green/acceptance logs are preserved under `$RUDI_HOME/outputs/node24-migration/2026-09-30/` on the corresponding machine. Baseline manifests identify pre-existing runtime-binding and Wrangler work.
- Both Macs: CLI Node22 and Node24 suites each pass 838 tests with `RUDI_CLI_TEST_WRAPPER_ACTIVE=1` and target runtime first in PATH. Each uses a separate frozen-lockfile install and native dependency store. Builds, debt runner, package inventory pass.
- Primary registry: 358 tests pass on Node22 and Node24. Peer Node22 and Node24: 358 tests pass on each. Clean scoped checkouts pass validation, generated-index checks, source hygiene, build, seven release SHA-256 checks, public readiness, debt and package inventory. Intent-to-add for the baseline Node22 catalog file makes its ownership visible in these temporary checkouts; no commit was made.
- Primary canonical registry contains unrelated Google Workspace/map-my-work work and four existing generated directories. Preserve it. The clean release candidate contains only the runtime work plus its pre-existing Wrangler dependency. Do not publish the mixed canonical index.
- Both architectures: official24.21.0 archives verify; fresh packed CLI installation opens in-memory SQLite. Sports Stats builds and discovers3 MCP tools; Audio Tools passes8 tests; Content Extractor passes37. SQLite reads/writes pass for staged CLI, Sports Stats and Audio Tools. No persistent database was opened during preparation. Activation later used the selected Service Desk databases read-only for the active-attempt drain guard; no database was copied or migrated.
- Both architectures: generated staged router launcher initializes, lists4 SWE tools, and calls `swe_manual_list` returning13 documents. Staged HOME/RUDI_HOME are isolated; no live host tool refresh is claimed. Dot's separate hosted-chat exposure issue is not fixed by this migration.
- Primary additional addon probes: fsevents2.3.2/2.3.3, sharp, rspack and rolldown load under24. The old primary Sports Stats SQLite was incompatible; its prepared replacement is now active and passes live SQLite checks. Peer fsevents, sharp and rspack addon loads also pass.
- Transient tests: one primary Node22 local-registry fixture failed during simultaneous runs; targeted and final isolated full runs passed. Two peer Node22 process-reaping tests failed under concurrent stack installs, then the unchanged full suite passed when run separately. No assertions were weakened to suppress these observations.
- Linux/Windows execution and GitHub-hosted CI have not run. Linux descriptor hashes were verified against the official manifest; supported release CI is configured. Native checks do not prove every authenticated provider operation or complete video rendering/transcription workflow.
- Runtime replacements retain backups. Interrupted installs may retain a lock or staging directory; automatic crash recovery is not claimed. Retire evidence only after activation, consumer acceptance, and explicit scoped cleanup approval.
- Publication requires its own authorization and a new CLI release version; the local test tarball retains development version1.10.27 and is not an npm release candidate with a new version.

## Authorized activation — September 30, 2026

The user explicitly approved activating Node 24 on both Macs, installing the verified CLI/native dependencies and rebuilding active launchers with rollback copies. Each Mac independently installed its official archive with the reviewed runtime installer. Runtime lock verification passes. New shell/CLI/router/daemon processes use Node 24.21.0 and npm 11.19.0; pnpm remains 10.22.0. Wrangler remains on Node 22.23.2.

- Both live canonical CLI checkouts: 838 tests pass with wrapper fallback disabled, build/debt/package/diff checks pass, and distribution hashes match the reviewed candidate. No runtime implementation changed during activation.
- Live router acceptance: primary 447 tools, admin 469 tools; initialize, tools/list and swe_manual_list succeed with 13 manual documents each.
- Fresh architecture-specific native dependencies: installed CLI, CLI development checkout, Service Desk, Sports Stats and Audio Tools pass in-memory SQLite reads/writes. Primary 31 and peer 39 native files load with their correct Node/SQLite loaders. Historical app backups remain on their original ABI and are excluded from active-runtime acceptance.
- Service Desk's execution-attempt guard passed read-only. Original workers exited after SIGTERM, a tested temporary entry hold prevented automatic relaunch from starting application work, and exact original entry bytes/mode were restored before bootstrap. Both daemons report ready. The primary's three existing Codex processes remain alive.
- Primary Codex 0.147.0 and Gemini 0.53.1 were preserved at their exact versions outside the replaceable runtime under ~/.local. Their RUDI wrappers now target those installations through explicit managed Node.
- One operational assertion initially checked hold-process disappearance immediately after launchctl bootout; the process was still exiting. This occurred before runtime mutation. The controller verified natural worker exit, unloaded jobs and restored entry before continuing; the peer sequence polls for hold exit. No application worker was force-killed.
- Retained per-Mac rollback journals: outputs/node24-migration/2026-09-30/activation/activation-state.json. Preserve old runtime, CLI/native directories, lock bytes/absence, launchers and evidence together. No credentials, databases or mutable application state were transferred between Macs.

Existing gaps remain separate: Dot hosted-chat tool exposure; primary Service Desk's Codex allowlist 0.146.0 versus preserved CLI 0.147.0; broken Homebrew Node 25 with declared consumers. Existing host processes may retain Node 20 until their normal reconnect. No global host restart, old-runtime deletion, commit or publication occurred.

## Draft publication review — October 6, 2026

The owner requested that these runtime changes remain in a draft PR while other Registry work proceeds. The candidate is isolated on current main `8e09556`, preserving every unrelated canonical change on both Macs. Its generated index changes only `binary:wrangler`, `runtime:node` and `runtime:node-22-23-2`.

CLI source PR #47 has merged, but published npm version 1.10.27 still lacks the explicit runtime-binding and runtime-tree checksum support. The published tarball's npm SHA-512 integrity was verified before inspection. This draft must not merge until a compatible CLI npm release is published and its artifact is verified; Git source acceptance alone does not close that gate.

Current isolated verification: all 358 Registry tests pass on Node 22.23.2 and 24.21.0; validation, index generation/check, catalog hygiene, build, release provenance, public readiness, debt scan, package dry-run and whitespace checks pass. A focused scan of the four changed TypeScript files has zero findings. All eight Node platform hashes match the official SHASUMS256 manifests. No new runtime behavior was implemented in this review; prior red/green evidence remains above. GitHub CI for this draft and a compatible CLI npm release remain publication prerequisites.
