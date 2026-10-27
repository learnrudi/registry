# Team context continuity publication

## Phase 0: Baseline and scope

- Base: registry `96750ecb2bc300b58958d0a216a94b96be807ce4` on `main`.
- Request: publish the reviewed local skill continuity updates as repository
  source, push a feature branch, and open a pull request.
- Risk: medium; cross-workflow instruction contract, with no runtime, schema,
  authentication, tool permissions, or orchestration-state changes.
- Manual: Agent Co-Pilot Operating Standard and Horizontal Engineering And
  Codebase Stewardship Standard, selected through the manual index.
- Horizontal scan: coordination, review, execution, publication, and handoff
  skills share continuity semantics. Disposition: standardize one contract,
  resolve in this change. Keep role-specific instructions in their existing
  entrypoints/references. Do not add an unsupported dependency schema.

## Phase 1: Scope lock

- Update 12 existing catalog skills: `agent-hosts`, `codex-tasks`, `compute-task`,
  `grill-with-docs-loop`, `publish-task-changes`, `repo-red-team-review`,
  `rudi-chief-of-staff`, `rudi-decision-canvas`, `rudi-decision-frontier`,
  `rudi-swe-issue-loop`, `set-goal-and-execute`, `swe-compliance-checklist`.
- Add portable `plan-and-route` and `handoff` entries. Preserve public catalog
  metadata, unrelated source behavior, and supported native invocation policy.
- Bundle `references/shared-context.md` with Chief of Staff; other consumers
  resolve the installed skill or an exact contract supplied by the coordinator.
  No implicit installation or assumed sibling directory at runtime.
- Update the current engineering skills guide, package versions, and generated
  index. Preserve the extracted red-team role reference layout. Update existing
  expected-version assertions when they pin a changed package version.
- Exclude workstation-specific handoff/session helpers and third-party skill
  sources. No private account configuration, machine paths, backups, task logs,
  or live acceptance ledgers enter the public catalog.
- Commit boundary: one coherent skill/documentation update with its generated
  index after verification and independent review. Commit, feature-branch push,
  and PR creation are authorized. Merge, release, deployment, and cleanup are not.

## Phases 2–4: Implementation and focused verification

- No executable implementation changed. Code red-green-refactor
  is not applicable; verify the instruction contract, public portability,
  resource packaging, source/index consistency, and existing regressions.
- Port only the continuity additions into existing catalog sources; do not
  overwrite them with divergent installed copies.
- Acceptance: focused packets preserve common facts and real execution paths;
  starts/restarts perform readback and reconcile active attempts; changed
  assumptions reach affected workers; handoffs separate proof and pending work;
  integration has an owner; blind reviews retain independence; existing authority
  and acceptance schemas remain unchanged.
- Static scenarios: stale restart summary, changed downstream interface,
  inaccessible cross-host source, uncertain dispatch, isolated reviewer, and
  differing producer/consumer call sequences. These are instruction reviews,
  not a live multi-agent trial.

## Phase 5: Verification

Verified on 2026-10-26 using Node 24.21.0 and npm 11.19.0:

| Check | Result |
| --- | --- |
| Initial `npm test` | 412 passed, 2 failed, 1 skipped; existing expected-version assertions pinned the previous skill versions. |
| `npm test -- src/portable-agentic-workflow-skills.test.ts` | 21 passed after updating only the scoped version expectations; behavioral assertions preserved. |
| Final `npm test` | 414 passed, 1 browser test skipped. |
| `npm run validate` | Passed. |
| `npm run indexes:sync` and `npm run indexes:check` | Passed; 189 packages, including 99 skills. |
| `npm run catalog:clean:check` | Passed. |
| `npm run stacks:verify -- --changed-from origin/main --prepare` | Passed; no changed stacks require runtime verification. |
| `npm run debt:scan` | Passed, zero findings. |
| Packaged SWE debt scan, scoped to the modified test | Passed, zero findings. |
| `npm run build` | Passed. |
| `npm run release:verify` | Passed; seven artifact hashes verified. |
| `npm pack --dry-run --json` | Passed; the new skills, routing UI metadata, and shared contract are included. |
| `git diff --check` | Passed. |

Fresh-context read-only review: Standards **pass**, Spec **pass**, Proof **pass**;
no actionable findings remain. The reviewer independently checked all 14
source/index versions, hashes for all 20 changed skill payload files, changed
Markdown links, package inclusion, and the version-test correction. The initial
failure and subsequent successful run remain separate verification evidence.

## Phase 6: Documentation and delivery

- Current guide: `docs/rudi-engineering-skills.md`; skill entrypoints and their
  relevant bundled references describe the changed behavior.
- Consumer contract: current registry catalog parser supports stack
  requirements, not skill dependencies. Existing package/artifact generation is
  used without schema changes. Public skill changes have patch version bumps;
  the two new packages start at `1.0.0`.
- Publication checkpoint: checks and independent review complete; ready for the
  authorized feature-branch commit, push, and draft PR. Git/PR history supplies
  the final commit identity and remote delivery receipt.
- Admin source adoption: deferred until an accepted branch is available through
  the normal Git review/merge workflow. Installed local instructions were updated
  previously; this PR does not establish package installation or service adoption.
- Live execution limitation: existing sessions need to reload instructions;
  no claim of automated enforcement or completed live team validation.
- Worktree: retain for review and PR follow-up; no cleanup is authorized. The
  coordinator records the final post-publication retention receipt through Repo
  Steward without changing the source checkout.
- Final local verdict: ready for the requested PR endpoint. No accepted debt was
  introduced. Browser/live-agent, package installation, and deployment proof
  remain outside this instruction-only publication.
