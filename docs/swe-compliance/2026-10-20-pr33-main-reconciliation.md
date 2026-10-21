# Registry PR #33 reconciliation

## Phase 0: Baseline and manual lookup

- Request: reconcile PR #33 with current main, resolve conflicts, run checks,
  and first check Admin and CRM chats while preserving unfinished work.
- PR head: `5347885355dfb7f5ec51fa275c800a24c61e4346`.
- Main: `32f58f642db81e8b07d365a1185904996aa1c741`.
- Admin chat is idle. The Cloud CRM coordinator and planning chats retain their
  separate consolidation/PR #72 scopes and publication/live-change holds.
- Original Registry checkouts on both Macs are inventoried and left intact.
  Original head/main refs have a verified, independently restored Git bundle.
- Manual: operating index, Agent Co-Pilot standard, master Appendix C
  (behavioral proof) and Appendix A (migration safety).
- Initial risk: high because the existing PR adds migration 0004 and a write
  operation. This reconciliation must not change existing migration bytes or
  operate a live database.
- Conflicts: CRM manifest version, contract/database extraction, generated index.

## Phase 1: Scope lock

- Preserve PR contact discovery/classification and version 0.4.0 while retaining
  main's shared database module, error handling, package classification and
  canonical operator-skill layout.
- Update database readiness/configuration inventories for classification.
- Regenerate the index with the repository generator.
- Non-goals: Cloud consolidation, migration 0035, Admin installation, credentials,
  production data, live services, and other worktrees.
- Horizontal disposition: retain one database/connection owner and one contact
  contract; adapt the extracted module rather than duplicating database logic.
- Intended commit slice: one reviewed main-reconciliation merge with focused
  regression tests and generated index. No commit, push, GitHub merge, package
  publication or deployment is performed by this local reconciliation phase.

## Phase 2: Red tests

- Verify configuration advertises the classification function.
- Verify setup refuses a database lacking migration 0004 objects, then accepts
  the same isolated synthetic database after migration.
- Record exact red commands/results before implementing each correction.

## Phase 3: Implementation

- Keep existing SQL migrations 0001–0004 byte-identical to their authoritative
  main/PR versions. Use a temporary local PostgreSQL cluster for integration proof.
- Keep contact mutations behind the existing typed, parameterized contracts.
- Do not copy or modify unfinished source in other checkouts.

## Phase 4: Green tests and refactor

- Rerun each regression unchanged; run the complete CRM suite and isolated
  migration/contact/people/finance behavior checks.
- No unrelated refactoring or dependency changes.

## Phase 5: Full verification

- Required Registry tests, validate/build, index sync/check, clean catalog,
  package dry run, release/public-readiness checks and changed-stack verification.
- Scoped JS/TS debt scans and independent Standards/Spec/Proof review.
- Recheck remote main/head and unchanged original-worktree evidence before handoff.

## Phase 6: Docs, contracts and closure

- Current CRM README/operator skill must describe the resulting 20-tool contract.
- Record completed checks, remaining proof gaps, review and worktree disposition.
- Status: reconciled source passes local gates; independent review and closeout
  evidence are recorded below. Publication and live adoption remain separate.

## Verification record (2026-10-20)

- Resolved all three merge conflicts; no unresolved index entries remain.
- Retained main's database ownership, TLS configuration and error handling, while
  restoring PR #33's contact factory and multi-email people response. No SQL
  migration bytes or package dependency versions were changed by reconciliation.
- Added the classification table/function to readiness and configuration
  inventories. The new readiness tests first failed for the missing function
  declaration and for setup incorrectly accepting a database with only migrations
  0001–0003. Each passed unchanged after the corresponding inventory correction.
- Red/green commands: from `catalog/stacks/rudi-crm`, `npm run build` followed by
  `node --test tests/readiness.test.mjs`; the database case uses
  `RUDI_CRM_BOOTSTRAP_TESTS=1` and a disposable synthetic PostgreSQL 17 admin URL.
- CRM integration: `npm test` with both live/bootstrap test flags enabled against
  an isolated PostgreSQL 17.7 cluster: **21 passed, 0 skipped, 0 failed**.
  The source tests cover setup before/after 0004, classification scope and
  replay, promotion collision/rollback, finance rollback, and multi-email reads.
- The first full integration run caught a dropped multi-email response during
  conflict resolution and an incomplete synthetic email-mirror fixture. Restored
  the original PR response and corrected the fixture; no test was weakened and
  no migration was edited. Full integration then passed, including a fresh
  cluster reproduction with the saved runner.
- Public-contract smoke: observation recording, classification/replay,
  category-filtered listing, malformed-category rejection, unchanged people,
  and setup readiness all passed through the reconciled exported API.
