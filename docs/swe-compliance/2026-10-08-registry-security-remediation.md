# Registry security remediation

## Phase 0: Baseline and manual lookup

- Baseline: bb257decedf7f2313ccbc9ab6c9daad43ac12c1a, clean isolated worktree.
- Input: private security scan of 8e09556f057e2e4aa578a8459d5bd6668ad0803c; 22 findings. Do not publish the private report.
- Standards: repository AGENTS.md, SWE manual security standard, agent co-pilot standard, Appendix C red-green testing.
- Risk: high (credential isolation, command execution, filesystem and release authority).
- Invariants: credentials stay on configured provider origins; tool data never becomes shell code; writes remain within authorized roots; publication and token state cannot lose or duplicate effects; released payloads have complete integrity coverage.

## Phase 1: Scope lock

Fix validated scan findings while preserving documented legitimate capabilities. Reassess ambiguous trust-boundary claims; do not silently mark unverified findings fixed. No unrelated refactors or dependency upgrades.

Planned independently reviewable slices:
1. GitHub request origin and video-editor process execution (#1–2).
2. Processor HTTP/filesystem/frontend boundaries (#4–5,18).
3. Account and publication state integrity (#13,16,21–22).
4. Registry compilation, provenance and CI (#7,9–10,12,14–15,20).
5. Content intake and document/browser rendering budgets and boundaries (#3,6,8,11,17,19).

Authorization: local implementation and validation approved. Commits, push, PR, merge, deployment and service restarts are not authorized. Admin Mac synchronization must use normal Git history after approval; inspect remote state before any update.

Horizontal scan: inspect existing helpers in each changed stack before introducing a shared contract. Cross-stack consolidation is not automatic; record obligations and retain package portability.

## Phases 2–4: Red, implementation, green and refactor

For each behavior, record an unchanged failing regression command, minimal fix, and passing rerun. Do not batch speculative tests before implementation. Use fake credentials, temporary fixtures and mocked provider APIs; never mutate live external state.

| Finding | Disposition | Evidence |
| --- | --- | --- |
| 1: Shell execution | Implemented; focused proof and independent review pass | Proof log below |
| 2: GitHub bearer origin | Implemented; focused proof and independent review pass | Proof log below |
| 3: Document upload boundary | Implemented; focused proof and independent review pass | [Rendering](2026-10-08-render-security.md) |
| 4: Processor filesystem | Implemented; focused proof and independent review pass | [Processor](2026-10-08-processor-security.md) |
| 5: Processor authentication | Implemented; focused proof and independent review pass | [Processor](2026-10-08-processor-security.md) |
| 6: Social media URL destinations | Implemented; focused proof and independent review pass | [Network](2026-10-08-network-security.md) |
| 7: Catalog payload hashes | Implemented; focused proof and independent review pass | [Registry](2026-10-08-registry-integrity.md) |
| 8: Remote/base64 size limits | Implemented; focused proof and independent review pass | [Network](2026-10-08-network-security.md) |
| 9: Immutable action revisions | Implemented; focused proof and independent review pass | [Registry](2026-10-08-registry-integrity.md) |
| 10: Deleted stack verification | Implemented; focused proof and independent review pass | [Registry](2026-10-08-registry-integrity.md) |
| 11: HTML renderer isolation | Implemented; focused proof and independent review pass | [Rendering](2026-10-08-render-security.md) |
| 12: Atomic index compilation | Implemented; focused proof and independent review pass | [Registry](2026-10-08-registry-integrity.md) |
| 13: Publication claims | Implemented; focused proof and independent review pass | [State](2026-10-08-state-security.md) |
| 14: Alias collisions | Implemented; focused proof and independent review pass | [Registry](2026-10-08-registry-integrity.md) |
| 15: Verifier containment | Partial: containment enforced; native macOS Chromium unsupported, Linux proof pending | [Registry](2026-10-08-registry-integrity.md) |
| 16: Google account boundaries | Implemented; focused proof and independent review pass | [State](2026-10-08-state-security.md) |
| 17: Generic URL destinations | Implemented; focused proof and independent review pass | [Network](2026-10-08-network-security.md) |
| 18: Metadata DOM rendering | Implemented; focused proof and independent review pass | [Processor](2026-10-08-processor-security.md) |
| 19: Render resource budgets | Implemented and 23/23 tests pass; fresh independent acceptance blocked | [Rendering](2026-10-08-render-security.md) |
| 20: Release credential authority | Implemented; focused proof and independent review pass | [Registry](2026-10-08-registry-integrity.md) |
| 21: Plaid store concurrency | Implemented; focused proof and independent review pass | [State](2026-10-08-state-security.md) |
| 22: Preview state separation | Implemented; focused proof and independent review pass | [State](2026-10-08-state-security.md) |

## Phase 5: Full verification

- [x] Relevant stack suites and builds; per-slice evidence linked above.
- [x] npm test; npm run validate; npm run indexes:sync; npm run indexes:check; npm run catalog:clean:check; npm run build; npm pack --dry-run --json.
- [x] Focused JS/TS debt scans, zero findings in each meaningful scope; full root CI scan also zero.
- [ ] Independent fresh-context read-only review: Standards / Spec / Proof. Initial reviews and corrections complete, but final rendering acceptance review was blocked by a cybersecurity safety filter. Do not treat author confirmation as independent acceptance.
- [x] Runtime smoke checks at actual safe boundaries; native macOS browser/OS containment incompatibility and Linux proof gap explicitly recorded.

## Phase 6: Docs, contracts and closure

- [x] Behavior documentation and generated index match source.
- [x] Commit boundaries and publication status recorded: isolated feature worktree, uncommitted/unpublished; approval required before publication.
- [x] Horizontal obligations have owner, trigger and closing proof; see delivery obligations below.
- [ ] Worktree preservation / closeout receipt.
- [x] Admin Mac synchronization explicitly deferred pending accepted Git history and publication approval; peer readiness inspected.

Status: local implementation and prescribed repository gates complete; security acceptance remains incomplete because of the explicit Linux/browser and independent-review gaps. No deployment or release claim.

## Proof log


### GitHub and video execution proof

- #2: `npm run build && node --test --test-name-pattern='REST paths cannot' tests/core.test.mjs` in github failed with missing rejection, then passed after parsed-origin equality enforcement. No real token/network used. Second redirect/enterprise-path test failed on absent `redirect: error`, then passed. `npm test`: 13/13 including MCP startup, build green.
- #1: `node --test test/quick-tool-security.test.mjs` in video-editor failed because shell substitution changed a literal output filename. Same test passes after all quick-operation exec strings were removed, fixed argv reused via lib/process.js, filesystem APIs replace shell utilities. `node --import tsx --test test/quick-options-security.test.ts` proves input validation and all 11 quick media operations with real tiny ffmpeg fixtures. Fixed argv temp concat manifests use generated relative names.
- Process bounds: `node --test test/process-bounds.test.mjs` independently red→green for output caps (1024-byte fixture cap) and deadline termination; quick operations use 50 MiB / 10 minute command budgets.
- Additional source hardening: removed eval-based frame-rate parsing with a pure ratio parser; parser tests green. No historical executable-metadata red proof was claimed.
- Green refactor: moved quick operations out of oversized MCP index into quick-tools.ts; unchanged literal-filename regression and build green.
- Independent review caught CLI numeric timestamp coercion incompatibility. Added real CLI trim/thumbnail numeric-second regression, observed `start must be a timestamp` failure, then preserved lexical timestamps in the CLI parser; unchanged regression green.
- Focused SWE debt scans: GitHub 2 files and video 8 files reported, zero findings. Temporary scanner config uses anchored ignore regex because default `.git` accidentally excludes `github`; process.js is an explicit runtime entrypoint because TS graph otherwise resolves only process.d.ts. No scanner source changes.
- Complete video `npm test` and `npm run build` green after CLI correction. Independent reviewer reconfirmed the numeric timestamp CLI regression with actual FFmpeg.

### Review status

Independent first-slice review reran GitHub 13, Plaid 3, Google 2, Processor HTTP 5/frontend 2, social PostgreSQL 3, video 7 focused tests. One P2 CLI compatibility regression was corrected with new real-CLI proof and independently confirmed. Registry review caught two P1 containment issues (symlinked writable roots and parent environment access); corrected regressions were independently confirmed. A rare process-group cleanup EPERM was reproduced deterministically, corrected, and passed the full root regression suite. Network independent review passes Standards / Spec / Proof for the stated public HTTP scope. Render review validated document isolation and requested three resource-limit corrections. Those corrections plus deterministic PNG rendering are implemented and pass the complete rendering suite; fresh independent review was blocked, as recorded above.

### Final integration evidence (in progress)

- Social complete suite with PostgreSQL 17: **75/75 passed, zero skipped**, including all real database concurrency cases and the network changes.
- Portable browser-context parity contract: `npx vitest run src/render-context-contract.test.ts` passed.
- Document QA scoped debt scan: 4 graph files / 4 reported, zero findings.

### Peer readiness

Read-only admin-Mac inspection resolved `/Users/admin/RUDI/apps/platform/registry`, Git 2.55.0, clean `main` at the same baseline `bb257decedf7f2313ccbc9ab6c9daad43ac12c1a`. Applicable remote global/workspace/repository instructions were read. Only ignored root `dist/` and `node_modules/` were reported. No remote source or runtime changed. Synchronization is deferred until an accepted feature-branch commit exists and publication is authorized, as required by both Macs' workspace instructions.

### Catalog hygiene ordering

Initial validation passes all 174 packages. Initial `catalog:clean:check` correctly fails on 19 ignored build/dependency/Python-cache directories created during this task's tests. After final stack proofs, remove these reproducible artifacts using the repository cleanup runner, then regenerate/check indexes and repeat catalog cleanliness. No user runtime state was among these targets.

## Final validation and delivery obligations

All commands are from this isolated worktree; stack suites run from their package directories. No installed stack, live provider, or admin-Mac runtime was updated.

| Gate | Result |
| --- | --- |
| `npm test` | 372 passed; one explicitly opt-in browser sandbox proof skipped |
| `npm run validate` | 174 packages passed |
| `npm run indexes:sync` / `indexes:check` | Passed; canonical index regenerated, never hand-edited |
| `npm run catalog:clean:check` | Passed after task-generated artifacts removed |
| `npm run build` | Passed |
| `npm pack --dry-run --json` | Passed; 1,137 files, 11,724,322 unpacked bytes |
| `npm run release:verify` | Seven release artifact SHA-256 hashes verified |
| `npm run validate:public -- --json` | Zero errors/warnings, 174 referenced packages |
| `npm run debt:scan` | 53 graph/reported files; zero findings |
| Final root SWE debt tool | 16 changed/new files reported in 53-file graph; zero findings |
| Final Web Export `npm test` | 23 passed, no skips; normal Chromium and real PDF/PNG outputs |
| Final Document QA `npm test` | Two passed, no skips; no provider invocation |
| Final Social Publisher `npm test` with PostgreSQL 17 | 75 passed, no skips |

The first full root run found a stale exact packaging-pattern assertion after intentionally adding HTML delivery for the processor frontend. Updating that assertion to include HTML preserves the separate actual-pack completeness test; the full unchanged behavioral suite then passed. `git diff --check` passed. Other complete stack suites/builds and behavioral red→green commands are recorded in the slice documents. Final source confirmation inspected print layout freezing, actual PDF geometry checks, fixed bounded artboard capture, and rasterizer deadlines/output accounting, and independently reran the already-authored regressions. This is parent confirmation, not a replacement fresh independent review.

| Obligation | Owner / trigger | Closing proof |
| --- | --- | --- |
| Portable public HTTP helper copies | Registry maintainer whenever any copy changes | Four-copy byte parity plus public HTTP tests |
| Portable document-context copies | Registry maintainer whenever either copy changes | Root `render-context-contract.test.ts` parity plus each renderer suite |
| Linux OS verifier and browser compatibility | This task after feature-branch publication is authorized | Actual Linux CI sandbox and changed-stack verification pass, with containment active |
| Final independent rendering acceptance | Maintainer / authorized reviewer before release | Fresh Standards / Spec / Proof review of final source; blocked automated pass is not acceptance |
| Admin Mac delivery | This task after source is accepted and Git publication authorized | Preserve peer work, synchronize approved Git history, verify revision and relevant gates remotely |
| Installed-stack rollout | Operator after accepted release | Token configuration for optional Processor HTTP server; approved DocQA roots and bundled HTML assets; actual install/runtime verification |

Compatibility changes are deliberate: Processor HTTP requires a strong bearer token; generic URLs must resolve to public destinations; HTML rendering is offline with local assets; Document QA only accepts operator-approved roots; the unrestricted generic browser extraction fallback is disabled; buffered media and render operations have finite documented limits. Historical publication rows and stale Plaid locks are not automatically rewritten; see state evidence. Existing dependency audit notices from installation were not upgraded as part of these scan findings.

### Worktree preservation receipt gap

Repo Steward preflight and exact-root enrollment succeeded for `registry-security-remediation-20261008--root`; fetch is disabled. Status confirmed branch `codex/registry-security-remediation`, baseline HEAD, no staged/conflicted changes, and the intended uncommitted patch. The receipt create request was rejected because it supplied transition-only `classification`/`disposition_summary` fields at creation. No receipt or transition was created. The closeout skill says, “Treat version, lease, validation, or transition failures as stopping conditions.” This closeout attempt stopped and its lease was released; no substitute receipt or cleanup occurred. Source inspection subsequently identified the creation-only contract (observed state plus summary, classification/disposition belong to a later transition) for a future authorized closeout attempt. The worktree and all source evidence remain preserved; this is a local administrative proof gap, not a failing code/test gate.

## Publication authorization

After reviewing the local results and remaining gaps, the user explicitly authorized committing, pushing the feature branch, and opening a draft pull request for Linux CI. This authorizes those publication steps only; merge, release, installed-stack rollout, and peer integration remain separate. The staged audit removed one trailing blank line in the new video quick-tools source; behavior is unchanged.
