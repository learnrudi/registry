---
name: growth-and-revenue
description: "Find, brief, or draft an organization's offers, sales, partnership, and commercial strategy source. Use for growth context or documented opportunity follow-through; financial verification uses Finance."
version: 1.0.0
category: documents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Growth and Revenue

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Read the selected offer, proposal, partnership, or opportunity's source and
recorded status. Keep reusable sales material separate from client-specific
proposals, correspondence, prices, and negotiated commitments. Do not invent
customer interest, approvals, prices, or pipeline stages to complete a report.

If a CRM is authoritative for the requested live pipeline, use its available
operator and account scope; do not create a competing ledger as a side effect.
Separate target, proposed, agreed, invoiced, and paid values. A proposal is not
booked revenue and an invoice is not settlement evidence. Route financial
verification to the authoritative Finance source and governing terms to the
agreement record.

Keep final commercial documents in their approved record system. Prepare
correspondence according to the organization's draft rules; a review request
does not authorize outreach, publication, or CRM mutations.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$growth-and-revenue brief`, `$growth-and-revenue review documented next steps for the selected partnerships`.
