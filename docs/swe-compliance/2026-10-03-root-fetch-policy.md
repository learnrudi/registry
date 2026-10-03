# Explicit enrolled-root fetch policy

## Phase 0–1: scope, authority and acceptance

Medium risk: local persisted configuration and a public MCP input contract.
The owner approved implementation, feature commits, PR review/merge, release
and supported adoption. Preserve existing discovery roots, IDs, paths, depth,
history, leases and repository contents. No scheduling or Git mutation occurs
during a policy change. Fetch still requires an explicit later request.

Add `repo_steward_update_root_policy` for one locally enrolled root, requiring
exact root ID/path, owner, boolean fetch permission, expected enrollment version,
an approval reference, and `confirm_update: true`. Reject external configuration,
missing/ambiguous input, stale versions and identity mismatch. Serialize using
the existing enrollment lock, retain a previous document, atomically replace the
active document, and append a redacted transition event. An exact immediate
retry is idempotent; unrelated intervening changes still fail closed.

Existing enrollment must continue rejecting policy changes. No direct state
JSON editing, implicit scope expansion, force operations or repository writes.

## Horizontal disposition and planned paths

Resolve in this change: consolidate the existing enrollment writer and the new
policy writer in `catalog/stacks/repo-steward/src/enrollment-operations.js`.
Retain the existing core validators, configuration loader, enrollment lock and
atomic writer through its established dependency-factory pattern. This keeps
`src/core.js` below its enforced no-growth ceiling without adding a parallel
state mechanism. Modify `src/index.js`, manifest, package metadata, README,
operator skill, discovery/MCP/package tests and generated Registry `index.json`.
Do not change the debt baseline or unrelated packages.

Commit boundary: first-commit support is already a separate verified commit.
The policy operation, tests, documentation and generated metadata form a second
coherent commit. The System archive correction is a third independent change.

## Phase 2–4: red/green plan

1. Observe an enrolled root's policy transition through MCP: preserve path/depth,
   change only fetch permission, expose updated policy in discovery, and leave
   Git state untouched. First prove the missing tool fails this behavior.
2. Add focused cases for stale input, ownership/identity, missing approval,
   externally configured roots, no-op/exact retries and serialized races. Run
   each next behavior red before its implementation when not already satisfied.
3. Re-run unchanged assertions and existing discovery/action/closeout tests.

## Phase 5–6: proof and closure

Required: full stack suite; Registry tests, validation, generated-index sync/check,
catalog hygiene, build, package dry run; scoped JS debt scan; independent fresh
Standards/Spec/Proof review. Record results below before publication. After
release, verify installed behavior and supported policy changes on both hosts,
preserving observe-only scheduling. Record exact commits/PRs and closeout
receipts; preserve source worktrees until acceptance. No cleanup is authorized.

## Source acceptance — 2026-10-03

The missing-tool behavior failed before implementation; the exact-retry behavior
then failed on the expected stale-version conflict before retry support. The
unchanged behavior assertions now pass. Full stack suite: 35 passed. Registry
suite: 356 passed, including the final operator-version contract. Validation,
index sync/check, catalog hygiene, build and package dry run passed. Scoped
JS/TS debt scans found no warnings or errors. Core is 1,480 lines, below the
existing no-growth ceiling; the baseline was not relaxed.

A fresh independent Standards/Spec/Proof review passed all three axes with no
substantive findings. It independently reran all 35 stack tests, the archive
authority test, index consistency and final catalog hygiene. Existing dependency
advisories were unchanged; no dependency update belongs to this slice.

Source acceptance is complete. Published package identity, installed behavior,
supported policy changes and peer adoption remain post-release checks. They
must be recorded in the local release evidence before end-to-end completion is
claimed. No scheduled write authority is added by this release.
