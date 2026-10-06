# Booking pages implementation and verification

## Phase 0: Baseline and manual lookup — complete

Approved contract (refined by user October 5): implement a portable RUDI booking-pages
stack with a Google public-page reader. Calendly and Cal.com links were examples;
their adapters are future extensions and are not required for this delivery. Read
published bookable slots, not private calendar events. Support duration, bounded date
ranges, timezone, dated slots, explicit coverage and observation timestamp. Provide
MCP and text/JSON CLI plus generic operator and personal gcal-hoff routing.

Baseline: registry main at b4bc855c9422a6df1fb6811b14619a01ac57b941 with substantial
uncommitted unrelated work, including index.json and Google Workspace. CLI also dirty.
No checkout changes, reset, cleanup or broad synchronization. Prototype is discovery
evidence only; the production tests start a new red-green loop.

Manual: operating-manual index, Master Engineering Doctrine (boundaries, lifecycle,
failure, Appendix C), Agent Co-Pilot Operating Standard, horizontal stewardship.
Risk: medium (new external-input and provider contract; no credentials or writes).

## Phase 1: Scope lock — complete

Allowed registry paths: catalog/stacks/booking-pages/, catalog/skills/booking-pages/,
generated index.json and dist catalog outputs, this plan and review evidence.
Personal routing changes are prepared privately for Codex and Claude on both Macs.
Keep personal identifiers and URLs outside the registry package and documentation.
No CLI core changes expected. Dependencies: pinned MCP SDK, Playwright, date/time
library only if needed for timezone correctness; explicit browser provisioning.

Inputs: supported HTTPS booking URL, duration, inclusive ISO calendar dates, IANA
timezone, optional event selector. Validate redirects and network boundaries. No
login, slot reservation/selection, booking, messaging or calendar mutation. Fail on
unverified/partial dates instead of returning false empty availability. Bound browser
time, page navigation, output, concurrency, and cleanup. Never inherit user cookies.

Working sequence: shared contract; Google adapter;
MCP/CLI and operator; full verification; independent review; peer verification;
concrete activation handoff. Preserve a provider boundary without claiming support
for unimplemented providers. This explicit user refinement supersedes the original
three-provider wording in the durable goal; interruption left its host status paused.

Commit slices (not authorized): (1) stack and tests, (2) operator and docs,
(3) generated index. Publishing, installation/activation, messages and destructive
actions require separate authority. No commits, pushes, PRs, releases or activation
are authorized by the execution skill alone.

Horizontal scan: registry has generic MCP patterns (brave-search) and isolated
browser lifecycle (opencounter). Reuse conventions, not its encrypted resumable
state or secrets. Decision: standardize one availability contract and browser
lifecycle inside this stack; provider parsing stays provider-specific. No shared
CLI contract change or cross-stack consolidation obligation is introduced.

## Phases 2–4: Red-green implementation — complete, review fixes may reopen

For each behavior record the unchanged test's expected red and observed green.
Refactor only after green. Command: npm test --prefix catalog/stacks/booking-pages.
Evidence ledger will be updated after each coherent checkpoint.

Observed red → green checkpoints, using unchanged assertions after each red:
- `node --test test/contract.test.js`: missing URL rejection; then missing strict
  date/range/duration/zone validation. Both passed after their respective changes.
- `node --test test/result.test.js`: missing normalized coverage/timestamps;
  then accepting incomplete/mismatched/impossible evidence. Both passed.
- `node --test test/browser.test.js`: browser not closed after failure; slow
  provider did not expire; cancellation did not reject. Each passed after fixes.
- `node --test test/google.test.js`: missing rendered schedule evidence; then
  missing landing-page and next-week navigation. Passed after each implementation.
- `node --test --test-name-pattern='more than two weeks' test/google.test.js`:
  navigation returned to already observed dates. Fixed to target first uncovered
  date; unchanged 21-day empty-week fixture passed.
- `node --test test/network.test.js`: unknown origins accepted. Fixed to exact
  provider allowlist. Live diagnosis then showed blocked calendar-pa.clients6.google.com;
  guarded/unrestricted comparison isolated that cause. Added failing host case,
  allowed exactly this Google-owned resource origin, and reran green/live.
