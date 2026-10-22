---
name: operations
description: "Find, review, or draft an organization's internal procedures, process ownership, and operational follow-through. Use for documented company operations rather than direct runtime administration."
version: 1.0.0
category: documents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Operations

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Start with the requested process's runbook, ownership, handoff records, and open
actions. Keep proposed operating changes distinct from accepted procedures.
Follow an existing intake or steward-review convention; do not create a parallel
task database to perform a brief.

For a status review, identify the action, owner, due date, latest evidence, and
unresolved dependency. Deduplicate repeated mentions of the same commitment.
File modification times and scheduled intentions do not establish completion.

A documented job or deployment is not proof of a running service. When the task
requires runtime status or changes, resolve the actual technical operator and
live evidence. Do not activate jobs, alter access, restart services, or change
schedules merely because they are mentioned in a procedure. Client-specific
operating evidence remains with its owning engagement.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$operations brief`, `$operations find the owner and next steps for this process`.
