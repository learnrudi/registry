---
name: business
description: Navigate an organization's business context, map its authoritative sources, or prepare a source-linked review across business areas. Use for organization setup, business briefs, or requests spanning several domains.
version: 1.0.0
category: agents
tags:
  - organizational-context
  - capability:retrieve
  - capability:review
  - domain:organizational-context
---

# Business

Use the [organization workflow](references/organization-workflow.md). Resolve
the organization and its source map from the user's request and workspace
instructions; no filesystem path, mailbox, vendor, or database is implicit.

## Domain vocabulary

The following companion skills are optional, independently installable domain
entrypoints. Installing this skill does not install them or connect providers.

| Entry | Responsibility |
| --- | --- |
| `$company` | Company context, governance routes, reusable templates |
| `$finance` | Financial source authority and evidence-backed review |
| `$legal-and-corporate` | Agreement, corporate, and policy source |
| `$operations` | Internal procedures, ownership, and operational follow-through |
| `$content-and-brand` | Brand authority and content production source |
| `$education-and-programs` | Curriculum, programs, and delivery source |
| `$growth-and-revenue` | Offers, sales, partnerships, and commercial context |
| `$product-and-technology` | Product plans and implementation ownership |
| `$research-and-intelligence` | Reusable research, citations, and freshness |

Load an installed domain skill when it applies, respecting local specialization.
If absent, a bounded brief can use the selected domain's own instructions and
records. Do not claim a missing skill or connector was invoked.

## Requests

- **Bare invocation:** show this vocabulary and any already configured root;
  do not audit all domains or retrieve private records.
- **Setup:** map the organization's existing sources. When requested, create
  a local `ORGANIZATION.md` using the [template](assets/ORGANIZATION.template.md)
  and the workflow's setup rules. Do not migrate records or create databases.
- **Brief/find/review:** retrieve only the selected areas and period. Separate
  confirmed decisions, proposed work, completed work, and unresolved actions.
- **Draft/update:** preserve ownership and follow the exact source's editing
  and approval rules. Cross-domain synthesis does not authorize cross-domain writes.

For workload reviews, join calendar, correspondence, and work evidence only
when requested and accessible. Deduplicate the same commitment across sources;
meeting hours or message counts alone do not establish total work or productivity.

Examples: `$business setup for this organization`, `$business brief`,
`$business review documented priorities for this week`.
