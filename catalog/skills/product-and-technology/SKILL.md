---
name: product-and-technology
description: "Find and review an organization's product plans, specifications, and implementation ownership. Use for product context or routing a feature to its authoritative technical repository."
version: 1.0.0
category: documents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Product and Technology

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Read the selected product's current model, decisions, scope, and implementation
pointers. Distinguish proposed architecture, prototype, implemented code, tested
behavior, and verified live deployment. A roadmap or another agent's summary
alone does not establish that a feature or database service is active.

Use business source for plans and product decisions. Locate executable source
through the product's declared repository or workspace map; read that repository's
instructions and state before engineering changes. Do not duplicate application
code into a business-context folder or infer deployment authority from source access.

For database or service migrations, consult the exact active runbook and accepted
source contract. An available PostgreSQL implementation does not replace the
current authority until verified cutover. Do not guess database credentials,
perform migration, or activate services during a product brief.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$product-and-technology brief`, `$product-and-technology find the repository and decisions behind this feature`.