- `node --test test/cli.test.js`: CLI options absent. Passed after strict parser.
- `node --test test/mcp.test.js`: tools/list empty. Passed after wiring the real
  shared reader and structured validation failure. No live success is mocked.
- Additional regressions prove that unconfirmed empty lists fail, same-duration
  meeting ambiguity fails, and time slots are never clicked.

Final package run: 19 tests passed on both Macs. First browser test attempt failed because
Chromium was absent; this was environment setup, not counted as behavioral red.
`npm run install-browser` provisioned the pinned browser before the real red run.

Live proof (October 5, 2026; private artifacts retained outside the catalog):
Google 30/45/60/90-minute reads each covered seven days, succeeded without login,
and took 4.23–4.73s. Next-week lookup succeeded; 31-day lookup crossed October into
November with complete coverage. UTC offsets change correctly under deterministic
DST tests. A Pacific-zone read of an Eastern-displayed Google schedule correctly
failed timezone verification. The API requires the page's display timezone;
caller-side presentation conversion uses verified timestamp offsets.

Dependency choices: SDK follows the adjacent pinned stack pattern; Playwright
replaces the Codex wrapper; Luxon handles calendar validation and DST ambiguity.
No agent host paths or personal values exist in the package.

## Phase 5: Verification — complete; final review verdict recorded below

- Focused behavior, browser fixture, MCP, CLI and package contract tests.
- Live unsigned-in Google 30/45/60/90 and date navigation;
  record exact observed limits and compare DOM with normalized output.
- Registry: npm test; npm run validate; npm run indexes:sync;
  npm run indexes:check; npm run catalog:clean:check; npm run build;
  npm pack --dry-run --json; selected stacks:verify.
- RUDI swe_debt_scan scoped to task JS; independent fresh-context Standards,
  Spec and Proof review; close all blocking findings and rerun affected checks.
- Clean isolated RUDI router/CLI integration and peer source/dependency validation.

Initial catalog failures (invalid category and missing capability facet on the new
operator) were corrected in the new package. Selected verification runs in an
isolated home, so package `verify:prepare` now provisions its pinned Chromium;
run selected verification with `--prepare`. Initial failed commands are retained
as setup evidence, not represented as successful verification.
Task-scoped RUDI debt scan: 18 JS files, zero errors/warnings/findings.

Personal routing is prepared privately with before/after SHA-256 values for the
four Codex/Claude skill/reference files; active native instructions are unchanged.

Independent review found two defects, both corrected with red-green proof:
- Playwright routing originally missed HTTP redirect hops. A real Chromium/server
  test failed because the redirect destination was fetched. Requests now use
  `maxRedirects: 0`; allowed navigation redirects become fresh checked document
  navigations and resource redirects fail closed. A bounded resolver validates
  every initial redirect hop. The unchanged forbidden-destination test passed;
  an additional allowed-redirect test first failed, then passed. The reviewer also
  verified a forbidden second hop and redirected resource receive no request.
- A current standard-time label could identify multiple zones that diverge later.
  The fixed-January clock test first accepted `Central Standard Time`, then rejected
  it after restricting identity to exact city labels. Generic seasonal labels no
  longer establish the IANA zone. All Google fixtures remain green.

Final gates:
- Registry tests: 33 files, 358 tests passed; validation: 177 passed, zero failed.
- Index sync/check and build passed after final source changes.
- Selected stack verification with `--prepare`: 19 passed in an isolated home.
- Catalog hygiene: zero targets after relocating only task-created dependencies
  into a preserved private verification package; no retained evidence deleted.
- Pack dry run: all 23 stack/operator files included; no dependencies or private
  evidence included in the package.
- Scoped debt scan with graph root `catalog/stacks/booking-pages`, three explicit
  entrypoints: 18 JS files, zero findings. An earlier wrong graph root reported
  zero files and is not counted as verification.
- Actual installed RUDI router: isolated configuration lists the tool and returns
  a successful live 45-minute query. Actual `rudi run booking-pages --input`:
  successful live query in a separate temporary RUDI home. Real user config unchanged.
