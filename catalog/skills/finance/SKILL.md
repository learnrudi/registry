---
name: finance
description: "Review an organization's financial questions using its declared ledger, agreement, invoice, and settlement evidence. Use for financial source discovery or a scoped evidence-backed finance review."
version: 1.0.0
category: data
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Finance

Resolve the organization and this domain's authoritative source from the user's
request, selected workspace instructions, and existing source map (including
`ORGANIZATION.md` when present). If that identity or root is unclear, ask for it;
do not assume a personal path, provider, account, or database. Read applicable
instructions and domain entry records, then search only the requested material.
This skill works independently; the optional `$business` skill can help map sources.

Identify the exact question, accounts or entity, period, currency, and authoritative
ledger/service before retrieving financial records. Follow any installed local
Finance specialization and its source contract. A source folder, dashboard export,
or provider connection is not automatically the current ledger.

For receivables, distinguish agreement terms, invoice issuance, correspondence,
and settlement evidence. An invoice is not proof of payment. For spending,
respect saved category corrections, pending versus posted activity, transfers,
refunds, and the requested reporting period. State missing accounts, incomplete
coverage, and refresh dates; do not infer business purpose from account labels.

Use existing authenticated finance/accounting/banking operators for the scoped
request. Reading saved data and refreshing/importing it are different actions.
Do not link accounts, refresh stores, reclassify transactions, reconcile balances,
or move money as an unrequested side effect. Keep raw financial records in the
approved record store, not in a public skill or source repository.

An implemented PostgreSQL backend is not an accepted production cutover. Use the
verified active service/store; report its failure without silently falling back.

A bare invocation explains the domain and any configured source without fetching
sensitive records. A brief cites evidence dates, source links, status, and coverage;
local files alone do not establish current provider state. Missing or denied access
is a gap, never an empty result or permission to switch accounts. For requested
local edits, preserve existing work and follow source ownership/review rules.
External actions retain their explicit authorization and read-back requirements.

Examples: `$finance brief`, `$finance review outstanding invoices for the specified period`.
