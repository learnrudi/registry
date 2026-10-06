---
name: real-estate-opportunity-intake
description: Complete the existing DevelopmentOS Intake phase for a selected property, independent batch, or explicitly related site using verified property evidence and the configured Intake engine. Use for an opportunity intake or a walkthrough of this worker.
---

# Real Estate Intake

For live work, read the supplied private instance or
`~/.rudi/workers/real-estate-opportunity-intake/INSTANCE.md`, the installed
`real-estate-intake` skill, its `references/contracts.md`, and applicable workspace
policy. The existing operator, versioned schemas, and deterministic Intake engine
own artifact generation and validation. This worker composes them; it does not
copy or replace the engine. Creating the definition performs no property lookup.

## 1. Goal

Turn the complete customer request and read-only property evidence into a
source-backed, reviewable `00-intake` workspace for each intended opportunity,
with explicit identity/scope decisions and a verified run result. Preserve
uncertainty and all later-phase locks.

## 2. Process

### Triggers and entry checks

| Trigger | Scope | Status |
| --- | --- | --- |
| Direct Intake request | One supplied property, independent batch, or explicitly related multi-address site | Manual run through the configured operator/engine |
| Direct review/resume | Exact prior run and new evidence or recorded decision | Follow the engine's version and idempotency contract |
| Future customer-submission event | Validated source identity, authorized output root, and bounded request | Requires separate detector/executor setup; inactive by default |

1. **Select the request shape.** Preserve the full original wording and each
   original address. Use one opportunity per independent property; combine
   addresses only when the customer explicitly says they form one intended site.
   A shared name, initiative, or strategy does not establish a program, portfolio,
   or grouping. Record ambiguous grouping as unconfirmed. Reject duplicate addresses
   across independent opportunities before writing.
2. **Prepare schema-valid inputs.** Verify the configured operator/engine, allowed
   input/output roots, and installed contracts. Allocate unused opportunity IDs
   after checking the portfolio index and directories; never overwrite an existing
   workspace. Follow the operator's v1/v2 selection, including v2 when a governed
   address-candidate decision is present. Preserve later-phase customer material
   only as unverified forwarded context, without downstream authority.
3. **Capture property evidence.** Through the configured read-only Dwellow operator,
   search the full original address. Retry with the deterministic street line only
   after zero matches. Retain every candidate. Use a unique match, or a complete
   recorded human decision selecting an actually retained candidate; never choose
   among multiple candidates by intuition. Capture the location fact sheet,
   candidate site boundary, and site conditions for each resolved parcel key.
   Preserve provenance and partial failures. Whitelist Intake fields from provider
   responses; cached downstream sections are not accepted Intake evidence.
4. **Preserve site scope and conflicts.** An address locates a property; it does not
   automatically authorize every parcel in a returned boundary. Follow the engine's
   governed single-parcel rule and complete human decision requirement for multiple
   parcels. Accepted parcel keys/count/boundary hash are engine-derived outputs,
   never caller-editable inputs. Keep all conflicting acreage observations and
   use the contract's current materiality thresholds; do not average away a blocker.
5. **Handle optional customer photos.** Follow the operator's supported file types,
   signature checks, allowed roots, and path/symlink protections. Record source,
   role, and capture time when known. External AI reference rights require their
   own durable authorization; availability does not grant them. Acquired aerial,
   assessor, or street-view imagery stays in its owning workflow.
6. **Run the existing engine.** Use its verified executable and documented command
   with the request, captured-evidence file, and approved destination. Do not invent
   an alternative generator or hand-edit its artifacts. The engine validates before
   writes, stages new workspaces, and owns promotion/recovery. An identical run ID
   and fingerprint may reuse its compatible prior result; changed input under that
   ID must be rejected, not force-written. Resolve a new request/run identity through
   the documented workflow when incorporating changed evidence or decisions.
7. **Verify and report.** Read the generated run result and each opportunity's
   evidence, site input, scope acceptance, and machine review. Run the operator's
   prescribed artifact validation. Check rollup counts, provenance, original
   statements, decisions, scope derivation, grouping status, and downstream locks.
   Report paths, reuse, blockers, and warnings. An unresolved property still gets
   the reviewable outcome allowed by the engine; invalid input is rejected before
   writing. Do not claim Intake acceptance from a process exit alone.

