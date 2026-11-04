# Backlog acceptance-proof recovery — 2026-10-26

The preparation and publication sections below are dated history. Current
verification status is recorded in the 2026-10-27 follow-up at the end.

## Phase 0: Baseline and manual lookup

- Baseline: `3c8f4f999901ebf4f2943748bea84089442f845d`, clean main.
- Owning records: Registry issue #23, issue #30 / PR #37, and PR #16.
- Inspected the original diffs, current catalog, focused and shared contract
  tests, repository instructions, SWE manual index, migration safety and testing
  doctrine, and agent co-pilot standard.
- Risk: low; this slice recovers test coverage for already present behavior.
- Horizontal scan: shared provider-ownership coverage exists, but does not pin
  Codex's execution owner or installer. Shared portable-skill coverage checks
  publication, but omits the original map output contract. The Site Planner
  runtime suite exists, but the original root catalog test is absent.
- Exit: protect these missing contracts without reverting later catalog changes.

## Phase 1: Scope lock

- Integration owner: this reconciliation chat. Accountable acceptance role:
  Registry maintainer; no person is newly assigned through this document.
- In scope: `src/frontier-agent-catalog.test.ts`,
  `src/map-change-impact.test.ts`,
  `catalog/stacks/site-planner/test/mcp.test.mjs`, this record.
- Non-goals: product behavior, migration SQL/runner, dependencies, old branch
  integration, installed artifacts, database access, live services.
- Trust boundary: canonical documents and generated index are read as test
  inputs; tests must detect ownership/tool-set drift rather than repair it.
