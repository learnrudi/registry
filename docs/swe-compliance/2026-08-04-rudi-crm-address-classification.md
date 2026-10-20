# RUDI CRM Address Classification And Confirmed Contact Promotion

## Phase 0: Baseline And Manual Lookup

- Scope: add an address-level classification model so a domain can map to an organization while each mailbox is independently classified; preserve separately approved promotion and alias-attachment boundaries.
- Files to inspect before editing: repo and global `AGENTS.md`; CRM migrations, schemas, contract, MCP declarations, tests, package metadata, README, generated index, and local CRM skill.
- Relevant SWE manual sections: Database Appendix A (schema, additive migrations, integrity), Testing Appendix C (behavior-first red/green), API Standard E2/E3/E7/E9/E12 (validated contracts, errors, idempotency, agent clarity), Backend G2-G5 (explicit operations and transactions), Security F5/F13 (untrusted agent input and auditable human approval).
- Current-state commands: `git status -sb`; CRM package tests/build; live setup status; people/candidate counts; validator views; registry validation/index gates.
- Current state: the discovery queue can mix humans, aliases, shared mailboxes, marketing, notifications, automated systems, and unknown addresses. Domain-level decisions cannot safely classify individual addresses.
- Existing-work boundary: preserve unrelated work, the prior contact-sweep record, generated-index work, and the checksum-identical applied `0001`/`0002` migrations. Use a new ordered migration only.
- Risks and invariants: exact normalized email remains the identity key; classification never merges people or promotes a contact; organization/domain and address kind are separate facts; user-confirmed aliases require an explicit existing person ID; retries are idempotent; raw email-derived input is untrusted.
- Exit criteria: baseline, mutation authority, interfaces, failure behavior, and verification entrypoints are recorded.

## Phase 1: Scope Lock

- In scope: persisted address classifications, deterministic suggestions, controlled classify/filter tools, exact-target alias attachment, tests, package metadata, and current operator documentation. Any real-data promotion or classification requires separate approval and a private operational record.
- Non-goals: bulk-promoting every person-shaped address, assigning unverified titles, treating every recipient of a distribution email as a relationship, domain-wide suppression, fuzzy automatic merges, Gmail mutation, or refactoring the oversized CRM contract.
- Expected files touched: this checklist; `catalog/stacks/rudi-crm/sql/migrations/0004_contact_address_classification.sql`; CRM `src/{schemas.ts,contract.ts,index.ts}`; focused tests; package metadata/README; generated `index.json`; and the canonical CRM operator skill.
- External inputs and trust boundaries: candidate email/name/domain/role evidence, agent classifications, existing-person IDs, category/reason/source arguments, database rows, and RUDI secrets are validated before use. No secret or message body enters source, logs, or classifications.
- Interface contract: categories are `person`, `shared_inbox`, `marketing`, `notification`, `automated`, and `unknown`. Manual classification overrides deterministic suggestion. Candidate listing exposes both suggestion and effective classification and supports bounded filtering without changing existing default pagination behavior.
- Failure behavior: malformed emails/categories fail closed; classification replay is idempotent; reclassification is explicit and audited; an alias collision stops rather than moving an address; partial independent promotions are read back and reported; classification never creates a person.
- Exit criteria: focused behavior tests fail for the missing schema/tool/migration before implementation.

## Phase 2: Red Tests

- Observable behavior to prove: schemas constrain categories and email; MCP exposes classification; a clean database applies `0004`; address classification upserts/replays/reclassifies; deterministic generic-mailbox suggestions do not classify a person solely from domain; candidate filters return the requested effective category; invalid inputs and alias collisions fail safely.
- Test files to add or edit: CRM contract-schema, MCP, package-contract/migration, and live-contact tests.
- Red command: build the unchanged package, then run the focused test name/file for each next behavior slice.
- Expected failure: missing schema export/tool/migration/function/view columns or behavior—not syntax, fixture, or environment failure.
- Exit criteria: each behavior has a recorded expected red failure before its smallest implementation.

## Phase 3: Implementation

- Implementation rules: additive `0004`; normalized email primary key; database check constraints; parameterized queries; bounded list filters; explicit audit context; stable JSON results; no raw SQL MCP; no dependency additions.
- Files allowed to change: only the Phase 1 files, plus generated build/index artifacts required by existing scripts.
- Validation and error-handling requirements: Zod validates tool ingress; database constraints defend persistence; exact-email collisions remain authoritative; unknown organization/title remains null rather than inferred.
- Observability requirements: classification returns created/updated/unchanged status, previous/current category, normalized email, source, and timestamp without exposing secrets or message content.
- Exit criteria: red tests pass with the smallest behavior-bearing changes.

## Phase 4: Green Tests And Refactor

- Green command: rerun every red command unchanged, followed by CRM package tests and live tests.
- Refactor constraints: refactor only while focused tests remain green; do not split unrelated contract code or alter applied migrations.
- Regression checks: promotion remains atomic/idempotent; existing candidate default behavior remains compatible; exact existing-email filtering and all eight validators remain green.
- Exit criteria: focused and regression suites pass after any cleanup.

## Phase 5: Full Verification

- Targeted tests: schema/contract, MCP, package contract, isolated migrations, and live address-classification/promotion behavior.
- Full suite: CRM `npm test` with live database enabled; registry `npm test` and required validation gates.
- Build/typecheck/lint: CRM build; registry validate/build; index sync/check; catalog clean check; package dry-run.
- JS/TS debt scan: architecture-aware scan scoped to edited CRM TypeScript files; blocking errors fixed, other findings recorded.
- Smoke checks: bootstrap an isolated database; verify tool count and schemas; classify/reclassify a synthetic address; confirm unchanged people and passing validators. Installation and real-data changes require separate operational approval.
- Exit criteria: all applicable gates pass or a precise pre-existing/out-of-scope exception is recorded.

## Phase 6: Docs, Contracts, And Closure

- Docs or API contracts to update: CRM README, manifest/tool descriptions, local CRM skill classification workflow, this execution record, and generated registry index.
- Final files touched: record exact files after verification.
- Commands run and results: record red/green, full tests, build, indexes, pack, debt scan, migration, install/reindex, and live smoke evidence.
- Accepted debt: record only verified out-of-scope findings, including the pre-existing contract-size warning if it remains.
- Definition of Done: address classification is additive, controlled, tested, and documented; synthetic non-person addresses can be categorized without suppressing people at the same domain; validators remain green. Source verification does not establish installation or deployment.

## Historical Source Verification

The original change added migration `0004`, six bounded address categories,
manual overrides, the classification tool, category filtering, and multi-email
people responses. Its recorded verification covered schemas, MCP declarations,
package contracts, isolated migration replay, classification/reclassification,
promotion collisions, and rollback. Those historical results do not establish
current deployment or database state.

Personal contact identities, mailbox activity, private batch identifiers, and
machine-specific installation records are intentionally omitted from public
source. They are not required to reproduce the generic contract.

The current reconciliation and synthetic-only verification are recorded in
[the PR #33 reconciliation checklist](2026-10-20-pr33-main-reconciliation.md).
