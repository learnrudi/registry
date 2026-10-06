---
name: repository-stewardship
description: Observe a configured repository collection and complete explicitly authorized bounded maintenance actions with leases, verification, and an action ledger. Use for a Repo Steward assignment or a walkthrough of this worker.
---

# RUDI Repo Steward

For a live run, read the supplied private instance or
`~/.rudi/workers/repository-stewardship/INSTANCE.md`, the installed
`rudi-repo-steward` skill, and the current stack tools. The operator owns detailed
stewardship modes and ledger operations. This worker binds that process to an
explicit collection and finite assignment; authoring it starts no scan or loop.

## 1. Goal

Produce an evidence-backed picture of a selected repository collection and,
when authorized, complete bounded maintenance actions without losing or mixing
unrelated work. Verify each action and retain its disposition in the existing
Repo Steward ledger. Observation alone is a useful complete run.

## 2. Process

### Triggers and entry checks

| Trigger | Scope | Status |
| --- | --- | --- |
| Direct observation request | Selected root(s), discovery bounds, current repository state | Manual scan; no fetch or edits by default |
| Direct maintenance assignment | Exact repository/action and authorized mode | Manual bounded action after inspection and lease acquisition |
| Existing recurring observation | Approved roots, cadence, end time, and observe policy | Host-owned schedule must be separately activated and verified |

1. **Resolve the assignment.** Select Observe, Checkpoint, Improve, Publish, or
   Closeout from the current request and operator. Default to Observe if authority
   is ambiguous. Verify configured roots, depth/exclusions, actor identity, stack
   availability, and allowed actions. Root enrollment is local scope configuration,
   not permission to mutate every discovered repository.
2. **Discover and preflight.** Use the stack's root enrollment when requested,
   repository discovery, and preflight operations. Report the repository tree,
   exclusions, and failures. Do not bypass discovery limits through arbitrary
   shell traversal. Stop affected work on invalid config, missing Git, unavailable
   state, or unresolved discovery failure.
3. **Observe without fetch.** Scan clean/dirty state, staged/unstaged/untracked
   work, branch/upstream, and ahead/behind counts. If fresh remote metadata is
   necessary, fetch only where requested or already authorized and permitted by
   the repository policy. Do not bypass a stack denial with shell Git. State
   whether remote information is current or based on the last observed fetch.
4. **Select one bounded action.** Prefer coherent reviewed work or a scoped,
   approved issue; distinguish incomplete, generated, sensitive, and unrelated
   changes. Defer unknown ownership, large mixed diffs, unresolved conflicts,
   failing baselines, or cleanup that lacks authority. Record recommendations
   without inventing repository intent. Do not create an external issue merely
   because internal work is deferred.
5. **Coordinate before acting.** Acquire the repository lease, keep its token
   private, and record the proposed action through the existing versioned ledger.
   Read that repository's instruction hierarchy, identity, full relevant diff,
   branch/upstream state, and validation requirements. Verify current approval
   before moving from proposed to execution. An active competing lease causes
   a skip/defer, not forced removal. Revalidate state before a mutation.
6. **Execute the selected mode.** Checkpoint stages only exact task-owned paths
   after reviewing the staged diff and required checks; unknown staged work is
   a blocker, not part of the commit. Improve uses the repository's red-green
   process for behavior changes and preserves unrelated work. Publish uses the
   authorized GitHub operation and verifies its resulting artifact. Closeout
   uses the existing `rudi-worktree-closeout` decision contract and Repo Steward
   receipts; a recorded cleanup approval is not execution of cleanup.
7. **Verify and reconcile.** Record actual verification results before marking
   an action complete. After an interrupted commit or external operation, inspect
   Git/provider state and the action ledger before retrying. Release the matching
   lease when the bounded action ends, including failure, then rescan the repository.
   Preserve partial/blocked outcomes and required recovery instead of claiming
   synchronization from a command start or a stale count.
8. **Report the observed outcome.** Include coverage/exclusions, changed repositories,
   exact commits or GitHub references when created, verification, deferred work,
   current ahead/behind state and its freshness, and ledger references. For closeout,
   include receipt version/state, disposition, preservation requirements, blockers,
   and any actual authority reference.

### Configure an instance

