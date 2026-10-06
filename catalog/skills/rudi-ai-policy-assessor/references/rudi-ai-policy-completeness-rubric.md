# RUDI AI Policy Completeness Rubric

Use this reference to score an AI acceptable-use policy or current-practice description.

## Scoring

| Score | Meaning | Use when |
|---|---|---|
| 0 | Missing | The policy does not address the element. |
| 1 | Vague | The element is named but not actionable. |
| 2 | Usable | Staff could follow it, but edge cases or ownership are incomplete. |
| 3 | Operational | The rule, owner, examples, exceptions, and failure behavior are clear. |

## The 12 RUDI Elements

### 1. Purpose, Philosophy, And Mission Fit
Checks whether the policy explains why the organization uses AI and how responsible use connects to its mission, values, quality standards, and risk appetite.

Look for:
- Human-led work and accountability.
- Security, privacy, trust, fairness, and quality.
- Benefits and limits of AI.
- Bias, equity, accessibility, and environmental impact where relevant.

### 2. AI Tool Definition And Scope
Checks whether "AI tool" is broad enough to include standalone chatbots, embedded AI in normal software, coding assistants, meeting tools, agents, connectors, custom GPTs/projects, and similar features.

Look for:
- Applies to employees, contractors, third parties, and work on personal devices.
- Covers company work regardless of account or network.
- Distinguishes personal use from company use.

### 3. Governance Owner And Approval Workflow
Checks whether ownership is explicit.

Look for:
- Named policy owner or role.
- Approved tool register owner.
- Exception approval process.
- Role of IT/security, legal/compliance, HR/people, communications, and department leaders.
- Review cadence and change trigger.

### 4. Approved Tools, Vendor Terms, And Account Rules
Checks whether the policy says which tools are approved, for what data, and under what vendor terms.

Look for:
- Approved tool table.
- Business/enterprise account requirement for company data.
- Personal/free accounts disallowed for company information unless explicitly approved.
- Vendor privacy, data processing, retention, deletion, no-training, residency, and audit terms flagged for confirmation.
- Tool request process.

### 5. Data Classification And Input Rules
Checks whether staff know what they can put into AI.

Look for:
- Public, internal, confidential, restricted/sensitive tiers.
- PII, PHI, financial/payment data, credentials, client/prospect/donor/employee data, proprietary data, privileged data, NDA material, and contract-restricted data.
- Clear "allowed in which tool" rules by data tier.
- Rule for unknown data: treat as higher sensitivity until classified.

### 6. Redaction, Minimization, And Safe Prompting
Checks whether the policy tells people how to reduce risk before using AI.

Look for:
- Remove names, addresses, account numbers, IDs, credentials, secrets, and unique deal/client identifiers.
- Use placeholders or code names.
- Share only the minimum content needed for the task.
- Avoid uploading whole files when an excerpt is enough.
- Domain-specific examples.

### 7. Connectors, Integrations, And Embedded AI Controls
Checks whether the policy covers AI access to live systems.

Look for:
- Connector approval before enabling Google Drive, Gmail, Calendar, Slack, Microsoft 365, GitHub, CRM, finance, HRIS, or custom MCP/API connections.
- Least privilege and source-system permissions.
- Read-only default where possible.
- Write/delete actions blocked or approval-gated until explicitly approved.
- Custom connector security review, OAuth scopes, network path, logging, de-identification, and data minimization.
- Shared drives/folders/channel permissions reviewed before connection.

### 8. Use Categories: Encouraged, Caution, Prohibited
Checks whether use cases are practical.

Look for:
- Encouraged uses such as brainstorming, drafting, summarizing non-sensitive content, learning, coding starts, formulas, and workflow planning.
- Caution uses such as external content, research synthesis, data analysis, financial/legal/client-facing work, hiring support, and communications representing the organization.
- Prohibited uses such as credentials, impersonation, deceptive media, harassment/discrimination, unauthorized access, automated high-impact decisions, and sensitive data in unapproved tools.

### 9. Human Review, Scrutiny Tiers, And High-Risk Decisions
Checks whether review effort matches stakes.

Look for:
- AI output treated as draft.
- Facts, figures, citations, code, and calculations verified.
- High-risk outputs require second-person or manager/expert sign-off.
- AI may support but not replace human judgment.
- No AI-only decisions affecting employment, legal rights, finances, safety, medical care, housing, lending, or similar high-impact outcomes.

### 10. Transparency, Disclosure, And Accountability
Checks whether disclosure rules are realistic.

Look for:
- Staff remain accountable for final work.
- Internal acknowledgment when AI materially contributes.
- External disclosure when required by law, contract, professional standard, client agreement, or when AI materially contributes to analysis, conclusions, or decisions.
- Minor assistive uses such as grammar cleanup usually do not require formal disclosure.
- Decision owner for external disclosure.

