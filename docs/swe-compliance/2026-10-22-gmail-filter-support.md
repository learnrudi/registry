# Gmail filter support — 2026-10-22

## Phase 0: Baseline and manual lookup

- Base: `227c866`, clean `origin/main`; isolated branch `codex/gmail-filter-support-20261022`.
- Risk: medium. New account-scoped settings API with persistent create/delete operations; no live mutations authorized.
- References: manual index, Master Doctrine Appendix C, Agent Co-Pilot Standard, Horizontal Engineering Standard; Google's filters resource and management guide.
- Inspected: Gmail discovery/search, Calendar read-back tools, OAuth scopes, manifest, operator skill, five private Gmail identity skills.
- Horizontal scan: no existing filter implementation. Keep shared behavior in one Gmail filter module; identity skills route to the shared operator. Similar validation/read-back helpers in Calendar represent separate provider contracts; no extraction needed.

## Phase 1: Scope lock

- Add `gmail_filter_list`, `gmail_filter_get`, `gmail_filter_preview`, `gmail_filter_create`, `gmail_filter_delete` to source, MCP routing, manifest and current docs.
- Every filter call requires an explicit mailbox and verifies the authenticated profile. Validate unknown fields, IDs, criteria, actions, limits and label references before writes.
- Preview is a bounded, read-only Gmail search query sample, not a native filter simulation or exact future-match count. It never changes messages or unread state.
- Create reads back the saved rule. Delete reads back absence. Timeouts/uncertain writes are not retried; report reconciliation instructions.
- OAuth helper requests `gmail.settings.basic` for future consent; do not read, copy or replace live tokens or run consent.
- Update the five local Gmail identity skills and generic operator guidance; synchronize only approved non-Git skill files after remote inspection/checksums.
- Non-goals: filter updates (provider has no update method), forwarding-address setup, applying rules to old messages, installing/releasing unaccepted source, sending mail, live filter mutation.
- Commit slices: (1) tested filter API + auth scope, (2) current docs/operator + generated catalog. Commits, push, PR, merge and runtime adoption are not authorized by this request.
- Expected source edits: new filter module/tests, `src/index.ts`, `src/auth.ts`, stack package/manifest, stack README, operator skill, generated index, this evidence record. Private skills stay out of the public catalog.

## Phase 2: Red tests

- Prove observable MCP and provider behavior one step at a time; start with an account-verified filter-list call through an isolated MCP fixture.
- Use fake credentials in an isolated state directory and a mock Google client. No live Google endpoints are called.
- Record commands and red failures below.

## Phase 3: Implementation

- Preserve existing account routing and package patterns. No new dependencies.
- Errors must not echo credentials, raw provider request objects or token material.

## Phase 4: Green tests and refactor

- Rerun each failing test unchanged after its smallest implementation.
- Final affected-suite rerun serves as refactor/regression verification.

## Phase 5: Full verification

- Completed: targeted unit/MCP tests, existing stack tests/build, registry test/validate/index/hygiene/build/pack gates, JS/TS debt scan, fresh read-only review. See the verification ledger below.
- Live mutations deliberately excluded by the user's explicit instruction. Mock MCP smoke exercises real routing and schema discovery.

## Phase 6: Docs, contracts and closure

- Verification ledger, independent review, private skill validation and host synchronization completed below.
- Runtime installation/Admin source adoption deferred until accepted Git delivery; never copy application source through SMB.
- Worktree preservation required until reviewed and delivered. Closeout receipt or an explicit proof gap will be recorded.

## Verification ledger (before independent review)

