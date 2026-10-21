# Platform CI — 2026-10-21

## Phase 0: Baseline and manual lookup

- [x] Node `registry-ci`, attempt `registry-ci-1`; feature branch
  `codex/platform-ci-20261021` in the assigned worktree, initially clean.
- [x] Exact base/current HEAD:
  `32f58f642db81e8b07d365a1185904996aa1c741` (`origin/main`).
- [x] Read repository `AGENTS.md` and inherited workspace guidance; relevant
  manual sections already loaded in this agent: Agent Co-Pilot standard,
  master doctrine Appendix C, Security F8 and Infrastructure H1. Apply the
  SWE compliance checklist skill used for the related Compute CI node.
- [x] Inspected existing workflow, package scripts, test configuration, source
  generation commands and README. Registry already has validation, a
  three-platform validation matrix and an artifact-only push Release job.
- [x] Medium risk: this controls future source acceptance. Native sandbox
  qualification must remain on Ubuntu 22.04; keep all existing checks, action
  SHAs, publication workflow semantics and platform coverage.

## Phase 1: Scope lock

- [x] Initially only `.github/workflows/registry.yml`, `README.md`, and this
  record could change. Coordinator plan revision 12 explicitly expanded scope
  to `src/quality-gates.test.ts` after its obsolete path-filter assertion
  contradicted universal triggering. No other source/test, catalog, package,
  dependency lock, live service, credential, settings, PR or schedule mutations.
- [x] Proposed single coherent slice: universal CI triggers plus required gate
  and current documentation; static gate validation and feasible repository
  checks are its proof. This node may not commit, push, open PRs or merge.
- [x] Required interface: stable `Registry CI required`, using `always()` and
  exactly `validate` plus `validate-platforms` as dependencies. Every result
  except `success` fails; Release remains excluded because it skips PRs.
- [x] Treat event payload values as untrusted: pass the changed-stack base ref
  through an environment variable and quoted shell expansion. No event value
  is interpolated into executable shell source.
- [x] Horizontal disposition: no obligation / no action. The cross-repository
  aggregate convention has the same strict-success rule with repository-owned
  prerequisites. A tiny local gate preserves explicit ownership; extraction
  would add a shared workflow dependency without reducing meaningful risk.
- [ ] Coordinating task owns fresh-context Astra Standards/Spec/Proof review,
  publication and first hosted execution. Existing PRs remain frozen.

## Phase 2: Red evidence

- [x] Configuration-only scope changes no application behavior. The existing
  quality test required literal path-filter entries and failed after removing
  them; it was updated under the explicit scope expansion to require main
  push/PR coverage without `paths` or `paths-ignore`. Existing quality command,
  deterministic timestamp and package-content assertions remain intact.
- [x] Red: `npm test -- src/quality-gates.test.ts` with the actual workflow
  temporarily replaced by the exact HEAD version — exit 1, specifically the
  no-path-filter assertion. A Python try/finally preserved/restored only this
  node's edited workflow. This proves the new contract, rather than counting
  the obsolete assertion's initial failure as regression evidence.
- [x] Actual YAML validation and all 36 result combinations of its actual gate
  shell passed; only success/success is accepted.

## Phase 3: Implementation

- [x] Remove PR/main-push path filters, retain manual workflow dispatch.
- [x] Add a bounded, read-only, checkout-free aggregate using `always()`;
  preserve the existing platform matrix including Windows and its checks.
- [x] Keep exact action pins, no persisted checkout credentials, no new secret
  references or deployment. Main validation keeps both sandbox protections.
- [x] Update current README to describe trigger coverage, required-check name,
  platform scope and Release's artifact-only boundary.

## Phase 4: Green and refactor

- [x] Actual YAML static assertions and every shell block syntax check.
- [x] Actual aggregate shell truth table, accepting only success/success.
- [x] Green: `npm test -- src/quality-gates.test.ts` — both tests pass, exit 0.
  No application refactor or weakened quality assertions.

## Phase 5: Full verification