### 11. IP, Copyright, Ownership, And Source Integrity
Checks whether the policy protects company and third-party rights.

Look for:
- Company ownership of AI-assisted work created for work duties.
- Do not paste trade secrets, proprietary code, client IP, or licensed content into unapproved tools.
- Do not use AI to evade copyright, licenses, terms of service, or attribution requirements.
- Verify sources and citations.
- Special rules for code generation and open-source license review if engineers use AI coding tools.

### 12. Monitoring, Incident Response, Training, And Review
Checks whether the policy can survive real use.

Look for:
- Incident reporting channel and no-retaliation/good-faith reporting language.
- Containment steps for accidental sensitive-data exposure.
- Severity assessment and escalation to IT/security/legal/compliance.
- Audit logs or usage review where available.
- Training requirement for staff and managers.
- Office hours, FAQs, or prompt/workflow library.
- Annual review and review after material tool changes.

## Gap Severity

| Severity | Use when | Typical action |
|---|---|---|
| Critical | Missing rule could expose sensitive data, create legal/regulatory risk, or enable harmful decisions. | Fix before rollout or connector enablement. |
| High | Staff can use the policy, but a common workflow is unsafe or ambiguous. | Fix in the first revision. |
| Medium | Policy works for basics but lacks examples, ownership, or training support. | Add during rollout. |
| Low | Wording, formatting, or completeness issue with limited risk. | Clean up before final approval. |

## Connector Decision Matrix

Use this when a client asks whether to connect Claude, ChatGPT, Copilot, or another AI assistant to workplace data.

| Decision area | Green light | Yellow light | Red light |
|---|---|---|---|
| Source permissions | Permissions are clean, least-privilege, and role-based. | Shared folders/channels need cleanup. | Broad everyone-access folders contain sensitive data. |
| Data class | Mostly public/internal data. | Confidential data can be minimized or de-identified. | Restricted data cannot be filtered or minimized. |
| Tool/vendor terms | Business/enterprise agreement reviewed. | Terms are likely acceptable but not documented. | Consumer/free account or unknown vendor terms. |
| Actions | Read-only or approval-gated. | Some writes needed with clear workflow owner. | Delete/send/post/pay/update actions enabled broadly. |
| Logging | Admin/audit visibility exists. | Partial logs exist. | No meaningful way to review access or incidents. |
| Training | Staff know when to use connector vs paste. | Training planned but not delivered. | No training or use guidance. |

## Recommended Gap Report Language

Use concise, client-safe phrasing:

- "The policy is directionally strong, but it is not yet operational for staff."
- "The largest gap is not whether AI is allowed. It is which data can be exposed to which tool under which account and connector settings."
- "This needs a tool register, data-tier rules, connector permissions, and examples from the client's actual workflows."
- "Do not solve connector risk with a blanket ban alone. A controlled connector can be safer than unmanaged copy-paste if it enforces least privilege, minimization, approval gates, and logging."

## Coverage and rubric version

Use the 12-element, 0–3 rubric (maximum 36) for new reports. Identify that rubric
in the report. The retired 15-element Present/Partial/Missing checklist is not an
alternative scoring system. Its coverage maps as follows:

| Earlier checks | Current element |
|---|---|
| Purpose | 1 |
| Definition and applicability | 2 |
| Governance | 3 |
| Approved tools and accounts | 4 |
| Data classes | 5 |
| Redaction and minimization | 6 |
| Connectors and agentic use | 7 |
| Prohibited uses | 8 |
| Output verification | 9 |
| Disclosure | 10 |
| IP and source integrity | 11 |
| Audit, incident reporting, training and acknowledgment | 12 |

Check every subtopic within a combined element; do not award 3 when one required
subtopic is absent. Element 7 covers sends, writes, deletes, payments and access
changes. Element 12 includes a tool register, connector approvals, incident and
training records, acknowledgment and a named system of record. AI chat history
alone is not the system of record. Readiness must name unresolved high-risk gaps;
a numeric total is not rollout approval and no “all 13” rule applies.

## Industry-specific coverage

- Real estate/finance: deal and investor data, rent rolls and lender terms,
  verification of financial calculations, and housing/lending decision controls.
- Healthcare: PHI handling and review of applicable vendor agreements before use.
- Legal/professional services: privilege, confidentiality and disclosure duties.
- Nonprofit: donor data, mission alignment, accessibility, equity and impact.
- Software: source code, secrets, licenses and human review before deployment.

Confirm current legal and vendor requirements from authoritative sources when
assessing them; these prompts are coverage checks, not legal conclusions.
Use the client's current approved template when one is available; resolve its
actual location instead of relying on historical engagement paths. Include the
three highest-priority fixes and a right-sizing note for the organization's size.
