# Native reviewer startup account snapshot

## Phase 0: Baseline and manual lookup

Baseline a529104. Owner installation of Codex 0.160.1 passed the bounded
authenticated catalog check and advertises Astra/xhigh. The CLI emits an initial
`account/updated` routing notification, which the adapter currently rejects.
Official rust-v0.160.1 account processor sends this asynchronously on connection
initialization after routing discovery. It can precede or follow account/read.
Manual: Master Engineering Doctrine boundaries/failure behavior, Appendix C
red-green, Appendix D diagnosis. High risk: private-source admission boundary.
Bounded horizontal scan: only the native observer consumes account notifications;
the GitHub controller calls that observer and retains independent acceptance gates.

## Phase 1: Scope lock

Permit exactly one well-formed initial ChatGPT account notification when routing
is present. Wait under the existing deadline, match its plan to account/read,
close notification admission, then re-read and compare the complete account and
routing snapshot before starting a thread. Keep identity only in memory.
Reject duplicates, malformed/mismatching messages, account/routing changes,
missing required notification, cancellation, and every later account update,
including shutdown drain. No model/effort fallback or changed acceptance claims.
Expected files: observer, focused tests, native protocol documentation, this plan,
and generated index via indexes:sync. One reviewed source commit; user previously
authorized feature-branch publication and narrow admin peer synchronization.
Separate reviewed owner package is required for protected installation and one
new finite successor request. Preserve all prior failed requests and stop records;
no merge, scheduled operation, credential copying or failed-request replay.

## Phase 2: Red tests

First behavior: the real 0.160.1 startup notification followed by stable ChatGPT
routing permits exactly one Astra/xhigh review. Assert a second account read
occurs before thread/private turn. Run the focused test before implementation.

## Phase 3: Implementation

Use existing deadline/cancellation/failure races. Snapshot data before waiting;
no notification opens authority. Close startup admission before the confirmation
read. Return only existing sanitized review observations; no account identifiers.

## Phase 4: Green tests and refactor

Rerun unchanged red assertions, then add timing and negative boundary tests.
Retain existing malformed early and late notification rejection tests.

## Phase 5: Full verification

Required registry gates, affected stacks, scoped debt scan, fresh independent
Astra/xhigh Standards/Spec/Proof review, and admin peer checks. Fixtures prove
protocol behavior; authenticated owner-run proof remains a separate boundary.

## Phase 6: Docs, contracts and closure

Pending verification, source/peer revision, private owner package and finite
review result. Startup/catalog success alone does not prove an operational
review or publication. Preserve task worktrees with read-back closeout receipts.

## Source proof checkpoint

The focused startup test failed with `Native review rejected` before the fix.
The unchanged assertions pass afterward. All 83 native protocol/process tests
pass, including delayed startup, stable identity/routing, malformed/duplicate/
mismatching notices, missing notification, cancellation, timeout, and valid late
updates during confirmation/thread/turn/drain. Snapshot comparison also rejects
mutation of a reused transport object. No account data appears in observations.

Registry tests, validation, index sync/check, hygiene, build, pack dry-run,
release verification, public validation, and explicit GitHub/agent-hosts stack
verification pass. Hygiene initially detected reproducible stack dependency and
build folders left by earlier verification; they were preserved outside the
catalog before rerunning the check. Scoped debt reports two files, zero findings.
No structural refactor was needed. Fresh independent review and protected live
execution remain pending; fixture results do not claim either boundary.

Independent review found a P2 plan-enum mismatch: the initial character pattern
rejected valid `ent26` and accepted undefined names. Both behavioral regressions
failed first; exact rust-v0.160.1 PlanType membership closes the defect. Full native
protocol/process rerun: 83 pass. Confirmation review remains pending.