Local host: Darwin arm64, Node 24.21.0, npm 11.19.0. The initial proposal
retained Node 20; Astra finding F1 prompted the bounded review correction below
to select Node 24 LTS in all three CI execution paths. `npm ci` installed the committed lockfile into the
isolated worktree; the lockfile is unchanged. The first preliminary test command
used a temporary dependency symlink; it was removed on coordinator direction,
and all subsequent proofs used task-local dependencies.

| Check | Exact command / observed result |
| --- | --- |
| Trigger regression red | `npm test -- src/quality-gates.test.ts` against original HEAD workflow — 1 expected failure / 1 pass, exit 1; the failure rejects existing `paths` filters |
| Trigger regression green | Same command against edited workflow — 2 passed, exit 0 |
| Full suite | `npm test` after the test update — 379 passed / 1 skipped / 1 failed; a bounded unchanged rerun had the same result. `src/stack-verification.test.ts` deadline-descendant case expected `verification timed out after 1000ms`, received `verification process-group cleanup failed (...): kill EPERM` |
| Isolated native case | `npm test -- src/stack-verification.test.ts -t 'terminates verification descendants when the deadline expires'` — 1 passed / 23 filtered, exit 0 |
| Controlled baseline | `npm test` with only workflow and quality test temporarily restored to exact HEAD, then restored in try/finally — 380 passed / 1 skipped, exit 0 (4.65s). This does not establish a failing original baseline |
| Validate | `npm run validate` — exit 0 |
| Index generation/check | With `SOURCE_DATE_EPOCH` derived from committed `index.json.generatedAt`: `npm run indexes:sync`; `npm run indexes:check` — both exit 0, tracked index unchanged |
| Catalog hygiene | `npm run catalog:clean:check` — exit 0 |
| Build/provenance | With the same deterministic epoch: `npm run build`; `npm run release:verify` — both exit 0 |
| Readiness | `npm run validate:public` — exit 0 |
| Packaging | `npm pack --dry-run --json` — exit 0, 1,148 entries |
| Changed stacks | `npm run stacks:verify -- --changed-from 32f58f642db81e8b07d365a1185904996aa1c741 --prepare` — exit 0, no changed stacks require verification |
| Exact edited-test debt | SWE `swe_debt_scan` with repo root and `files: ["src/quality-gates.test.ts"]` — exit 0, zero findings |
| Repository debt | `npm run debt:scan` — exit 0, zero findings |
| YAML/shell | Existing Ruby Psych parsed actual YAML; Python stdin assertions confirmed unchanged action refs, Release job, validation steps, three-platform matrix and Ubuntu 22 sandbox runner; `bash -n` parsed every run block. Actual aggregate shell executed through `bash -e -o pipefail` for all 36 success/failure/cancelled/skipped/empty/unknown pairs — only success/success passed |
| Diff | `git diff --check` — exit 0 |

The native failure is localized to `signalGroup` calling
`process.kill(-child.pid, signal)` in existing `src/stack-verification.ts`.
A suite-context/timing interaction is a hypothesis, supported by two full-run
failures and an isolated pass; the successful original-file baseline prevents
claiming a proven unchanged-baseline failure. No speculative native source fix,
sandbox bypass, expectation weakening or repeated-until-green claim is made.
The opt-in real browser smoke is skipped locally without a browser-cache input.

Exact hosted Linux/macOS/Windows results, Ubuntu 22 native sandbox qualification
and runner images require GitHub CI on the published revision. Actionlint is
not installed; no dependency was added solely for static validation. Existing
Ruby YAML 1.1 interprets unquoted `on` as true; only the local assertion script
normalizes that key. `npm ci` reports 13 existing lockfile advisories (2 moderate,
10 high, 1 critical); dependency remediation is outside this CI-only scope and
must be separately reviewed by Registry maintenance before a dependency update.

## Phase 6: Docs, contracts and closure

- [x] README matches the final workflow; no application or consumer contract changes.
- [x] Evidence records commands, results and explicit hosted-proof gaps.
- [ ] Coordinating task owns the retained-worktree closeout receipt after
  independent review; trigger is source acceptance, proof is receipt read-back
  naming this attempt and exact worktree.
