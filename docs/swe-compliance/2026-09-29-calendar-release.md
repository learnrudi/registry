# Google Workspace calendar release 1.1.2

## Phase 0: Baseline And Manual Lookup

- Scope: reconcile implemented calendar get/update and installed Gmail signatures.
- Baseline: main and signature branch share b4bc855c9422a6df1fb6811b14619a01ac57b941. Unrelated dirty source preserved. Isolated branch codex/calendar-release-20260929.
- Standards: manual index, Engineering Quick Reference (testing/boundaries), Agent Co-Pilot Operating Standard; registry AGENTS; provenance ADR 0006.
- Risk: high rollout risk, medium implementation risk. Preserve account selection, explicit notifications, conditional patches, no automatic mutation retry and installed signatures.
- Horizontal scan: calendar.ts owns creation; calendar-discovery.ts owns minimized discovery; calendar-events.ts owns exact-event reads/patches. No third patch implementation or shared-contract drift. Existing adapter-local timestamp validation does not require consolidation in this release.

## Phase 1: Scope Lock

- In scope: Google Workspace stack, operator skill, generated index and release evidence. Stack 1.1.2; operator 1.0.2.
- Non-goals: OAuth changes; guests/conferences/reminders edits; series editing; all-day conversion; full availability discovery; CCC event changes; unrelated runtime/schema changes.
- Inputs: validate identity, allowed fields, paired timestamps, notification choice, etags and provider read-back.
- Failures: reject invalid input before Google; reject stale state; distinguish uncertain mutation from accepted-but-unverified mutation.
- Commit slices: signature prerequisite and tests; calendar feature and docs; release identity/generated metadata and proof. User requested implementation; explicit Git publication/merge authorization is pending a concrete release decision. Changes remain uncommitted.
- Installation is the intended map outcome. Publication and disposable-event mutation require the final release decision; preparation does not change real events or send mail.
- Exit: combined verified package; preserved source work; fresh independent review; concrete rollout for both Macs.

## Phase 2: Red Tests

- Existing calendar/signature code imported with its tests. Prior red evidence belongs to its source task; no new red claim for already implemented behavior.
- Added release regression: MCP initialize version equals package, manifest and both root lockfile versions. Red command: npm run test:calendar. Expected: MCP 1.1.0 differs from signature package 1.1.1.

## Phase 3: Implementation

- Merge bounded calendar/signature patches. Resolve README overlap by retaining both sections. No dependencies changed.
- Align release identities and operator version. Regenerate indexes with fixed SOURCE_DATE_EPOCH from checked-in index per CI policy.

## Phase 4: Green Tests And Refactor

- Green command: npm run test:calendar. Full package tests and MCP verification follow. No broad refactor.

## Phase 5: Full Verification

Pending: stack tests/build/MCP; registry tests/validate/indexes/hygiene/build/provenance/public readiness/pack; scoped debt; independent Standards/Spec/Proof review.
- Live read smoke uses an existing event. Disposable-event create/update/delete requires an explicit final decision.

## Phase 6: Docs, Contracts, And Closure

Pending results and release disposition. Original source worktrees retained. No commits, pushes, PRs, merges or installs during preparation.

### Verification so far

- MCP version regression failed as expected: actual 1.1.0, expected package 1.1.1. Aligning all identities to 1.1.2 made the unchanged test pass.
- Stack: test:auth, test:drive, test:calendar (8 adapter tests plus existing calendar suite/schema/version), test:gmail, test:gmail-discovery, test:gmail-signature (4 tests), test:slides, test:tasks, test:state, verify all pass. MCP verify: 72 tools.
- Root npm test: 33 files / 356 tests pass. The earlier map's 358 included unrelated dirty-root work excluded from this release.
- Scoped debt: seven changed JS/TS files reported, zero errors, one existing 3201-line index.ts warning. Retain debt; owner Workspace maintainers, reconsider at entrypoint decomposition work, closure by focused routing extraction plus full behavior tests.
- No dependency versions changed. No secret/account/default state added to source.

