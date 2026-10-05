---
name: education-and-programs
description: "Find, review, or draft an organization's reusable curriculum, programs, and facilitator source. Use for teaching-material discovery or work on a selected course or program."
version: 1.0.0
category: documents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Education and Programs

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Read the selected program's catalog, structure, source provenance, and delivery
rules. Preserve existing course/module organization and distinguish reusable
curriculum from a particular customer's delivery, participants, and feedback.
Keep learner and client records in their approved private systems.

For materials discovery, follow existing catalogs to source lessons, slides,
exercises, and facilitator guidance. Record version, learning purpose, and known
gaps rather than assuming an export is the approved teaching master. If an
interactive learning product lives in another repository, follow its instructions
and canonical source instead of editing a stale copy.

A curriculum file does not establish enrollment, scheduling, delivery, or learner
completion. Report those states only from the corresponding evidence. Drafting
teaching material does not authorize new programs, enrollments, calendar invites,
publication, or distribution of restricted source material.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$education-and-programs brief`, `$education-and-programs find the facilitator materials for the selected course`.
