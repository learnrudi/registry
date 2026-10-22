---
name: company
description: "Navigate an organization's company context, governance routes, and reusable templates. Use for company-level briefs or routing finance, legal and corporate, and operations work."
version: 1.0.0
category: agents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Company

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Use the organization's existing company map to route financial evidence to
Finance, agreement/policy evidence to Legal and Corporate, and operating
procedures to Operations. Their installed companion skills are optional;
local domain instructions and specialized operators take precedence.

Company source may hold procedures, reusable templates, decisions, and record
pointers. Signed documents, personnel records, financial transactions, client
engagements, and personal records can have separate authorities. Do not copy
those records into a company overview or infer organization-wide access.
A template's presence does not establish adoption or authorize its use with a client.

For a company brief, join only relevant domains and distinguish confirmed
commitments from proposals. Report unknown ownership or approval status instead
of declaring a policy effective. Reference the actual approved records when
requested and accessible.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$company brief`, `$company find our reusable engagement templates`.