- Publication: no commit, push, PR, merge, release, Admin adoption, deployment,
  GitHub settings, credentials, live database or recurrence changes by this node.
- Verdict: implementation ready for independent review with the full-suite
  native-cleanup failure explicitly unresolved. Fresh Astra review, hosted
  platform/native proof and source acceptance remain coordinator-owned gates.
  Four files changed under the expanded allowlist; no commits created.


## Astra review correction — ci-review-fixes-1

- F1: changed only the three `node-version` selectors from 20 to 24 in full
  validation, artifact-only Release and the platform matrix. README reflects
  Node24 LTS without changing catalog or consumer engine promises. Official
  [Node release status](https://nodejs.org/en/about/previous-releases) checked
  2026-10-21 identifies Node24 as LTS and Node20 as EOL.
- Runtime correction proof: local Node24.21.0/npm11.19.0;
  `npm test -- src/quality-gates.test.ts` passes 2 tests. Parsed workflow
  comparison against the saved pre-F1 candidate confirms only those three
  selectors changed. Package manifest/lock, action pins, Ubuntu22, commands,
  strict aggregate, matrix OS list and Release artifact-only behavior preserved.
- F2 bounded investigation used the rudi-diagnose skill and its investigation
  record. Native same-UID held-zombie group deterministically returned group
  SIGKILL EPERM, single-PID SIGKILL success, and ESRCH after reaping. A copied
  instrumented verifier recorded another normal-close EPERM followed by an
  empty group snapshot; this error class does not require fake timers. The
  one instrumented full suite passed 380/1 skipped, but it is not ordinary
  unmodified final-suite proof and cannot repair prior failed containment proof.
- Supported mechanism: Darwin can retain an exited-only process group that
  returns EPERM; treating that code alone as live cleanup denial is ambiguous.
  Exact historical failing deadline state remains unobserved. Separate future
  application scope would need strict owned-group, bounded absence/exit proof
  and fail-closed handling of live/unreadable groups; no blanket EPERM ignore.
- Original source/tests/config were untouched; the earlier reviewed quality
  test hash is preserved. All own diagnostic groups and fixture directories
  are absent after cleanup. Inert driver/copy/trace evidence is retained in
  the coordinator's `evidence/ci-diagnose/` directory with the full report.
- Review disposition: F1 source correction ready for focused Astra confirmation;
  F2 and merge acceptance remain held pending diagnosis disposition, an ordinary
  complete final-source suite and hosted Ubuntu22 full/native/platform proof.
  No production fix, commit, push, PR, deployment or live mutation performed.

## Bounded cleanup correction — registry-cleanup-fix-1

### Scope, risk and invariant

- Prepared plan revision 37, attempt `registry-cleanup-fix-1`, exact worktree and
  base unchanged. This separately authorized medium-risk behavior change adds
  `src/verification-process-group.ts` and its tests, extracts the existing
  signal handler from `src/stack-verification.ts`, and adjusts/adds only the
  necessary integration tests in `src/stack-verification.test.ts`. README and
  this dated record document the current contract. No other application source.
- Planned coherent source slice: extracted helper, actual native regression,
  minimal fail-closed inspection and tests, documentation and proof. No commit,
  push, PR or merge performed; coordinator owns source acceptance/publication.
- Invariant: signal only the verification-owned detached group. Success/ESRCH
  retain their behavior. Only Darwin EPERM may be reclassified, after an
  independent `/bin/ps` view proves absence or every member is terminal Z with
  the exact group and current UID. Live, unknown, malformed, mismatched,
  interrupted, oversized or inaccessible observations preserve the error.
- The fixed absolute executable receives argument arrays, no shell, a one-second
  timeout and a 64 KiB output bound. The parser validates numeric identities,
  uniqueness and terminal status. No dependency, single-PID fallback, global
  signal, sandbox bypass, timer or promise lifecycle rewrite.
- `cleanupError` remains retained across later successful cleanup. Horizontal
  disposition: resolve in this change / consolidate implementation within the
  existing Registry owner. A small helper separates OS group evidence from
  job lifecycle without sharing state or extracting across language/runtime
  boundaries. No remaining horizontal obligation opened.

### Red, green and safety verification

- Applied red-green skill and existing SWE checklist/manual guidance. First
  extracted the old synchronous signal behavior unchanged. Existing denied
  cleanup test passed on that extraction.
- Actual behavior red: `npm test -- src/verification-process-group.test.ts`
  against the extracted old helper — failed because a real sandbox-owned,
  same-UID held-zombie group returned `kill EPERM`, producing a cleanup Error
  where the regression expected successful terminal-group cleanup. The test
  first independently confirms the kernel EPERM and zombie identity; no
  missing-import or synthetic error served as the behavior red.
- Minimal implementation added the bounded Darwin-only OS inspection. Same
  native regression passed unchanged. The fixture's own parent reaps its child
  and exits; no single-PID cleanup fallback is used by production or this test.
- New boundary tests cover live/mixed members, wrong UID/PGID, invalid/duplicate
  PID, unknown/malformed states, empty successful output, failed/interrupted
  query, missing UID, non-Darwin EPERM, unchanged signal success/ESRCH, and
  invalid group IDs. The existing mock-denial test now explicitly denies
  inspection too, retaining its original failed-result assertion under an
  unobservable-group scenario; an exited, proven-absent group is no longer a
  valid simulation of a live cleanup denial.
- Added integration proof that an earlier live-group SIGTERM denial stays a
  failed result after forceful termination succeeds. Original timeout and
  post-arm absent-late-marker assertions remain unchanged.
- Test harness correction: initial boundary mocks tried to spy on immutable
  native ESM exports and failed setup; Vitest's standard module mock wraps only
  `spawnSync` and preserves the real implementation by default. An early full
  invocation included this harness error and is not accepted proof. Final
  focused green preceded the final ordinary complete suite.

| Final check | Command / observed result |
| --- | --- |
| Focused safety | `npm test -- src/verification-process-group.test.ts src/stack-verification.test.ts` — 56 passed, exit 0, 4.53s |
| Ordinary final suite | `npm test` — 412 passed / 1 opt-in browser skipped, exit 0, 5.16s; original deadline/late-marker case passed |
| Manifest/catalog | `npm run validate`; `npm run catalog:clean:check` — exit 0 |
| Deterministic generation | Existing committed-index SOURCE_DATE_EPOCH; `npm run indexes:sync`; `npm run indexes:check` — exit 0, tracked index unchanged |
| Build/provenance | Same epoch; `npm run build`; `npm run release:verify`; `npm run validate:public` — exit 0 |
| Packaging | `npm pack --dry-run --json` — exit 0 |
| Changed stacks | `npm run stacks:verify -- --changed-from 32f58f642db81e8b07d365a1185904996aa1c741 --prepare` — exit 0, no changed catalog stacks |
| Debt | Exact four changed cleanup TS files through SWE scanner profile ci; repository `npm run debt:scan` — exit 0, zero findings |
| Optional types | Targeted `tsc --noEmit ...` could not resolve baseline-missing `@types/node`; no package/dependency change made. Type checking is not a prescribed package script; transpilation/build/tests pass |
| Scope/diff | Manifest, lockfile and tracked index unchanged; `git diff --check` — exit 0 |

### Acceptance, history and closure

- Current local ordinary full-suite proof is green on Node24.21.0/npm11.19.0,
  Darwin25.5.0 arm64. It does not retrospectively establish the kernel state or
  containment of the historical failed deadline runs. Those raw logs and the
  diagnostic report remain preserved without an all-green reinterpretation.
- No production or runtime deployment occurred. Final native correction needs
  separate fresh Astra Standards/Spec/Proof review. Hosted Ubuntu22 full/native
  sandbox checks and platform matrix, final source publication/merge decision,
  and retained-worktree closeout receipt remain coordinator-owned gates.
- Owner/trigger/proof for closure: coordinator, after independent acceptance,
  records exact final source hashes, ordinary/hosted checks and closeout receipt
  read-back. Current source remains uncommitted and preserved for review.
