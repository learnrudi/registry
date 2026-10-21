# Registry delivery binding and native coverage — 2026-10-21

## Phase 0: Baseline and manual lookup

- [x] Node `registry-binding`, attempt `registry-binding-1`, prepared plan127;
  existing draft PR82 branch `codex/platform-ci-20261021`, initially clean at
  `584c85fac7cc70fff125c5473fdd6d572c2e8b13`.
- [x] Read Registry/workspace AGENTS, README, existing workflow, exact producer/
  focused approval, source/log manifest and selected-stack argument contract.
  Follow SWE checklist, doctrine, Agent Co-Pilot, Security F8 and H1.
- Risk: high CI identity trust boundary; mandatory native test coverage addition.
- Invariants: reviewed helper/application unchanged, no sandbox/assertion weakening,
  preserve full root checks/three-OS matrix/strict aggregate/Release boundary.

## Phase 1: Scope lock

- Only `.github/workflows/registry.yml`, README and this record may change.
- No catalog/app/helper/test/dependency/index/old compliance edits, actual token,
  publication/settings, main refresh, Admin/provider/runtime/deploy/DB actions.
- Canonical System `scripts/platform-delivery/binding-job.mjs` SHA-256:
  `a69af1e7d8455c3f5fbdd001d5fd9c08a278a58af8ca08a4607a2f21d9413c16`;
  exact Node-rendered job SHA-256
  `d2cd4aefe1d39496712059758bfdfa4996d0bd5f32b379ecd2305ebe38284646`.
- Schema2 provider IDs/revisions/run attempt plus opaque GitHub job-specific JWT,
  audience `urn:rudi:platform-delivery:ci-proof`. Only metadata id-token:write;
  global contents:read and all original effective permissions preserved.
- Source-free metadata rejects redirects, bounds requests/responses, sanitizes
  failure before output, exclusive immutable artifact with custody markers.
  No cloud exchange or producer-side signature validation.
- Full validation and matrix depend directly on metadata; failed binding blocks
  them and strict aggregate fails skipped/non-success results. Non-PR no-op
  preserves main/manual execution; existing Release needs validate, stays exact.
- Add exactly one unconditional Ubuntu22/Node24 command:
  npm run stacks:verify -- --stack stack:web-export --prepare.
  Existing changed-stack selection remains. No new flags or environment bypasses.
- One uncommitted slice after fresh consumer review; all publication/merges/live
  behavior held until CI/review results and remaining gates are presented.
- Horizontal disposition: standardize producer contract at System, project exact
  bytes across repos. Manager owns hashes/regeneration/check policy/hosted proof;
  generator change triggers re-review, exact projection/DAG/custody closes it.

## Phase 2: Configuration reds

- [x] Same registry-binding-proof.py command initially exits1 for missing final
  metadata projection. Add only job/dependency edges, then it exits1 specifically
  for explicit_native_web_export_step_missing. Both red logs preserved.
- No application assertions changed; config proof uses actual parsed YAML and
  canonical output. Existing helper behavior red/green remains historical proof.

## Phase 3: Implementation

- [x] Insert exact generated metadata job; direct needs on validate and
  validate-platforms. Original Release and required jobs unchanged.
- [x] Insert native Web Export command in primary validate before debt scan,
  after existing changed-stack selection. No if/continue-on-error/env override.
- [x] README documents identity/source/authority and explicit native proof gap.

## Phase 4: Green and focused actual code proof

- [x] Same proof exits0. Remove only generated job, two needs edges and the exact
  authorized native step and entire parsed workflow equals published baseline.
  All original commands/pins/platforms/names/events/limits/permissions preserved.
- [x] Ubuntu22 runner and Node24 selector asserted; native step exactly name/run.
  Every PR-code job depends on metadata; only metadata can mint identity JWT.
- [x] All25 actual run blocks pass bash syntax. Actual strict aggregate tested
  across36 result pairs; only success/success passes. No refactor or weakening.
- [x] Actual projected metadata/custody bodies through unchanged hash-bound
  focused producer probe pass41/41 cases: schema2/attempt/audience/time/size,
  non-PR zero requests, invalid inputs/endpoints/envelopes, exclusive output,
  sanitized failures/custody and all15 redirect combinations.
- Real urllib redirect processing, mocked transport, real sockets disabled,
  synthetic identity environment. No actual token/credential/provider requests,
  token logging or real signature/hosted claim qualification.

## Phase 5: Existing proof reuse and hosted gap

- [x] Published source/log hashes verified before changes; app/helper/test/catalog/
  index/lock sources and old compliance remain unchanged. Reuse root412pass/1opt-in
  skip, focused56 implementation/58 independent tests and all prescribed local
  validation/index/build/pack/debt zero-finding proof. No broad repeats.
- Manager-reported initial hosted root/matrix/aggregate green did not run an
  actual Web Export hook because no changed catalog stack was selected. It
  cannot qualify the new explicit native step. No local native hook executed.
- Fresh final-head hosted Ubuntu22 Node24 Web Export prepare/verification with
  both native and outer sandboxes intact is mandatory, alongside root, complete
  Ubuntu/macOS/Windows matrix and strict required gate. No sandbox exemptions.
- [x] Whitespace, exact three-file scope and empty index verified; no JS/TS edits,
  dependency change, build regeneration or extra debt scan justified here.
