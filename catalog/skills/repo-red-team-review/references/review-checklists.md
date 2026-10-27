# Review roles and checklist

## Multi-Agent Roles

When using subagents, use bounded roles and apply
[shared context and continuity](../../rudi-chief-of-staff/references/shared-context.md)
to every assignment, finding handoff, retry, and restart. The lead supplies the
same source revision, target environment, rules of engagement, relevant trust
boundaries, and accepted facts, labeling hypotheses as unverified. Require a
brief scope/baseline readback. Propagate changed assumptions to affected probes
and recheck their evidence. Keep QA free to reject the proposed finding; shared
context must not prescribe its conclusion. Resume from the current checklist
and evidence, including pending probes and possible external side effects.

### Recon Agent

Task:
- inventory entrypoints
- list route/auth/webhook/tool surfaces
- identify config and deployment files
- return files inspected and surface table entries

### Threat Model Agent

Task:
- generate abuse hypotheses from the surface map
- focus on trust boundaries and sensitive workflows
- return prioritized probes

### Verification Agent

Task:
- test specific hypotheses
- inspect exact files
- run allowed commands/tests
- return evidence, rejected paths, and uncertainty

### QA Agent

Task:
- challenge proposed findings
- verify evidence and severity
- identify false positives
- return downgrade/reject/confirm recommendation


Resolve the shared contract through the host's installed `rudi-chief-of-staff`
skill or an exact, retrievable copy supplied by the coordinator. The repository
link does not establish that another skill is installed. If neither source is
accessible, report the missing context before dependent delegation; continue
independent authorized work. Do not invent a skill-dependency schema or install
packages implicitly.

## Subagent Output Contract

Require subagents to return:

```markdown
## Scope
## Context Revision and Assumptions
## Files Inspected
## Surface Reviewed
## Trust Boundaries
## Hypotheses Tested
## Findings
## Rejected Hypotheses
## Open Questions
## Checklist Items Completed
## Proof Gaps and Next Owner/Action
```

## Checklist

Maintain and update this checklist:

```markdown
- [ ] Rules of engagement established
- [ ] Repo instructions loaded
- [ ] Worktree state checked
- [ ] Orientation docs reviewed
- [ ] Shallow repo map built
- [ ] Manifests/configs inventoried
- [ ] Entrypoints identified
- [ ] Auth boundaries mapped
- [ ] Tenant/data ownership model mapped
- [ ] API routes reviewed
- [ ] Frontend route protection reviewed
- [ ] Webhooks reviewed
- [ ] Billing/payment flows reviewed
- [ ] LLM/tool/MCP surfaces reviewed
- [ ] File upload/parsing surfaces reviewed
- [ ] Database constraints/migrations reviewed
- [ ] Deployment/security config reviewed
- [ ] Logging/observability reviewed
- [ ] Rate limits/abuse controls reviewed
- [ ] High-risk findings QA-reviewed
- [ ] Findings ledger completed
- [ ] Skipped checks documented
- [ ] Final report produced
```

