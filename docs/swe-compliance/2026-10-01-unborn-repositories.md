# Unborn repository support

## Approved scope and acceptance

Repair repository observation and first-commit action recording. Medium risk:
public MCP input/output contract and durable action records. An initialized
repository with a symbolic HEAD whose branch ref does not exist is awaiting its
first commit. Report `head: null`, `head_state: unborn`, branch, and dirty counts;
never fabricate a SHA or count missing history as aligned. Committed status adds
`head_state: committed`. Corrupt or unreadable history must remain an error.
A new action may explicitly supply `source_head: null` only on a verified unborn
repository. Existing SHA actions, leases, versioning, transitions and verification
gates remain compatible. Closeout still requires committed history.

Non-goals: creating commits or remotes, publication, changing fetch policy,
installing unpublished packages, bulk staging client material, and modifying
unrelated checkouts. The native worktree tool was unavailable for the non-Git
container; an isolated source worktree was created from origin/main instead.

## Change boundaries and proof

One coherent source slice: status, action input schema, regression tests,
operator documentation, and package metadata/index as required. No commits or
publication are authorized by this plan. Verify each behavior red then green,
run the stack suite and required registry gates, scan changed JS files for debt,
and obtain independent Standards/Spec/Proof review. No scope expansion into
historical worktree cleanup or unrelated registry changes.

## Horizontal review

HEAD observation belongs to the core status boundary; action creation reuses that
same interpretation. Closeout consumes status but must reject unborn history
explicitly instead of writing an invalid receipt. Existing record-lock and lease
ownership remain authoritative. No replacement ledger or scanner is introduced.

## Evidence

- Red then green: targeted `node --test --test-name-pattern` runs for unborn
  fleet inclusion, initial action recording, MCP nullable input and explicit
  closeout rejection. The closeout test first exposed invalid fixture evidence;
  after correcting that setup, the recorded red failure was the missing explicit
  unborn rejection. No assertion was weakened.
- Refactor: extracted the shared HEAD interpretation into `src/git-head.js`;
  core remains at its enforced 1,579-line no-growth ceiling. Git errors retain
  only a safe numeric/string exit code in their cause, never raw command output.
- `npm test --prefix catalog/stacks/repo-steward`: 27 passed, including mixed
  committed/unborn fleets, actual Git corruption, timeout handling, action
  idempotency after first commit, lease/version denial and MCP exposure.
- `npm test`: 356 passed. The first run caught core-module growth; extraction
  resolved it without changing the debt baseline.
- `npm run validate`, `indexes:sync`, `indexes:check`, `catalog:clean:check`,
  `build` and `npm pack --dry-run --json`: passed. Disposable stack dependencies
  were removed after tests to satisfy catalog hygiene.
- Changed-file SWE debt scan: 10 files in graph, eight reported, zero findings.
  Its run-local configuration anchors the `.git` ignore expression so the
  worktree name does not accidentally exclude the entire graph. No shared debt
  policy changed.
- Source-only smoke against five normal enrolled repositories under fresh
  observation leases: five awaiting-first-commit observations, zero failures,
  no fetch or source mutation; every lease released.
- Residual limitation: source is uncommitted and not installed on either host.
  The normal registry publication/update flow and post-install peer validation
  are required before first-commit execution can use this contract.
- Independent Standards/Spec/Proof review passed with no substantive findings; preserve this worktree until accepted publication.

## Release authorization and refreshed verification

On October 3 the workspace owner approved the shared-tool publication,
review/merge and supported installation flow. All stack and Registry gates
above were rerun successfully against this source before its commit. The new
fetch-policy operation is a separate follow-on change with its own red/green
proof; it does not alter the first-commit acceptance criteria.
