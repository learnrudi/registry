# Identity-first Compute skills

## Phase 0: Baseline and scope

- User requests six identity-first entry points, followed by model, effort, task,
  schedule, project/output collection and review before activation.
- Registry baseline: origin/main 16fc6ac. Primary checkout contains unrelated
  work; use the isolated compute-identity-skills-20261017 worktree.
- Manual: engineering index, Master Doctrine, Agent Co-Pilot standard. Skills:
  skill-creator, SWE compliance; independent review follows rudi-code-review.
- Risk: medium for skill creation; activation crosses an execution boundary.
- Public source stays generic. Personal names, account descriptors and host paths
  remain in private local skills/configuration. No credential values are read.
- Horizontal disposition: standardize the shared contract. Six generated entry
  points route to one shared workflow; do not implement six schedulers/runners.

## Phase 1: Contract and exit criteria

- Add public skill:compute-task, a private shortcut generator and focused tests.
- Six private shortcuts pin provider and identity. Read only non-secret account
  descriptors. Resolve exact models/efforts from the installed release catalog.
- Prepare immutable hashed task/profile/instruction files, validate, register
  inactive, preview supported recurrence, then present a concrete review.
- Require user approval of that review before activate/run-now. No test may
  activate production schedules or spend inference tokens during installation.
- Supported current recurrence: manual, daily, UTC interval. Explicitly reject
  unsupported weekday/weekly intent instead of substituting daily.
- No provider argv/auth implementation, scheduler changes or new service.
- Commit slices: shared skill/generator/tests/docs, then generated index.
  Existing session authorizes commit/push/PR/merge after checks and Admin install
  for this Compute work. Existing credentials/workers are preserved.
- Install reusable accepted skill and generate six private shortcuts on both
  Macs, projecting to Codex/Claude through the existing native skill lifecycle.

## Phases 2–4: Red, green and refactor

- One observable generator behavior at a time: correct identity routing;
  conflicts preserve installed content; malformed/unexpected fields rejected;
  no remote command or credential-file access during generation.
- Skill behavior forward-check: missing inputs, unsupported recurrence, full
  draft awaiting approval, changed draft requiring re-review.
- Red command for each behavior: `python3.12 -m unittest discover -s tests
  -p test_compute_skill_shortcuts.py -v`. Observed expected failures in sequence:
  missing rendered shortcut; mismatched identity accepted; unexpected account
  field accepted; later destination conflict created an earlier shortcut.
- Green: the same focused command passed after each minimal implementation.
  Final refactor verification uses `python3.12 -B -m unittest discover -s tests
  -p test_compute_skill_shortcuts.py -v`: 7/7 passed. Coverage also includes six
  distinct identities, symlink conflict preservation and duplicate JSON keys.

## Phase 5: Verification

- Python generator behavior tests; skill quick validation; registry npm test,
  validate, indexes sync/check, hygiene, build and npm pack dry-run.
- Focused debt scan if JS/TS changes; independent Standards/Spec/Proof review.
- Host install readback and native projection ownership. Read-only model/health
  checks; isolated inactive draft smoke only, with no execution/activation.
- Actual source gates: npm test 357/357 across 34 files; validate, indexes
  sync/check, catalog hygiene, build, public readiness and npm pack dry-run pass.
  Public readiness reports zero errors/warnings. `git diff --check` passes.
- Focused SWE debt scan of `src/compute-task-skill.test.ts`: zero findings.
- Independent fresh-context review: Standards and Spec pass after correcting
  the task ID rule and making Claude's disabled-network/file-tool limit explicit
  before review. Definition validation does not certify provider readiness.
- Forward checks pass: missing input collects only; complete daily draft waits
  for approval; weekdays are rejected; changed settings require a new review;
  unchanged approved manual review submits once; Claude web task stops before
  review pending an explicit supported provider/task choice.
- The standard skill quick validator rejects registry-specific metadata keys;
  those keys are required by the registry. Validate native projections after
  installation, using an isolated validator environment, not a runtime dependency.
- Known proof limit: instruction walkthroughs are not live agent activation.
  Installation qualification must remain inactive and spend no inference tokens.

## Phase 6: Closure

- Source implementation and review complete. Publication and both-host native
  projection installation/readback are release steps after merge; record their
  evidence privately because it contains personal identities and host paths.
- Preserve worktree and proof; no cleanup authorization.