- Root validate, indexes:sync, indexes:check, catalog:clean:check, build, release:verify, validate:public and npm pack --dry-run --json passed. Pack includes both new modules/tests, no credential/account/node_modules paths. Index diff is exactly stack/skill Workspace metadata. Fixed timestamp follows CI policy; not a claim about today's creation time.
- Authenticated candidate MCP 1.1.2 calendar_get succeeded against an existing event on selected account, with matching identity and etag. No external mutation. Initial scratch setup attempts failed because moved dependencies and a package folder name that did not satisfy existing MCP startup detection; fresh dependency install and canonical package naming resolved setup.
- Independent review identified inherited signature data-loss on external body subject-only updates and duplicate counting for nested MIME alternatives. These deterministic release blockers are in scope to correct before rollout.

### Review corrections

- P1 external-body draft loss: npm run test:gmail-signature failed the MCP assertion that an external-body subject-only update must error. Throwing on external text bodies and requiring nonempty retained bodies made the unchanged assertion pass; strengthened proof also verifies zero update calls.
- P2 nested MIME alternatives: the next npm run test:gmail-signature run failed because plain and nested HTML were concatenated. Recursive HTML discovery and single-alternative selection made that test pass; MCP fixtures verify signed send and metadata update succeed.
- Final signature suite: 5 tests pass. No real email was sent. Calendar behavior, Gmail regressions, build/MCP and scoped debt rerun after corrections. No broad refactor or dependency change.

- Focused confirmation caught a mixed-MIME content-loss regression in the first P2 correction. A new red fixture failed because no exception was thrown for independent authored siblings. Final parsing chooses one alternative only in multipart/alternative, uses the related root for multipart/related, and fails closed for independent mixed body segments. The unchanged unit test is green; MCP fixture asserts zero updates. Related roots honor an explicit Content-ID start selector.

### Final candidate verdict

- Final calendar/Gmail/signature tests, build/MCP, debt, metadata/hygiene/provenance and package inspection pass. Signature suite6 tests. All reviewer findings resolved; Standards/Spec/Proof pass after focused confirmations.
- Ready for explicit release decision. No commit/push/PR/merge/install or real event mutation. Admin remains1.1.0 and primary1.1.1; source/package peer rollout is deferred to accepted Git release. Both native skill copies will preserve drift and scheduling references.
- Remaining proof gap: guest-free disposable-event mutation and installed peer parity. Owner: release operator; trigger: explicit release authorization; closure: both installed identities/tools plus live get/update/read-back/delete evidence.
- Worktree preserved for continuation; receipt recorded via Repo Steward.

### Publication review refresh — October 6, 2026

The complete 1.1.2 source candidate was copied without behavior changes onto
accepted Registry main after PR73. The original calendar/signature candidate and
canonical uncommitted source remain preserved. This replaces the earlier base
for the next publication decision; it does not authorize publication or activation.

- Root: 33 files / 356 tests, catalog validation, deterministic index sync/check,
  catalog hygiene, build, release provenance, public readiness, CI debt scan,
  package dry run and diff checks pass.
- Stack: all nine test scripts pass; calendar adapter 8 tests, signature 6 tests.
  Build and isolated MCP verification expose the expected 72 tools.
- Focused debt scan covers seven changed JS/TS files with the actual MCP/auth
  entrypoints: zero errors, one retained oversized-entrypoint warning (3201
  lines, below the existing 3262-line no-growth baseline). An initial scan without
  stack entrypoints produced configuration-related orphan warnings; the corrected
  scan and executable MCP check supersede that incomplete reachability check.
- Dependency lock entries are unchanged except the release's root version.
  npm audit currently reports 13 existing Registry dependency findings
  (2 moderate, 10 high, 1 critical) and 10 existing Workspace findings
  (7 moderate, 2 high, 1 critical). They are not introduced or fixed by this
  publication. Dependency remediation requires its own tested change; no blanket
  audit-fix operation was run. Workspace maintainers own that follow-up.
- The generated index changes only the Workspace stack and operator entries.
  All new modules and tests are included in the 1095-file package dry run.
- No new red claim: this refresh imports previously tested behavior, retaining
  the earlier red-green evidence above. No new implementation or refactor occurred.
- No live calendar write or email send was performed. The earlier authenticated
  read smoke remains historical evidence; installed peer parity and disposable
  event mutation are still separate activation proofs.

Next proposed publication is the coherent source/tests/docs/release-identity
commit followed by its generated index commit, a feature PR, merge after exact-head
CI, and source reconciliation on both Macs. Booking Pages and runtime changes
remain outside this release. Existing installed packages and private agent routing
are not part of this Git publication.