- Main reportedly advanced to bd90013a9fcda9aff1943973932bb28bace39e97 through a
  separate catalog/docs/index change. No merge/rebase/fetch/refresh here. Manager
  owns controlled refresh and new exact-head review/CI after resolving base drift.

## Phase 6: Review, docs and closure

- [x] README matches proposed source; prior review/publication/source evidence
  preserved. Old CI record remains historical and does not cover this candidate.
- Corrected producer focused approval astra-ci-identity-focused /
  binding-v2-focused-confirmation-1,2026-10-21T13:34:54Z: all axes pass/CI1 closed
  for producer/rendering only. Consumer DAG/runtimeR2/hosted/Admin excluded.
- [ ] Fresh consumer-wide Astra review before publication. Full runtimeR2 crypto
  official issuer/JWKS/algorithm/audience/time and signed exact job/run/attempt/
  repository/event/ref/sha/workflow validation; own-job log/artifact/timestamp
  custody, merge parents and metadata-before-code ordering remain unqualified.
- [ ] Final native/root/matrix/aggregate hosted proof after controlled refresh,
  Admin integration and existing holds/authority before activation.
- All publication/merge/live controls held. No CRM/product ownership, deployment
  or database scope is acquired by this configuration change.
- New manager registry-binding source-proof/result/diff plus proof/red/native-red/
  green evidence contains exact hashes. Worktree retained; manager owns eventual
  non-mutating closeout after acceptance naming node/attempt, lineage and revision.
- Accepted application debt: none introduced; prior browser/type/advisory limits
  remain. Actionlint/provider execution not locally established.
- Verdict: local projection ready for consumer review; hosted/native qualification,
  refresh, publication and controller/auto-live remain separate held gates.

## Accepted-main CI integration — 2026-10-21

This later phase supersedes the earlier no-refresh/publication state for this
local integration only; all earlier source manifests, red/green logs and reviews
remain historical and unchanged. Node `registry-ci-main-integration`, attempt
`registry-ci-main-integration-1`, prepared plan 194; high risk integration boundary.

- [x] Fresh accepted main `c1d03c31e8485988ca9b8b57a29dae78816ad5b9`
  includes `080a28159d096fc515d188672d7fb550a14417de`, pinned Node 24 setup
  before changed-stack verification. Its accepted Microsoft 365/CRM source,
  tests, catalog/index and SQL must be imported byte-for-byte, not reimplemented.
- [x] Explicitly authorized local-only foundation commit
  `976c7df07e5c2429ee91366da78d5585ed295a57` preserves exactly the original
  reviewed three CI/docs files at base `584c85fac7cc70fff125c5473fdd6d572c2e8b13`.
  Workflow history SHA-256 remains
  `f9d2150fc7a6ebd96dcb36c95c55aa3929f97bfcaa22c49df494dc1ca05ecc83`.
  Full staged diff matched the original reviewed diff. No push occurred.
- [x] Fetched exact accepted main, then `git merge --no-commit --no-ff origin/main`
  merged automatically without conflicts. `MERGE_HEAD` remains accepted main;
  no merge commit was created. Incoming workflow adds only the accepted pinned
  Node 24 setup; exact metadata/no-source OIDC, Ubuntu 22, unconditional native
  Web Export prepare/verify and strict aggregate remain intact.
- [x] Meaningful configuration red/green: new exact-main-step contract fails
  against foundation for `accepted_main_stack_node_setup_missing`, then passes
  on actual integrated YAML. Original focused proof assertions are retained;
  only the independently required exact-main step is normalized for composition.
  Actual projected metadata/custody 41 cases, shell 25 blocks and all 36 aggregate
  pairs pass; only success/success qualifies. No sandbox/timing/assertion/skip
  relaxation or application source correction.
- [x] Fresh native Node 24.21 root suite: 412 pass, 1 existing opt-in skip, 0 fail.
  Prescribed validate/index-sync/index-check/catalog-clean/build/package gates,
  release provenance and public readiness pass. Deterministic
  SOURCE_DATE_EPOCH=1792592863 preserves accepted index timestamp. Root checks
  did not invoke provider or live database/migration operations.
- [x] All 51 imported nonworkflow paths, their Git modes and staged blobs exactly equal
  accepted main; existing reviewed helper/test sources and prior proof remain
  unchanged. Build/index commands leave incoming index bytes identical.
  No authored JS/TS edits: incoming accepted source is copied through Git only.
- [x] `npm run debt:scan` passes with zero errors, warnings or informational
  findings. No imported source was changed to satisfy this scan.
- [x] README documents retained accepted-main Node 24 ordering; this append-only
  record explains the changed source basis and keeps prior evidence immutable.
- [ ] Fresh focused independent review of this exact merged candidate pending;
  coordinator retains merge-commit/publication authority after acceptance.
- [ ] Actual final hosted Ubuntu 22 native Web Export with both sandboxes,
  complete Linux/macOS/Windows matrix, strict aggregate, signed identity/custody,
  live required-context and Admin/native qualification remain mandatory gates.

Review input is the uncommitted merge tree with foundation/accepted-main parents;
coordinator evidence `registry-ci-main-integration-result.json` and source manifest
record exact hashes, patch, preservation and proof outcomes. No push, PR update,
ready-state, merge commit, settings, Admin, activation, provider/deployment/live DB
or SQL execution occurred. Preserve MERGE_HEAD/worktree until fresh Astra review.