- Planned independent slices: Codex proof (#23); map proof (#30/#37);
  Site Planner catalog proof (#16). Commit/push/PR/merge are pending authority.
- Horizontal disposition: standardize tests on the current single manifest and
  flat schema-v2 package index; preserve current shared coverage. Stack-specific
  tests belong in their package, as enforced by the current kernel boundary.

## Phase 2: Red tests

- No behavior is implemented. Strict implementation red/green is inapplicable
  to this test-only recovery; deliberately breaking product code would create
  false lineage. Historical red evidence remains on the original PRs.
- Map tests recover the original assertions. Site Planner assertions migrate
  from retired `manifest.v2.json` to the package's canonical manifest. Generic
  root validation owns index compilation; the package test shares the expected
  seven tools with its real MCP test. Codex proof extends the existing suite.
- Focused tests and negative mutation checks will establish assertion sensitivity.

## Phase 3: Implementation

- Recover only the missing contract coverage. Do not copy legacy manifests,
  generated indexes, or obsolete host-dependent evidence into current source.
- Original evidence remains retrievable at PR #16 head
  `3ed7f9bf5cac43ac81d4914fd6705a83e2097341`, PR #24 head
  `e8140fa1d624b3ab9e7ffcdc3fef5a946421fe9c`, and PR #37 head
  `cd6e48d6b0087edec1d3b697b8f894c405d45c56`.

## Phase 4: Green tests and refactor

- Initial root-focused recovery passed 10 tests. Negative checks rejected
  altered Codex execution owner, removal of the map read-only boundary and
  removal of the required Site Planner write secret, then passed after restore.
- The full root suite correctly rejected a recovered named-stack test under
  `src/`. It was moved into the existing Site Planner package test; no kernel
  assertion was weakened or renamed around. Final proof is recorded below.
- No production refactor planned.

## Phase 5: Full verification

- Final root focused tests: 9 passed. Full root suite: 418 passed, one existing
  opt-in browser skip. Direct Site Planner package suite: 7 passed.
- Validation, index sync/check, build, release hash verification, package dry
  run and whitespace checks passed. Compilation used the baseline index's
  `SOURCE_DATE_EPOCH` to avoid unrelated timestamp churn.
- Root and package JS/TS debt scans each report zero findings.
- Catalog hygiene initially caught the nested dependencies installed for package
  tests. After preserving these task-created dependencies outside the catalog,
  the final hygiene check passes with zero targets.
- Required isolated `stacks:verify -- --stack stack:site-planner --prepare`
  remains blocked: the existing fixture invokes `/usr/bin/git`, whose Xcode
  helper is not readable inside the verification sandbox. Five existing fixture
  setups fail; the new manifest test and existing MCP test pass. The same
  failure was reproduced after temporarily restoring the unchanged baseline
  package test. The candidate was restored byte-for-byte afterward.
- No sandbox policy was weakened. Direct tests do not replace isolated proof.
  Owner: verification-maintainer role; next action: qualify a portable allowed
  Git fixture/toolchain in a separate bounded fix or an approved supported
  environment. Acceptance: unchanged isolated package suite passes under the
  real verification boundary.
- Independent source review found no defects: Standards pass, Spec pass;
  Proof/Overall blocked on the isolated verification gap.
- Live service/host proof is outside this test-only scope.

## Phase 6: Docs, contracts and closure

- Current guides reviewed: README, AGENTS and catalog/operator sources relevant
  to these three contracts. No product documentation change is needed because
  behavior, commands and schema are unchanged. The Site Planner test is shipped
  with its package; release hash generation must include that changed test.
- Original issues and PRs remain the delivery records. This document records
  only the bounded test recovery, not a replacement backlog.
- Publication, integration CI and Admin adoption are pending; local tests cannot
  establish those endpoints.
- Final verdict: needs human decision; draft publication only, not merge-ready.
- Planned slices remain uncommitted. No push, PR creation, merge, host install,
  Admin adoption or deployment occurred.
- Worktree disposition: retain with all four task files and validation evidence.
  Repository HEAD remains the baseline; no cleanup is eligible or authorized.
- Formal worktree closeout receipt is deferred to the publication owner at the
  accepted-delivery boundary. Closing proof: a read-back receipt tying the final
  accepted commit, independent review and CI to this preserved worktree.

## Publication authorization — 2026-10-27

The user authorized committing and pushing these recovered tests, opening a
draft PR, and posting the 14 reconciliation updates to the existing records.
This supersedes the preparation-time pending-publication status above. The
known isolated-verifier failure remains disclosed and blocks acceptance.
No issue/PR closure, merge, Admin adoption or deployment is authorized.

## Isolated-verification follow-up — 2026-10-27

### Scope and diagnosis

- User requested fixing PR #90's isolated-verification blocker and rerunning
  checks; PR #90 remains draft, with no merge or closure authorized.
- Baseline: published `fc9ef9c22d565f4e18fab7434418ab4fcc451ad6`, clean
  feature worktree. Integration owner remains this reconciliation chat.
- Risk: low, test-fixture portability only. Planned single commit changes
  `catalog/stacks/site-planner/test/core.test.mjs`, its README and this record.
- Invariants: real Git repositories and unchanged behavioral assertions;
  identical sandbox policy; unchanged production Git configuration/default;
  no dependency, permission, deployment or Admin-adoption change.
- Expected: all seven package tests run inside the required verifier. Observed:
  five core tests fail in fixture creation at `/usr/bin/git init` before their
  assertions; two manifest/MCP tests pass.
- Ranked hypotheses before implementation: (1) Apple's Git launcher needs
  Xcode files outside the sandbox; (2) Git repository writes are disallowed;
  (3) the recovered manifest assertions broke verification. The repeated
  `file system sandbox blocked open()` error names Xcode's `libxcrun.dylib`,
  falsifying (3). Standalone Homebrew Git `--version` succeeds inside the same
  offline sandbox; the unchanged fixture operations will distinguish (1)/(2).
- Smallest correction: on macOS prefer installed standalone Homebrew Git in
  its standard Apple Silicon/Intel locations, resolve its real path, and use
  that same absolute path for fixture setup and the existing `gitPath` config.
  Retain system Git fallback for direct tests and the existing Linux path.
- Bounded horizontal scan: the hardcoded setup calls occur only in this
  package's fixture; production already accepts absolute `gitPath`. The shared
  verifier resolves its runtime separately. No shared implementation or
  sandbox contract change is needed; horizontal disposition: no action.
- Manual: index, Appendix C (C1/C3/C7A) and Appendix D. This repairs a broken
  harness, not product behavior. No artificial product-red test is added;
  the existing isolated failure is reproduction evidence, not a behavioral
  assertion failure. All existing assertions must pass after harness repair.

### Verification and delivery gates

- Reproduction: `npm run stacks:verify -- --stack stack:site-planner --prepare --json`
  failed with five fixture setup errors on the published baseline.
- The unchanged isolated command now passes all seven tests (zero skips),
  including actual fixture writes. Direct package tests also pass 7/7. This
  confirms the Apple launcher dependency was the fixture blocker. No
  production refactor or assertion change was needed.
- Full root suite: 418 passed, one existing opt-in browser skip. Validation,
  index sync/check, zero tracked index drift, catalog hygiene, build, release
  verification, public readiness, package dry run and whitespace checks pass.
  Source-date pinning preserves the baseline index timestamp. The changed
  package test and README are included in the generated release hash tree.
- Scoped package debt scan: zero findings. Task-created package dependencies
  were preserved outside the catalog after testing; final hygiene passes.
- Evidence: `registry-pr90-isolated-fix-20261027` in the local RUDI output
  store contains baseline/fixed isolated logs, direct/root test logs, gate
  commands and exit codes, and the scoped debt report.
- Fresh independent review: Standards, Spec, Proof and Overall pass for the
  local follow-up, with no actionable findings. The reviewer reran all five
  core tests and verified unchanged assertions and sandbox policy.
- Pending: CI for the follow-up commit. Linux package execution will be
  checked by PR CI; Intel macOS and system-Git-only
  macOS were not executed locally. The README records the macOS prerequisite.
- Current guide impact: document the test-only macOS Git prerequisite and
  root isolated-verification command in the package README.
- Exit: all required local checks pass, no unresolved review finding, verified
  commit pushed to the existing draft PR. Keep the worktree for review; no
  cleanup, merge, closure, host adoption or deployment is authorized.