- Final Google reads: 30/45/60/90 minutes, next week, and 31-day range; about 5–7
  seconds locally. Independent direct browser DOM extraction matched every day
  and slot in a seven-day CLI result, including explicit empty-day labels. The
  live timezone text was `New York Time`. Results are observations, not held slots.
- Admin Mac: 23 source/operator checksums match; separate npm/browser provisioning,
  19 tests passed, live read passed. Verification occurs in a scratch directory;
  its canonical dirty registry and active skills remain untouched.
- All eight current personal routing files across both Macs match the prepared
  before-checksums. Identical portable drafts are ready; activation requires a new
  checksum comparison before replacement.

The installed router launcher fixes its own home, so isolated verification invoked
the installed router JS with Node and a temporary RUDI_HOME. The CLI also requires
the stack at its standard temporary stacks path, not only a config entry. Initial
empty-list/not-installed attempts were harness setup failures, then corrected and
successfully rerun. No CLI core changes were needed.

## Phase 6: Closure — activated after approval

Required: docs match behavior, source and private routing preserved, no unrelated
changes overwritten, live proofs and limitations recorded, review accepted,
cross-Mac state verified or precise unresolved gate recorded. Record closeout receipt
or owner/trigger/closing proof if Repo Steward is unavailable. Activation and
publication remain separate gates; report them explicitly.

Commit slices remain uncommitted and unstaged; no publication or release occurred.
No Calendly/Cal.com adapter is claimed. No new horizontal consolidation obligation.
Operational limitation: Google's rendered English structure and city timezone
labels remain a dependency; failures return no inferred availability. Canonical
peer synchronization and installed-stack/private-skill activation are deferred
until their separate authorization; scratch peer verification is complete.

Independent fresh-context final verdict: **Standards pass; Spec pass; Proof pass;
overall pass; no open actionable findings.** The reviewer independently reran the
18-file debt scan and checked final packaging, peer and live evidence. Live DOM
completeness comparison samples one seven-day schedule; the other durations and
ranges are supplemented by live smoke reads and deterministic fixture tests.

Closeout proof gap: Repo Steward preflight/status succeeded for the exact registry
checkout; a bounded lease was acquired and then released. The initial `observed`
receipt request was rejected with `classification is not allowed at closeout
receipt creation.` No receipt was created and no Git mutation occurred. The
worktree-closeout skill requires stopping on validation failures; the ledger step
was stopped rather than representing a rejected write as recorded. Owner: this
task's delivery operator. Trigger: next authorized continuation/activation.
Closing proof: create an observed receipt without creation-time classification,
transition to preservation_required, read back, release lease. Preserve all source
and unrelated dirty work in the meantime. This is an administrative proof gap,
not an unresolved code-review finding or a cleanup approval.

Delivery verdict: **implementation verified; activation decision pending**.
No activation, canonical peer synchronization, commits, pushes or release have
occurred. Prepared private manifests contain the exact eight target paths and
before/after checksums. Activation scope is the new stack/operator on both Macs,
browser provisioning, native Codex/Claude routing updates after hash rechecks,
RUDI tool-index refresh, and a live lookup through the installed route. A stale
source or target checksum must stop that activation before overwrite.

### Approved activation — October 5, 2026

User instruction `yes install` authorized the proposed stack/operator installation
and private `/gcal-hoff` routing on both Macs. Activation is complete. The earlier
pending-gate paragraphs above describe the pre-approval checkpoint.

- Installed `stack:booking-pages` and `skill:booking-pages` version 0.1.0 through
  the existing RUDI installer from the reviewed local catalog on both Macs.
  Native operator projections exist in Codex and Claude. Browser dependencies
  are provisioned locally on each host. No credentials were needed or copied.
- Activated all eight private routing/reference files after exact before/after
  checksum checks. Preserved each original in a machine-local activation backup.
- Initial companion installation failed because the existing CLI's related-skill
  descriptor omits its install source. Explicit operator installation, followed
  by refreshing this task's newly installed stack, completed normal registration
  and indexing. No CLI core changes or broad skill synchronization were made.