### Configure an instance

| Setting | Required configuration |
| --- | --- |
| Workspace | Existing DevelopmentOS checkout, domain policy, portfolio index, allowed input roots, and opportunity output root |
| Operator/engine | Exact installed `real-estate-intake` skill location, its matching references/schemas/scripts, and supported runtime/command |
| Evidence | Authenticated read-only Dwellow operator and supported Intake capability mapping |
| Identity | Opportunity-ID allocation convention, run-ID ownership, and prior-result lookup |
| Authority | Permission for the selected Intake/local workspace creation; source decision references and separate photo-rights decisions |
| Results | Existing canonical opportunity artifacts and a private worker receipt destination if needed |

Resolve host-specific paths locally. An absent engine, contract set, provider,
or workspace is a setup blocker; this definition is not an installer. Check the
real operator's documented command before invocation instead of copying another
machine's path or version.

### Fictional walkthrough

A customer submits two addresses as unrelated opportunities and supplies an
initiative name. The host preserves two requests and leaves the initiative's
grouping type unconfirmed. One address resolves uniquely to one parcel; the
second returns two candidates and receives `human_required`. The engine creates
reviewable outcomes and the host reports one unresolved identity without choosing
for the customer. Neither result authorizes Concept or Feasibility. This is a
synthetic explanation; it makes no provider calls or workspace writes.

## 3. Capabilities

| Capability | Execution boundary | Instructions |
| --- | --- | --- |
| Intake process and artifacts | Installed `real-estate-intake` operator and its existing engine | Full skill, `references/contracts.md`, matching schema versions |
| Property identity/evidence | `stack:dwellow-mcp` or the existing configured Dwellow connector | Its read-only operator and current tool schemas |
| Validation and preservation | Existing DevelopmentOS workspace and engine | Applicable workspace rules and operator validation commands |
| Review and reporting | Agent host | This worker and captured evidence |

The four required evidence capabilities are location search, location lookup,
site boundary, and site conditions. Map them to verified live tools. Do not call
feasibility, frontage, envelope, zoning-rule evaluation, building/legal/community
fit, financial-fit, site-plan, or producer-refresh tools during Intake.

## 4. Context

Keep the complete customer statement, request version, original addresses,
captured provider candidates and evidence, photos/rights when supplied, prior
run identity, decision records, and actual generated outcomes. Follow the
operator's separation of statements, verified facts, interpretations, assumptions,
decisions, derived accepted scope, and forwarded context.

Canonical evidence stays in the approved opportunity workspace. A worker receipt
may reference it from `~/.rudi/state/workers/real-estate-opportunity-intake/` when
configured, without copying a second portfolio or property database. Public worker
source contains no customer records or production property fixtures.

## 5. Operating boundaries

- Scope is `00-intake` only. No Concept, Feasibility, underwriting, frontage,
  envelope, building/unit-yield analysis, outreach, purchase, or external mutation.
- Zero/unresolved multiple matches, missing evidence, incomplete related sites,
  pending multi-parcel decisions, and material fact conflicts remain explicit
  review blockers. Do not promote customer labels or LLM inference to facts.
- Keep the engine's version checks, fingerprinting, validation, safe staging,
  and failure recovery intact. Preserve pre-existing paths and prior evidence.
- Required decisions must identify the authorized decision maker, scope, time,
  and rationale under the real schema. A candidate selection does not waive any
  remaining scope/evidence gate.
- No fixture or successful synthetic walkthrough proves live provider access.
  Do not send photos to an external AI provider as part of Intake.

## 6. Completion criteria

The requested Intake run must have a validated run-level result and one outcome
per intended opportunity, with correct counts, provenance, preserved originals,
and all downstream authority flags false. Report the engine's actual `pass`,
`pass_with_warnings`, or `human_required` outcome, preserving blocker-over-warning
precedence. Distinguish completion of a reviewable run from acceptance of its site.

On missing setup, invalid input, engine failure, or incomplete persistence, report
the exact failure and preserved evidence without claiming generated or accepted
work. Any private receipt records request/run references, artifact paths,
validation results, reuse, and remaining decisions. Further phases require their
own assignment even after successful Intake.
