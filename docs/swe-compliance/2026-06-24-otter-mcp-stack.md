# Otter MCP Stack Registry Addition

This checklist governs adding Otter's hosted OAuth MCP server to the RUDI public registry as an installable stack.

## Phase 0: Baseline And Manual Lookup

- Status: complete.
- Scope:
  - [x] Add Otter as a public registry stack on a clean branch from `origin/main`.
  - [x] Preserve the existing registry convention of paired legacy `manifest.json`, v2 `manifest.v2.json`, and root `index.json` entries.
  - [x] Use a local stdio bridge because the current RUDI router spawns stack subprocesses over stdio.
- Files to inspect before editing:
  - [x] `AGENTS.md`
  - [x] `README.md`
  - [x] `catalog/stacks/README.md`
  - [x] `schemas/package.schema.json`
  - [x] Representative stack manifests.
  - [x] `src/swe-engineering-stack.test.ts`
  - [x] Local RUDI CLI router implementation.
- Relevant SWE manual sections:
  - [x] Testing doctrine: use behavior-level tests for package metadata risk.
  - [x] Security standard F5/F6/F7: trust boundaries, OAuth/secrets, and supply-chain dependency pinning.
  - [x] Build order: agents/automation depend on stable lower-layer contracts and explicit failure behavior.
- Current-state commands:
  - [x] `git status --short --branch`
  - [x] `git fetch origin main`
  - [x] `git worktree add -b codex/otter-mcp-stack ../registry-otter-mcp origin/main`
- Risks and invariants:
  - [x] Otter authentication is external OAuth; no Otter token or API key belongs in registry metadata.
  - [x] The registry must not add account-specific state, local absolute paths, or secrets.
  - [x] The bridge package must be pinned to avoid an unreviewed floating supply-chain dependency.
  - [x] The stack must expose only the documented Otter MCP tools: user info, search, and fetch.
- Exit criteria:
  - [x] Baseline inspection is complete and scope is locked before catalog edits.

## Phase 1: Scope Lock

- Status: complete.
- In scope:
  - [x] Add Otter stack legacy and v2 manifests.
  - [x] Add Otter stack to the root public index.
  - [x] Add a focused package test for Otter stack metadata and index wiring.
  - [x] Run registry validation, tests, public readiness, and build.
- Non-goals:
  - [x] No native RUDI router HTTP transport implementation in this change.
  - [x] No Otter OAuth login or account-specific live transcript access during verification.
  - [x] No unpinned bridge package.
- Expected files touched:
  - [x] `catalog/stacks/otter-mcp/manifest.json`
  - [x] `catalog/stacks/otter-mcp/manifest.v2.json`
  - [x] `index.json`
  - [x] `src/otter-mcp-stack.test.ts`
  - [x] This checklist.
- External inputs and trust boundaries:
  - [x] `https://mcp.otter.ai/mcp` is a remote MCP/OAuth boundary owned by Otter.
  - [x] `mcp-remote` is a supply-chain dependency executed through `npx`.
  - [x] Tool outputs are meeting data and must remain authorized by Otter OAuth, not RUDI secrets.
- Failure behavior to define:
  - [x] If OAuth is not complete, the bridge/Otter MCP server should fail at connection/tool-call time, not at registry validation time.
  - [x] If the pinned bridge package cannot be fetched, stack startup fails with npm/npx error output.
- Exit criteria:
  - [x] Red test proves the expected registry packaging contract is initially missing.

## Phase 2: Red Tests

- Status: complete.
- Observable behavior to prove:
  - [x] Otter stack must have both manifest formats, the exact pinned bridge command, empty RUDI secrets, and an index entry.
- Test files to add or edit:
  - [x] `src/otter-mcp-stack.test.ts`
- Red command:
  - [x] `npm test -- src/otter-mcp-stack.test.ts`
- Expected failure:
  - [x] The test fails because `catalog/stacks/otter-mcp/manifest.v2.json` does not exist yet.
- Exit criteria:
  - [x] Red failure is recorded before implementation.

## Phase 3: Implementation

- Status: complete.
- Implementation rules:
  - [x] Keep changes scoped to registry metadata and test coverage.
  - [x] Prefer existing manifest conventions and root index shape.
  - [x] Do not commit generated auth state, tokens, or local config.
- Files allowed to change:
  - [x] `catalog/stacks/otter-mcp/manifest.json`
  - [x] `catalog/stacks/otter-mcp/manifest.v2.json`
  - [x] `index.json`
  - [x] `src/otter-mcp-stack.test.ts`
  - [x] This checklist.
- Validation and error-handling requirements:
  - [x] v2 manifest must pass schema validation.
  - [x] Legacy manifest must be installable by current RUDI CLI conventions.
  - [x] Requires no RUDI secrets.