- A final installed `rudi run` check exposed a real entry-point defect: installer
  normalization adds a command pointing at the MCP entry instead of root index.js.
  The process exited successfully without availability. Added one regression to
  `test/cli.test.js`: runner input must reach CLI validation and exit 2 for an
  unsupported URL. It first failed (exit 0), then passed unchanged after the MCP
  entry dispatched `RUDI_INPUTS` to the existing CLI handler. Normal stdio MCP
  still uses the same server handler. Independent Standards/Spec/Proof review
  passed this correction; focused CLI/MCP tests passed 3/3.
- Final source and installed package suites: **20/20 on both Macs**. Final scoped
  debt scan: 18 files, zero findings. Index check, build, catalog hygiene and pack
  checks passed after the correction. No broader regression rerun was needed
  because registry/CLI core code was unchanged.
- Actual installed router live reads succeeded on both Macs, with matching
  seven-day results. Refreshed installed `rudi run` also returns live availability
  on both Macs; the local CLI read took 5.91 seconds. All 23 installed code,
  documentation and operator files match current source on both Macs; manifest
  comparison accounts for the installer's derived compatibility fields.
- Existing native agent sessions may need a new session/restart to discover the
  new tool and skill. No running agent session or service was forcibly restarted.

Closeout receipt `booking-pages-2026-10-05` was successfully created and read back
at version 1, state `observed`, in Repo Steward's configured closeouts ledger.
It records acceptance, passing validation, dirty Git state and three preservation
requirements; cleanup is explicitly ineligible. The subsequent classification
attempt was rejected because it tried to change immutable `summary`. Following
the skill, that transition attempt stopped; the lease was released. Remaining
administrative gap: transition the existing receipt to preservation_required
without changing immutable creation fields during a later ledger continuation.
The receipt itself is valid and retained; no cleanup or Git mutation occurred.

Final delivery verdict: **installed and verified on both Macs**. Generic Google
booking-page functionality and private caller routing are active. No Calendly or
Cal.com support is claimed. Source remains uncommitted in the primary registry;
publication and canonical peer Git synchronization remain outside the approved
installation gate. The peer's installed package contains the matching accepted
source, and its existing dirty canonical registry was preserved.

### Git cleanup preservation review — October 6, 2026

The accepted installed source is copied into a dedicated review worktree based
on main after Workspace PR74. Original canonical files and exact source backups
remain unchanged. This candidate is intended for a draft preservation PR only.

The package declares Node 22+ while the current public runtime catalog still
selects Node 20.10.0. Runtime PR #72 is held until a compatible CLI npm release is
available. Do not merge this Booking Pages catalog entry until a fresh install
through the public CLI/runtime path can satisfy the declared engine requirement
and the package passes verification there. Existing installed copies are separate
from this publication hold and remain unchanged.

Proposed scope: preserve the 24 source/operator/proof files and regenerated index
in two commits on a feature branch, open a draft PR, verify remote file contents,
then reconcile only the backed-up Booking Pages files and mixed generated index
out of the canonical primary checkout. Leave both canonical Macs clean on the
accepted main. No runtime merge, installed package update, browser provisioning
in active installations, live booking, calendar write or email send is included.
Publication and canonical reconciliation require the user's next approval.

This refresh introduces no new executable behavior; prior red-green and live
evidence above remains historical. Current deterministic checks are recorded
in the accompanying review evidence; no new live-provider proof is claimed.

Current draft-review proof: 20/20 package tests pass on Node 22.23.2 and Node 24.21.0;
isolated selected-stack verification with browser preparation passes 20/20. Registry
356 tests and all prescribed validation/index/hygiene/build/provenance/pack gates
pass. Public readiness passes with the exact new package files temporarily staged
for the tracking check; that review staging is undone afterward. Focused debt
scan covers 18 JS files with zero findings. All 23 distributable source/operator
files are included in the 1,118-file package dry run. Generated index changes only
the Booking Pages stack and operator. No live-provider query was rerun.

Current npm audit reports one high SDK dependency advisory (GHSA-6qxp-vccf-f47h)
in the existing pinned 1.30.0 dependency. No dependency change was made during
this preservation review. Triage/remediation and fresh public runtime compatibility
remain required before promoting this draft; the draft itself is not a release.