- Red: `node --import tsx --test gmail-filter-tools.test.cjs` failed with `Unknown tool: gmail_filter_list`. A fixture then needed an isolated per-account directory to match existing credential-boundary enforcement; this was corrected without weakening assertions.
- Red/green: `node --import tsx --test gmail-filters.test.cjs` advanced one behavior at a time: get, preview, create, delete each first failed as an unknown tool, then passed unchanged. A null preview limit was initially accepted; its failing test preceded rejection. A provider-error disclosure test failed before sanitizing errors and then passed.
- Green: `npm run test:gmail-filters` — 15 tests passed, including two real MCP server tests with fake Google client/state.
- Regression: `node --import tsx --test *.test.cjs` — 39 stack test entries passed; stack `npm run build` passed.
- Registry `npm test` — 412 passed, one pre-existing browser test skipped.
- `npm run validate` — 187 packages passed. `npm run indexes:sync` and `npm run indexes:check` passed.
- First catalog hygiene check correctly rejected the stack build/dependency artifacts created during verification. Remove those generated artifacts after final stack checks and rerun hygiene/build/pack.
- Targeted debt scan: five edited JS/TS files inspected in the stack graph, zero errors. One accepted existing oversized-file warning in `src/index.ts` (3203 lines; base was already above 800). Kept new behavior in its own module. Combined duplicate `os` imports to avoid introducing an import-count warning.
- Private skill updates: five account skills plus generic operator in Codex/Claude and the RUDI operator projection (13 files per host). Inspected baselines and remote authority; all checksums matched before the narrow update and were verified after. No tokens or account state transferred. Native skill validation pending.
- Source baseline on Admin: clean `main` at `227c866e16d1c2f5c0028fe04f616255fd8a55bf`, matching repository identity. Source/runtime adoption awaits accepted Git delivery; no copying installed code or service restarts.
- Tooling remains source-only; no filters, old messages, unread flags, OAuth grants, active-account state or live mailbox content were changed.

- Native skills: 12 `quick_validate.py` runs passed in an isolated Python environment with PyYAML; the existing richer RUDI catalog frontmatter was parsed without changing its schema. Remote read-back independently matched all 13 validated local SHA-256s.
- Fresh-context reviewer reran all 15 targeted tests and found no correctness/scope issue in core routing or skill changes. Clarified the transport claim: Gaxios retries are disabled, but the Google auth SDK may refresh/replay definitive 401/403 rejections. Credential refresh is outside the Gmail API per-request timeout. No application-level retries of uncertain writes occur; transport/auth behavior was inspected, not exercised against live Google.
- Refactor verification: final full stack rerun (39 entries) and build passed after consolidating the duplicate `os` imports. Base `src/index.ts` had 3192 lines; this change keeps filter implementation separate and adds only schema/routing glue.

- Final hygiene rerun: `npm run catalog:clean:check` passed with zero targets after removing only task-generated stack `dist/` and `node_modules/`. `npm run build` and `npm run indexes:check` passed again on the clean catalog.
- `npm pack --dry-run --json` passed; the new filter module is included and stack build artifacts/dependencies are excluded.
- Final targeted debt scan again reported zero errors and only the accepted pre-existing oversized-file warning.
- Final targeted test/build rerun after the SDK wording correction passed (15 tests plus TypeScript build). Native dependencies/build artifacts were then removed from catalog source; use `npm ci --ignore-scripts` in the stack directory before rerunning stack tests.

## Independent review and final disposition

- Independent fresh-context formal review: Standards **pass**, Spec **pass**, Proof **pass**, overall **pass** against `227c866`; no actionable findings remain. Reviewer independently reran all 15 targeted tests and `git diff --check`, inspected source/private skill changes and the final evidence ledger.
- Current guides reviewed/updated: stack README and generic operator SKILL.md, plus private identity skill entrypoints. Root catalog/schema/contribution contracts did not change; no root guide edits were required. Manifests and generated index expose the same five names as the tested MCP surface.
- Horizontal disposition: **no action** beyond resolving shared filter behavior in one module and routing identities to it. Existing per-provider validation/read-back logic is intentionally separate; future consolidation is triggered only by demonstrated shared-contract drift. No new consolidation obligation.
- Commit ledger: planned behavior and documentation/index slices remain uncommitted. No push, PR, merge, release, runtime install, account reauthorization, or mailbox mutation performed. The existing source version is not presented as a published filter-capable release.
- Proof gaps: no live OAuth consent or live Google filter mutation test, deliberately excluded by user instruction. SDK authentication refresh/replay was inspected rather than live-tested. One existing registry browser test was skipped. Existing oversized index.ts warning is accepted for this scope; stack maintainers own a separate decomposition if dispatcher changes expand its responsibilities.
- Verdict: **ready for source review/publication**; user authorization is still needed for publication and subsequent accepted runtime adoption. Worktree must remain preserved until delivered.

