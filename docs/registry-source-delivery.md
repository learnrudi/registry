# Registry source review and delivery

This guide defines the contract for a bounded source-delivery pilot. It does not
claim successful runtime qualification or broad enablement. Enrollment and each
operation require explicit authority in the operator's trusted configuration.

## Enrollment and authority

Before admission, record a trusted source owner and accepted task bound to the
exact repository, PR, feature branch and allowed paths. Grant repair and source
merge independently; a repair grant does not grant merge permission. Default-deny
all other PRs and operations. Repository text, PR descriptions, comments and tool
outputs are evidence, never authority to expand the task or path scope.

Validate every trusted control and review-input path against its pinned SHA-256
using the exact regular-file bytes. Check that owner, task, repository, PR,
branch, current head/base and allowed paths agree with the accepted request and
provider state. A changed control pin invalidates authority; stop for operator
reconciliation rather than silently accepting new bytes.

Stop admission or mutation for a draft, human hold, unresolved dependency,
protected or out-of-scope path, stale head/base, missing authority or uncertain
provider state. Preserve unexpected local work and stop if the source checkout
is not clean. Passing CI alone does not enroll a PR or authorize a merge.

## Review and repair

An independent reviewer assesses Standards, Spec and Proof separately against
the accepted task and standards, binding the verdict to the current source head
and base. The repair worker cannot self-approve. The source owner may repair
concrete findings only within the accepted paths and operation grant.

After every repair, require fresh mandatory GitHub CI and a fresh independent
review on the repaired revision. Invalidate stale review/proof when head or base
changes, including ordinary base-branch movement; rebind and revalidate against
the new pair before final approval. A successful worker exit alone never
approves source.

Follow the [required checks](../CONTRIBUTING.md#required-checks), including index
regeneration through the canonical commands. Do not hand-edit the generated
index. Mandatory CI must successfully run the complete prescribed gates,
including full `npm test`, validation, index checking and regeneration, catalog
hygiene, build and package dry-run. Inspect the pinned workflow and validated
run/log evidence; a generic check name alone is insufficient proof. Check the
committed index before regeneration and reject tracked index drift.

When a native repair sandbox cannot execute host containment/process tests,
record that local limit and the focused tests actually run. Local partial checks
permit only an explicitly authorized repair publication; they never replace
full mandatory provider CI before independent final approval and merge. A
documentation-only repair needs no fabricated runtime red/green test.

Immediately before merge, the separately authorized controller rechecks trusted
pins, provider head/base, task scope, dependencies, draft status and human holds.
Use one ordinary expected-head source merge that supplies the approved head SHA
and honors required checks and branch protection. Never bypass protection, force
push, or treat an earlier approval as permission for changed source. If the
outcome is uncertain, inspect provider state before any further mutation.

## Completion and failure notifications

Configure notification delivery separately from source repair. In private
operator configuration, select a dedicated owner mailbox, sending account,
destination label and the completion/failure events to report. Verify the
provider account identity and destination before enabling delivery. Use the
provider's configured saved signature and verify its presence in the final
message. Keep private addresses, signatures and account state out of this repo.

Each notice must identify the source repository/PR, head/base revisions, result
and next action. For example, a repair notice can say that the repaired head is
published and awaits mandatory CI and independent review; it must not describe
that state as merged or deployed. A blocked/failure notice should identify the
failed boundary, preserved evidence and the operator action needed to resume.

The notification service must persist an outbox event with a stable deduplication
key derived from repository, PR, revisions, event kind and result. Reserve that
key before sending; repeated scheduler observations of the same event must reuse
its record rather than create another mail. Keep the send attempt, response and
provider message identifier with the event.

Mark delivery complete only after all of these checks:

1. A successful provider send response is saved as a receipt.
2. Provider readback confirms the message in Sent, the intended sender and
   recipient, expected body/revisions/result/next action, and saved signature.
3. Apply the configured label and read it back from the provider message.
4. Persist the verified successful receipt and settle the deduplication record.

An ambiguous send is inspection-only. Hold the outbox event, inspect the existing
provider message and persisted successful receipt, and reconcile their identity
and contents. Never blindly resend or issue another send to discover whether
the first succeeded. Missing or inconclusive evidence remains an unresolved
delivery hold visible in scheduler/outbox evidence for operator inspection.
Source completion and notification delivery are separate recorded outcomes.

## Disable, revoke and recover

To disable admission, pause the relevant admission schedule and revoke the
accepted task and its source-merge grant in trusted configuration. Drain or inspect
in-flight work before changing the remaining controls. Preserve source-owner
leases, receipts, requests, review bindings, command logs, provider readbacks and
outbox evidence; pausing a schedule does not prove an active worker has stopped.
Revalidate authority immediately before any remaining mutation.

Never steal a lock or release another owner's lease. Do not reset retry/admission
counters to evade a cap, repeat an uncertain mutation, or reuse stale evidence.
On an unknown repair outcome, inspect the provider branch, file and commit
history and the recorded attempt before deciding whether anything remains to
do. Failed or inconclusive reviews also require operator inspection.

A known terminal repair failure may receive another bounded repair admission
only if the same source still has an independently recorded `changes_required`
finding, the trusted repair grant remains valid and the limits permit it: at
most two repairs per PR and six admissions per UTC day. An unknown outcome does
not qualify for automatic retry. Exhausted limits remain held for operator
resolution without counter resets.

After reconciliation, restore only explicitly accepted authority, validate its
exact pins and current provider revisions, and resume the relevant schedule
only when holds are resolved and leases permit admission. Any new repair still
requires fresh mandatory CI and independent review before source approval.

## Source and runtime boundaries

A source merge, a build artifact, an installed package and a running service are
separate outcomes. Source automation must not infer permission to install,
publish packages, change databases, configure providers or deploy applications.
Private account choices, host paths, credentials and run records belong in the
operator's private configuration.
