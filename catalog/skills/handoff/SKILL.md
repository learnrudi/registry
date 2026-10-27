---
name: Handoff
description: Create a focused handoff brief so another agent or a fresh session can continue from verified context. Use when the user asks to hand off work, change agents, or restart with a concise record of the current task.
version: 1.0.0
category: agents
tags:
  - capability:handoff
---

# Handoff

Compress the relevant work into a self-contained Markdown brief for the next
session. A handoff is disposable transport, not a replacement for project
documentation or the coordinator's acceptance record. Creating it does not
start another session or authorize the work it describes.

## Resolve the focus

Use the user's stated purpose and established context. Ask only when the next
session's focus is unclear. Capture the intended outcome, current decisions,
constraints, completion evidence, and actual authority. Preserve accepted
decisions without presenting proposals or unverified assumptions as facts.

## Preserve continuity

For coordinated work, apply the
[shared context and continuity contract](../rudi-chief-of-staff/references/shared-context.md).
Resolve it through the host's installed `rudi-chief-of-staff` skill or an exact,
retrievable copy supplied by the coordinator. The repository link does not prove
co-installation. If the contract is unavailable, identify the missing context
in the brief; do not claim the dependent assignment is ready to dispatch.

For every handoff:

- Identify the overall outcome, assignment, coordinator, and next owner/action.
- Point to the current authoritative task record, decisions, and evidence. The
  temporary brief must not become the only copy of load-bearing team context.
- Record the exact source or artifact revision and relevant uncommitted work.
  Include versioned specs and configuration as well as code. Use the owning
  repository's authorized Git workflow; omit Git metadata when irrelevant.
- Describe the relevant interfaces and actual execution sequence, including
  setup, success, failure, and cleanup behavior where they affect the task.
- Separate accepted work, pending work, proof gaps, and unresolved assumptions.
- Preserve active or indeterminate attempts and possible external side effects
  so a restart does not duplicate a dispatch or action.
- State permissions already granted and those still required. Name exact
  destination paths by host and verify access before claiming they are usable.

Instruct the recipient to reload current authoritative sources, inspect its
actual workspace and dependency state, and briefly read back how its next step
fits, what it must preserve, and how it will verify the result. Resolve material
contradictions before dependent writes; continue independent authorized work.
An inherited conversation or summary alone does not establish current acceptance.

## Write the brief

Use an OS temporary directory and a unique descriptive filename, unless the
user supplies a destination. Keep durable task state in its existing owning
record. Prefer precise pointers and why they matter over copied transcripts.
Aim for 200–600 words, with additional detail only when needed for continuity.

```markdown
# Handoff: <focus>

Date: <timestamp with timezone>
Source: <project and host>
Source revision: <exact commit or artifact identity, when relevant>

## Context and outcome
<Purpose, scope, and acceptance criteria.>

## Continuity checkpoint
<Coordinator/next owner; canonical record; accepted decisions; actual execution
path; assumptions; accepted versus pending work; active attempts; authority.>

## Next actions
<Reload authoritative state and read back scope/dependencies first. Then list
concrete actions and closing proof. Mark genuinely human-only steps [User action].>

## Constraints and non-goals
<Bounded writes and actions; unresolved decisions or approvals.>

## Relevant artifacts
<Accessible references, exact revisions, and why each is needed.>

## Suggested skills
<Available relevant skills and their purpose, or none when unnecessary.>
```

Exclude credentials and unnecessary private information. Use agent-neutral
instructions; do not assume a tool, account, skill, or filesystem is inherited.
Keep independent review packets free of reasoning or verdicts that the reviewer
must independently evaluate.

## Deliver and stop

Write and read back the brief. Return its path and concise contents through the
host's supported file or message surface. If the temporary file will be
unavailable on the destination host, say so and provide a usable text handoff or
an authorized transfer; a local path alone is not delivery.

Report what the brief captures and the next owner/action. Do not start the next
session, send messages, publish, or implement the handoff without that separate
authority. Creating a brief does not prove it was received or adopted.
