---
name: RUDI AI Policy Assessor
description: "Assess, score, and upgrade organizational AI acceptable-use policies using RUDI's completeness rubric. Use when reviewing a client AI policy, creating a gap report, comparing a draft against RUDI standards, advising on Claude/ChatGPT/Copilot connectors and data permissions, or turning current AI practices into a policy/training rollout."
version: 1.0.2
category: documents
tags:
  - rudi
  - ai-policy
  - governance
  - compliance
  - risk
  - training
  - connectors
  - capability:review
  - domain:governance
---

# RUDI AI Policy Assessor

Use this skill to turn an AI policy draft, client conversation, or current-practice notes into a practical RUDI gap report and upgrade path. This is the single policy-review workflow,
including requests formerly called `ai-policy-review`.

Default to a client-facing advisory tone unless the user explicitly asks for internal notes. The report should read like something RUDI can send to the organization being reviewed: respectful, direct, specific, and free of behind-the-scenes commentary.

Use one rubric: 12 elements scored 0–3, maximum 36. Preserve the former
15-element checklist’s coverage through the mapping in the rubric reference.

## Core Workflow

1. Identify the organization, industry, work types, regulated data, current AI tools, and intended rollout stage. If facts are missing, mark assumptions instead of inventing details.
2. Read `references/rudi-ai-policy-completeness-rubric.md`.
3. Classify the source artifact:
   - No policy yet: produce a baseline policy outline and discovery questions.
   - Generic draft: score it and recommend concrete client-specific upgrades.
   - Mature policy: focus on operational gaps, connector controls, training, and incident handling.
   - Connector rollout: prioritize permissions, data classes, retention, audit, and human review.
4. Score each RUDI policy element from 0-3:
   - 0 missing
   - 1 mentioned but vague
   - 2 usable but incomplete
   - 3 operationally clear
5. Produce a gap report with findings ordered by risk and implementation value.

## Required Output

For a policy review, provide:

1. **Client Header**: prepared for, document reviewed, and purpose.
2. **Executive Readout**: one or two paragraphs on what is strong, what needs clarification, and rollout readiness.
3. **Scoring Method**: explain the 0-3 element score and 36-point maximum.
4. **Scorecard**: table with the 12 RUDI elements, score, status, and short note.
5. **Priority Gaps**: highest-risk missing items with why they matter.
6. **Recommended Upgrades**: practical fixes grouped into policy language, tool/admin controls, training, and next decisions.
7. **Sample Language**: concise clauses the client can paste into the policy.
8. **Open Questions**: decisions RUDI needs from the client before finalization.

For a new policy, produce:

1. Policy outline mapped to the 12 RUDI elements.
2. Approved tool register starter table.
3. Data classification table.
4. Connector decision matrix.
5. Training/rollout checklist.

## RUDI Framing

- Treat AI governance as operating practice, not a legal document alone.
- Make the policy easy enough for normal staff to follow.
- Separate "may use AI" from "may expose data to AI."
- Do not assume connectors are bad. Assess whether they can reduce copy-paste risk through permissioning, minimization, de-identification, and audit.
- Require human accountability for outputs, especially external, financial, legal, safety, employment, or client-impacting work.
- Prefer specific examples from the client's domain over generic AI language.
- Keep legal claims conservative: say "confirm in the vendor agreement" when discussing data retention, no-training terms, privacy, or compliance.
- Avoid naming individual draft authors in client-facing reports unless the user asks; refer to "the current draft" or "the policy."
- Frame low scores as operational gaps, not as moral or competence judgments.

## What To Avoid

- Do not produce a policy that says "never use confidential data" without defining whether approved enterprise tools, tenant-contained tools, or connectors are exceptions.
- Do not treat consumer/free AI accounts the same as business/enterprise plans.
- Do not create disclosure rules so broad that staff will ignore them.
- Do not let a tool list substitute for data-class rules and review rules.
- Do not recommend technical controls without identifying who owns them.

## Resources

- Read `references/rudi-ai-policy-completeness-rubric.md` before scoring or drafting a gap report.
