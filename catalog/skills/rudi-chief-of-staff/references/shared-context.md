# Shared Context and Continuity

Apply this contract to every delegated assignment, review, dependency handoff,
retry, and restart, including recovery after context compaction. It also applies
to the coordinator. Use a short packet for a small task; do not create extra
chats, approval gates, or a second ledger to satisfy it.

## One authority, focused packets

The coordinator maintains the current accepted context in the existing plan and
its referenced design, contract, or evidence artifacts. Task status and acceptance
stay in that plan. Context documents explain behavior and decisions; they do not
become competing task lists. Use existing deliverables, verification, evidence,
and steering mechanisms; do not add unsupported fields to closed JSON schemas.
For a temporary crew, use its existing task notes. Before work must survive that
run, persist the load-bearing context through the owning workflow's durable
record. A disposable handoff or chat summary cannot be its only copy.

Every assignment carries the relevant slice of this common foundation:

- Overall outcome, the assignment's contribution, scope, and completion proof.
- Coordinator, accountable worker, and integration owner when outputs must combine.
- Authoritative sources and exact revisions or artifact identities, with accepted
  dependency evidence and the actual destination repository, host, and worktree.
- Relevant interfaces, invariants, and execution sequence: producer, consumer,
  setup, success, failure, and cleanup behavior. Label unverified behavior.
- Accepted decisions and rationale, assumptions, unresolved questions, and what
  would invalidate the assignment or its evidence.
- Permitted reads/writes and actions, required tools, expected outputs, and the
  checks that demonstrate compatibility with dependent work.
- Current accepted versus pending work, active attempts or unresolved side
  effects, and the next concrete action.

Prefer precise source references plus a concise explanation of why they matter.
Verify access from the destination; a path on another host is not an accessible
artifact. Cross-host accepted handoffs use retrievable evidence and immutable
identities under the owning contract. Never include credentials or copy a whole
conversation by default. Matching hashes establish identity, not correctness or
shared understanding.

## Start, resume, and replace

Before substantive work, read the packet, applicable instructions, and the
referenced sources. After a restart, compaction, retry, or worker replacement,
reload the current authoritative record and check it against the assigned
revision, actual workspace, dependencies, and permissions. Treat remembered
summaries as navigation aids. Do not silently switch to newer source or assume a
fresh chat has inherited accepted state.

Give a brief readback: how this task fits the overall outcome, the inputs and
behavior it relies on, the behavior it must preserve, and how it will verify that.
Include the exact revision and any mismatch. This can be the first progress
update; agreement with verified context needs no extra approval round. Resolve
material contradictions with the coordinator before dependent writes or claims;
continue independent authorized work. Missing evidence remains unknown.

The coordinator also rechecks active attempts, pending steering, locks, and
accepted results before redispatching after recovery. Preserve indeterminate
attempts until their native state is known; a restart does not authorize a
duplicate worker or repeated external action.

## Changes and handoffs

When an accepted decision, dependency, interface, or runtime assumption changes,
the coordinator records what changed and why in the existing authority, identifies
affected assignments and evidence, and sends the smallest sufficient update
through authorized coordination channels. Pause affected dependent writes until
the revised contract is explicit and the worker has checked its compatibility.
Refresh only invalidated proof; keep unaffected work moving. Preserve historical
acceptance while recording that it does not establish compatibility with the new
state. Do not silently rewrite an accepted producer snapshot.

Every result or handoff identifies the exact context used, changed artifacts and
behavior, checks actually run and their limits, assumptions discovered, accepted
versus proposed outcomes, remaining work, and next owner/action. Distinguish local
verification, integration, CI, publication, and deployment when relevant. Put this
in the existing result/evidence artifact rather than expanding a closed schema.
The recipient retrieves and checks it; the coordinator owns acceptance. Never
claim another chat received an update without confirmed delivery or retrieval.

## Integration and independent review

Name one integration owner when separately produced outputs must work together;
the coordinator may fill that role. Maintain a reproducible combined baseline
and exercise the actual producer/consumer path before accepting compatibility.
For code, cover the relevant setup, transaction/lifecycle ordering, success,
failure, and cleanup behavior with real entrypoints where feasible. Tests based
only on a worker's invented call sequence cannot establish integration. For
non-code work, verify the combined deliverable against the shared requirements.
Record unavailable checks as proof gaps, never as passing integration.

Independent reviewers receive the same source baseline, task requirements, and
authorized scope. Preserve any stricter blind-review rules: pass neutral source
locators and factual context, not another worker's reasoning, evidence trail,
preferred verdict, or a disputed assumption disguised as an accepted fact.
Reviewers must be able to challenge the contract itself. Shared context does not
require shared memory, shared writable worktrees, or identical conclusions.