| Setting | Required configuration |
| --- | --- |
| Scope | Host-local approved repository roots, stable root IDs, depth/exclusions, and actor identity |
| Capabilities | Installed Repo Steward stack/operator, Git, and GitHub operator when needed |
| Authority | Default mode and actual allowed fetch/edit/commit/publish/closeout actions, with request/policy references |
| Evidence | Existing stack state/ledger and receipt/report destination; repository-specific acceptance/check commands |
| Coordination | Existing lease/version semantics, bounded action selection, failure/retry policy |
| Recurrence, only if requested | Host scheduler, cadence of at least one minute, explicit end time, and notification policy |

Default to Observe and no fetch. Verify paths on the actual execution host;
another machine's checkout is not interchangeable. Repo Steward provides
coordination, not a scheduler or blanket approval to improve a fleet.

### Fictional walkthrough

A configured example root contains three repositories. One is clean and ahead
of its last observed upstream; one has mixed uncommitted work; one is leased by
another run. Observe mode reports all three, the age of remote information,
and the lease conflict. It makes no commit or push. A later explicit checkpoint
assignment for a reviewed change acquires the lease, verifies the exact diff,
commits only that concern, records proof, releases the lease, and rescans.
Publishing remains a separate authorization. No real repository is touched in
this synthetic walkthrough.

## 3. Capabilities

| Capability | Execution boundary | Instructions |
| --- | --- | --- |
| Fleet discovery, scans, leases, action/verification ledger | `stack:repo-steward` | Installed `rudi-repo-steward` operator and live tool schemas |
| Repository operations and tests | Current host's Git and repository toolchain | Exact repository's instructions and authorized action |
| GitHub artifacts | `stack:github` or the configured supported connector | Installed GitHub operator and explicit write authority |
| Closeout decision | Existing `rudi-worktree-closeout` skill plus Repo Steward evidence tools | Portable decision contract and stored projection |
| Optional recurring trigger | Host scheduler | Existing verified schedule; not supplied by the stack |

The stack's Git-side mutation is policy-gated fetch; other Git changes use the
normal authorized repository workflow. Discover tool schemas instead of relying
on saved lease tokens or assumed versions.

## 4. Context

Use the private instance, live discovered tree, repository instruction hierarchy,
Git identity and state, reviewed task/issue acceptance, relevant tests, and existing
Repo Steward actions, leases, verification, and closeout projections. A previous
scan is a baseline; current state must be revalidated before acting.

The stack ledger remains authoritative for coordination. Optional worker receipts
under `~/.rudi/state/workers/repository-stewardship/` reference its action IDs and
proof; they do not duplicate or replace leases. Keep root paths and private code
or organization details outside public worker definitions.

## 5. Operating boundaries

- Discovery or scheduling authority does not grant fetch, edit, commit, push,
  merge, issue/PR creation, or cleanup. Honor exact authority already supplied.
- Never stage unknown work, use broad staging for a targeted checkpoint, reset,
  clean, force-push, discard, move, or retire branches/worktrees incidentally.
- Preserve dirty work and respect repository-specific publishing rules. A clean
  worktree or a recorded approval reference alone is not proof of acceptance,
  synchronization, cleanup eligibility, or a completed action.
- Do not read or copy credentials, `.env` contents, databases, caches, or private
  runtime state as part of repository maintenance or peer source synchronization.
- A recurring request uses one finite run per authorized interval, rediscovers
  the roots, stops at its explicit end time, and reports meaningful changes under
  the configured notification policy. Do not hold a tool call open as a scheduler.
- On tool failure, stale versions, unknown ownership, conflicting instructions,
  or lost coordination, preserve the ledger and report the affected scope. Do not
  release another run's lease or mark an unverified action complete.

## 6. Completion criteria

An Observe run is complete when the requested discovery/scan coverage and its
limits are reported. A mutation run additionally needs the requested outcome,
recorded passing verification, a current post-action scan, and release of its
matching lease. Closeout requires reading the stored projection back; cleanup
is complete only when separately authorized execution has itself been verified.

Report actual ledger states and any partial, proposed, blocked, or failed actions.
Include the smallest next decision for deferred work. Completing one run neither
commits to indefinite maintenance nor proves every repository is synchronized.
