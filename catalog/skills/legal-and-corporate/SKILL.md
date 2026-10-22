---
name: legal-and-corporate
description: "Find, brief, or draft an organization's agreement, corporate, and policy source using its adopted forms and approval rules. Use for legal-workspace context and documented obligations."
version: 1.0.0
category: documents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Legal and Corporate

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Read the organization's adopted contract structure, policy status, source owners,
and records policy. Do not impose a vendor's contract stack or invent legal,
commercial, insurance, or security commitments. Preserve defined terms and source
provenance when drafting or comparing versions.

Distinguish third-party reference, working draft, approved form, adopted policy,
and executed agreement. A filename such as “final” or “for signature” does not
prove execution. Report effective dates, signatories, owners, approval status,
and unresolved terms only where supported. Policy text does not prove controls
are implemented. A historical source brief is not current legal verification.

Client-specific agreements stay in the owning engagement and approved records
system; reusable templates remain separate. Drafting does not authorize legal
adoption, signature, external submission, or modification of a signed original.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$legal-and-corporate brief`, `$legal-and-corporate list the documented approval gaps in our policies`.
