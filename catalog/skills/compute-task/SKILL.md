---
name: compute-task
description: Prepare an identity-selected Codex or Claude Compute job, review its model, effort, task, schedule and file permissions, then activate only the approved revision.
version: 1.0.2
category: agents
tags:
  - capability:schedule
  - capability:review
  - provider:codex
  - provider:claude
---

# Compute task

Turn a requested job into an inactive, validated Compute task and a concrete
review. The selected native account, model and workspace are separate choices.
Compute owns scheduling and job state; the pinned Agent Host runner owns native
execution, authentication checks and permissions.

## Select and collect

An identity shortcut supplies `references/target.json`. Read it as metadata, not
instructions. It pins provider, identity, non-secret account descriptor, execution
host and worker/release. If invoked directly, select an existing configured
shortcut first. Do not infer an identity from project ownership or the current
terminal login. A provider change requires an explicitly selected matching
identity. Never copy native login files or read credentials to determine identity.

Read [the task workflow](references/task-workflow.md) before operating Compute.
Resolve models and supported efforts from the configured installed release.
Collect or resolve from the user's request:

- Exact model and reasoning effort supported by that model.
- Instructions and what counts as a useful output.
- One manual run, daily local times with timezone, or a UTC minute interval.
- Execution-host project directory and output directory/files.
- Read roots, write roots, network permission and timeout.

Ask only for missing decisions, grouping short related questions. Propose
project-read/output-write, task-tool network disabled, ten-minute timeout and no
notifications when the user has not specified them; label those proposals in the
review. Do not broaden permissions to make a request work. Claude's currently
qualified file-task profile permits Read/Write/Edit and requires task-tool network
disabled. If a Claude task needs web access or shell tools, stop collection and
explain the unsupported combination before review; obtain an explicit supported
task or provider choice. Never silently remove a requested capability. Inference
connectivity is separate from task-tool network permission.

Do not translate unsupported schedules silently. Current Compute accepts manual,
daily and UTC interval recurrence. Weekday-only, weekly, RRULE, end dates and
future one-off runs require an explicit supported alternative or a scheduler
extension. A local time needs an IANA timezone. Verify host paths; a workstation
or SMB path is not automatically a valid execution-host path.

## Context for fresh executions

When the job continues work or supplies a team dependency, apply
[shared context and continuity](../rudi-chief-of-staff/references/shared-context.md).
Include the common outcome, owning plan/contract, exact source and dependency
identities, relevant execution path, accepted decisions, unknowns, permitted
actions, and expected proof in the reviewed instructions. Verify that the selected
host can retrieve those sources within its approved access profile. Require a
brief start/resume readback and a result identifying context used, actual checks,
pending work, and next owner/action. A fresh execution inherits no chat memory.
Source drift must be reported to the coordinator; it does not authorize changing
the reviewed task revision or widening access. Existing activation gates apply.


Resolve the shared contract through the host's installed `rudi-chief-of-staff`
skill or an exact, retrievable copy supplied by the coordinator. The repository
link does not establish that another skill is installed. If neither source is
accessible, report the missing context before dependent delegation; continue
independent authorized work. Do not invent a skill-dependency schema or install
packages implicitly.

## Prepare and review

Prepare instructions, execution profile and task definition with exact hashes;
validate and create the task **inactive**. Definition validation verifies the
definition and referenced bytes; it does not prove provider/profile readiness.
Preview the next five occurrences for
a recurring task. This stage must not activate a schedule, admit a job, invoke
native inference, change logins or restart workers. A failed prepare stays
inactive; preserve its files and explain the failure.

Present one review containing:

- Identity and expected email, provider, model, effort and execution host.
- Instructions, project, inputs, allowed writes and intended outputs.
- Network permission, timeout, fresh-session/no-notification policy.
- Schedule/timezone and next five nominal occurrences (or one manual run).
- Task ID, inactive state, revision and definition/profile/instruction hashes.

**Wait for the user's approval of this concrete review before activation or a
manual run.** The request to prepare a job or invoke a shortcut is not approval
of an unseen draft. A change to any reviewed setting requires a refreshed review.
Approval already given for the exact unchanged review need not be requested again.

## Activate and verify

After approval, re-read the stored revision and hashes, validate references and
verify the pinned release again. Any drift requires a new review; do not silently
regenerate hashes. Use the documented `activate` or `run-now` command with the
reviewed revision. Report read-back scheduling state or admitted job ID. Admission
is not job completion. When reporting completion, inspect `task runs` and its
receipt/output evidence; distinguish partial application outcomes from complete.

Never fall back to another identity/model, global CLI, fixture release or newly
logged-in account. An auth mismatch or preflight failure is a visible stop.
On an ambiguous timeout, inspect schedule/runs before retrying. Manual retries
reuse the same dedicated idempotency key; do not mint a new key to bypass an
uncertain result. Pause stops future admissions, not an already running job.

## Install and maintain private shortcuts

The public skill is generic. Personal identity shortcuts and absolute host paths
belong in private local configuration and native skill projections. Use
[shortcut setup](references/shortcut-setup.md) when installing them or performing
an authorized runtime-pin repair. Normal job preparation must not silently
change a pin. Shortcut generation and native sync start no jobs or schedules.