- Root `npm test`: **380 passed, 1 skipped**. The skip is an existing gated test;
  it is not represented as executed proof.
- `npm run validate`, `npm run indexes:sync`, `npm run indexes:check`,
  `npm run build`, `npm run release:verify`, `npm run validate:public -- --json`,
  `npm run debt:scan`, and `npm pack --dry-run --json`: passed.
- `npm run stacks:verify -- --stack stack:rudi-crm --prepare`: passed (1/1).
  Explicit selection checks current working source; changed-from selection would
  select from the pre-merge HEAD while this merge remains uncommitted.
- Catalog hygiene initially identified this task's generated CRM `dist` and
  `node_modules`. Both were removed after integration proof; final
  `npm run catalog:clean:check` passed.
- Scoped SWE debt scan: 0 errors, 1 existing size warning. `contract.ts` is
  863 scanner lines versus 948 physical lines on main, below its existing stack
  debt baseline. No unrelated read-contract extraction was added. Registry/CRM
  maintainers own further decomposition when next changing those read contracts;
  closing proof is unchanged API integration tests plus a clear debt scan.
- Horizontal disposition: standardize the existing database/contact boundary in
  this change; no third database owner or new shared abstraction. Cloud CRM
  consolidation remains with its separate coordinator and frozen source trees.
- Updated current README/operator guidance for 20 tools, classification versus
  promotion, and migration readiness. Made the two historical PR compliance
  records generic; original private operational details remain in the private
  recovery bundle rather than public documentation.
- Final preservation audit: all 46 pre-existing RUDI Registry worktrees and all
  23 Admin Registry worktrees have identical revisions, dirty diffs, untracked
  hashes, ignored inventories and instructions. Local branch tips, stashes and
  recovery refs are unchanged. Only this isolated task worktree/branch was added.
- Admin and CRM chats were checked before work and again at handoff; their
  separate scopes and publication/live-change holds were preserved.
- At the end of local verification, GitHub main and PR head remained the
  baseline hashes above. That phase performed no commit, push, GitHub merge,
  installation, Admin update or real database operation.
- Both synthetic PostgreSQL clusters were stopped; the reproduction runner
  removes its temporary cluster after stopping it.

## Evidence and remaining boundaries

The private task packet is `registry-pr33-reconcile-20261020` in the workstation's
RUDI outputs directory. It contains the verified original-ref bundle, before/after
inventories and preservation comparison, immutable migration hashes, red/green
logs, full check logs, scoped debt report, public API smoke, and independent review.
`verify-isolated.py <Registry worktree> <PostgreSQL17 bin directory>` reproduces
all 21 tests from a clean temporary cluster with synthetic fixtures, no network
listener and no live connection input. Install CRM dependencies with `npm ci`
before running it. `repro-result.json` records its successful execution.

- Independent Standards/Spec/Proof review: all three axes and overall passed;
  local acceptance is limited to reconciliation and verification. The report
  is saved as `independent-review.md` in the private packet.
- Pre-existing release follow-up: migration 0004 reads a classification before
  its upsert without serializing concurrent same-address calls. Stored address
  uniqueness is enforced, but returned status/previous-category metadata can be
  stale under concurrency. This reconciliation did not alter the applied
  migration. CRM maintainers should resolve this with an additive migration and
  concurrent-call regression proof before claiming concurrent result accuracy.
- Local synthetic proof does not establish production schema compatibility,
  deployment, hosted Cloud parity, or installed-stack acceptance on either Mac.
- Commit boundary: one main-reconciliation merge, including focused readiness
  tests, generic documentation and the regenerated index. The user subsequently
  authorized committing and pushing this verified result to PR #33.
- Worktree disposition: retain the task worktree and recovery packet after
  publication. The local-phase closeout receipt
  `registry-pr33-reconcile-20261020`, version 2, records `preservation_required`
  and remains in the private packet. A publication transition records the final
  Git state; no cleanup is authorized.
- Verdict: local reconciliation ready for publication review; release follow-up
  and installed/live acceptance remain explicit boundaries.


## Publication authorization (2026-10-20)

The user explicitly authorized committing and pushing the verified
reconciliation to existing Registry PR #33. Admin and CRM chats were checked
again before publication and showed no overlapping Registry work. Main and the
PR head still matched the baseline hashes, and all 22 source files matched the
verified recovery snapshot. The only subsequent source edit is this publication
record; behavior, dependencies and migrations are unchanged.

The publication endpoint is a new merge commit pushed without force to
`fix/26-rudi-crm-contact-discovery`. Commit identity and remote read-back evidence
are recorded in the private publication packet and the PR history. This approval
does not merge PR #33, update installed stacks, adopt source on Admin, or run a
production migration. Retain the task checkout and recovery archives.