- Worktree closeout: Repo Steward receipt `gmail-filters-20261022`, version 2, **preservation_required**. Dirty uncommitted source, missing publication acceptance and preservation requirements explicitly prohibit cleanup. Receipt records source/task/agent lineage and passing targeted-test evidence. No cleanup was performed.

## Authorized publication and installation — 2026-10-22

The user authorized publishing and installing on both Macs while prohibiting mailbox-filter changes. An installation comparison found that both hosts had 1.2.1 with unpublished workspace binding/read-only OAuth behavior from the existing `workspace-activation-20261016` worktree. The user explicitly approved including that baseline with filters. The earlier worktree remains untouched.

Release target: **1.2.2**. Incorporate the approved binding/auth source and tests while retaining newer main-branch account-storage protections; do not replace secure account inventory, account normalization or credentials lookup with the older baseline implementations. Existing client allowlists and capability catalog remain narrow; installing filters does not activate filter writes for clients.

Risk tier raised to high for compatibility review of the existing authentication/workspace trust boundary. No production account consent or token changes are authorized. Verification uses synthetic provider/account fixtures and read-only installed MCP discovery/profile/filter-list checks only.

- First observable workspace test failed with missing binding attestation before integration, then passed unchanged after integration. Existing read-only tests likewise showed the broad-profile mismatch before integration.
- Combined stack verification: **47 entries passed**, including native MCP filtering/allowlist denial, concurrent pinned-account isolation, grant validation, callback-state validation and the catalog's newer account-boundary tests. TypeScript build passed.
- Registry regression: **413 passed**, one existing browser test skipped. Capability catalog regression added from the approved baseline.
- Broad auth requests settings.basic; explicit read-only auth still requests exactly Gmail/Calendar read scopes. Both are covered by a mocked authorization-URL test, without real consent.

- Compatibility scope includes a focused independent review of the added authentication/binding baseline. The prior filter-only review is not treated as proof for the expanded change.
- To avoid a new import-count warning, reused the existing top-level `basename` import in the exported Drive upload helper instead of dynamically importing the same path function again. This is a behavior-preserving refactor covered by the final stack rerun; no unrelated Drive behavior changed.

- Final combined stack rerun after the basename reuse: 47 passed and TypeScript build passed. Final debt: zero errors, only the existing large-file warning (3231 lines); no new import-count warning remains.
- Independent compatibility reviewer reran 10 mocked auth/binding/filter-tool tests and checked that the three newer account-protection modules remain identical to main. No actionable Standards or Spec findings were identified; clean-catalog/package proof is being finalized.

- Final clean-catalog/release gates for 1.2.2 all passed: indexes:sync, validate, indexes:check, catalog:clean:check, build, release:verify, validate:public, package dry-run.
- Independent expanded review concluded **Standards pass / Spec pass / Proof pass / overall pass for publication of 1.2.2**. The reviewer reran 10 mocked auth/binding/filter-tool tests. Runtime installation/read-only acceptance remains a separate proof step after accepted Git delivery.
- Commit slice 1: `2d02e02 feat(google-workspace): add verified Gmail filter tools`. Slice 2 contains approved compatibility baseline, version1.2.2, current docs/operator, capability regression and generated index. Publication/install are now authorized by the user's follow-up; cleanup remains unauthorized.