- Observability requirements:
  - [x] Existing RUDI router stderr propagation is sufficient for bridge/Otter startup failures.
- Exit criteria:
  - [x] Red test can pass without broad refactors.

## Phase 4: Green Tests And Refactor

- Status: complete.
- Green command:
  - [x] `npm test -- src/otter-mcp-stack.test.ts`
- Refactor constraints:
  - [x] No unrelated formatting churn.
  - [x] No schema/router refactor.
- Regression checks:
  - [x] `npm test`
- Exit criteria:
  - [x] Focused and full tests pass.

## Phase 5: Full Verification

- Status: complete.
- Targeted tests:
  - [x] `npm test -- src/otter-mcp-stack.test.ts`
- Full suite:
  - [x] `npm test`
- Build/typecheck/lint:
  - [x] `npm run validate:v2`
  - [x] `npm run validate:public -- --json`
  - [x] `npm run build`
- JS/TS debt scan, if applicable:
  - [x] `node catalog/stacks/swe-engineering/src/tools/agent-debt-scan.cjs --repo . --files src/otter-mcp-stack.test.ts --json`
- Live smoke checks:
  - [x] Verified `mcp-remote@0.1.38` npm metadata without starting Otter OAuth.
  - [x] Verified legacy manifest command and root index path with a local Node smoke.
  - [x] Temp-home `rudi install` smoke skipped because this CLI consumes the remote published index; the worktree-local command/index smoke covers the registry contract without OAuth.
- Exit criteria:
  - [x] No registry validation errors and no unreviewed generated files.

## Phase 6: Docs, Contracts, And Closure

- Status: complete.
- Docs or API contracts to update:
  - [x] Manifest/index metadata only; no README hardcoded stack inventory should be updated.
- Final files touched:
  - [x] `catalog/stacks/otter-mcp/manifest.json`
  - [x] `catalog/stacks/otter-mcp/manifest.v2.json`
  - [x] `index.json`
  - [x] `src/otter-mcp-stack.test.ts`
  - [x] `docs/swe-compliance/2026-06-24-otter-mcp-stack.md`
- Commands run and results:
  - [x] `npm ci`: pass; existing npm audit output reports 7 vulnerabilities.
  - [x] Red `npm test -- src/otter-mcp-stack.test.ts`: failed on missing `catalog/stacks/otter-mcp/manifest.v2.json`.
  - [x] Green `npm test -- src/otter-mcp-stack.test.ts`: pass, 1 test.
  - [x] `npm run validate:v2`: pass, 87 catalog package files.
  - [x] Initial `npm run validate:public -- --json`: failed because new Otter files were not yet tracked.
  - [x] Final `npm run validate:public -- --json`: pass, 0 errors, 0 warnings, 87 referenced packages.
  - [x] Initial `npm test`: failed because `dist/` had not been generated in the fresh worktree.
  - [x] Final `npm test`: pass, 101 tests.
  - [x] `npm run build`: pass, generated local ignored `dist/` indexes for 87 packages.
  - [x] Debt scan: pass, 0 findings.
  - [x] `npm view mcp-remote@0.1.38 version bin dist.integrity --json`: pass, package metadata resolved.
  - [x] Local Node command/index smoke: pass.
  - [x] `git push -u origin codex/otter-mcp-stack`: pass.
  - [x] Draft PR opened: `https://github.com/learnrudi/registry/pull/3`.
- Accepted debt:
  - [x] Native remote-HTTP RUDI router support is deferred; current stack uses a pinned stdio bridge.
  - [x] Live Otter OAuth smoke is not performed unless user explicitly authorizes connecting an Otter account.
  - [x] Existing npm audit vulnerabilities from the repo dependency tree are not fixed in this scoped registry metadata change.
- Definition of Done:
  - [x] Otter is installable from the public registry metadata.
  - [x] Tests and validations prove manifest/index consistency.
  - [x] Changes are committed, pushed, and represented on GitHub.

## Follow-Up: Current CLI Install Compatibility

- Status: complete.
- Finding:
  - [x] After PR #3 merged, `rudi install stack:otter-mcp --force` on RUDI CLI v1.10.9 resolved the package but failed validation because the installer treated `https://mcp.otter.ai/mcp` in the command array as a local file entrypoint.
- Fix:
  - [x] Added `catalog/stacks/otter-mcp/src/index.js` as a local Node entrypoint.
  - [x] Updated both manifests to launch `node src/index.js`.
  - [x] Kept the pinned `mcp-remote@0.1.38` bridge and Otter remote URL inside the wrapper.
  - [x] The wrapper uses `process.execPath` so it runs with RUDI's bundled Node instead of relying on a possibly stale system `npx` shim.
- Verification:
  - [x] Focused Otter package test covers the local entrypoint and pinned remote bridge.
