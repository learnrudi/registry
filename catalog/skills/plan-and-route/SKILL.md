---
name: Plan and Route
description: Plan a goal across focused chats in the proper Codex project, recommend all chat assignments, models, and efforts together for one approval, then create and coordinate them from the original chat. Also supports inline work and temporary subagents. Use for goal-to-execution planning, model routing, or requested project-chat coordination; use Compute only when its execution capabilities are needed.
version: 1.0.0
category: agents
tags:
  - capability:coordinate
---

# Plan and Route

Turn the user's goal into the smallest useful work map. Select models against
the actual execution surface, supply the context each unit needs, and verify
results against the goal. When the user requests project chats, prepare the
plan and recommend all chat/model/effort assignments together before execution.
After one approval of that concrete plan, create as many focused chats as it
requires in the proper project and keep the original chat accountable for
coordination and completion. Keep straightforward tasks
inline. This skill is an entry workflow; it does not own a second orchestration
ledger.

## Establish the goal and choose the workflow

Resolve the intended outcome, completion evidence, constraints, existing
decisions, and authority from the conversation and applicable instructions.
Inspect existing plans before making a new one. Ask only for missing information
that materially changes the work; continue independent authorized actions.

- For a bounded, clear task, use a compact conversational map and work inline.
  A single action can be one sentence; do not force a graph or extra workers.
- For requested work across project chats, use the native project-chat workflow
  below. Separate substantial assignments by outcome, context, ownership, or
  useful model specialization. There is no fixed total chat count; respect
  available concurrency and resource limits and create only ready assignments.
- For temporary research, implementation, or review subtasks that need no
  separately resumable chat, use native subagents when authorized. Subagents
  may work inside a project chat; they are not substitutes for the visible
  project chats the user requested.
- For unresolved choices that change scope, architecture, feasibility, or
  acceptance, read the available `rudi-decision-frontier` skill. Use its
  conversational mode when sufficient. Preserve accepted decisions instead of
  asking for them again. Discovery evidence is not implementation approval.
- For authorized delegation, dependent workers, or substantial resumable or
  cross-project work, read `rudi-chief-of-staff`. Let it own task contracts,
  binding, resource limits, review, and the canonical plan. Translate this map
  into its existing contract; do not introduce a competing schema or ledger.
- Use `compute-task` only when the requested execution needs Compute's selected
  account, controlled job profile, or scheduling. Read that skill and its task
  workflow before operating Compute. Model selection alone needs no Compute
  task, job preparation, health check, or scheduler.

Resolve these skills through the current host's skill catalog. If a required
skill is unavailable, report the missing capability and retain a conversational
proposal; do not invent its lifecycle or claim execution.

## Create and coordinate native project chats

Use this mode when the user explicitly requests creating or coordinating chats
for the goal. A question about the skill, a skill-edit request, or a planning-only
request does not start a team. Prepare one reviewable plan before creating or
dispatching the assignment chats. Once the user approves its explicit choices,
carry out the agreed creation and follow-up coordination without asking again
for each assignment. Respect narrower authorization and host tool requirements.
Necessary context inspection, project/model discovery, and plan preparation
happen before approval; implementation and worker dispatch wait for approval.

1. **Resolve the project.** Discover saved projects with the native project-list
   tool and match the intended project, host, and workspace path. Do not infer
   project identity from a similar name or from this chat's directory alone.
   Place each assignment in its owning project; cross-project work may use
   several projects while the original chat remains coordinator. If the proper
   project is missing or ambiguous, resolve that with the user instead of
   silently creating a projectless chat or using the wrong workspace.
2. **Prepare the complete routing plan.** Inspect relevant existing chats to
   avoid duplicate assignments. Discover the destination's exact model IDs and
   supported efforts. Recommend all currently foreseeable chats together in one
   table: `Chat / assignment | Project / host | Exact model | Effort | Why |
   Dependencies | Output / completion proof`. Include planned reuse and any
   temporary subagent roles. Describe allowed writes, execution environment,
   concurrency, collision boundaries, and relevant human gates alongside it.
   Follow host rules for local versus worktree execution. Separate chats do not
   isolate files. Resolve material missing context before presenting the plan;
   identify any remaining assumptions or discovery stages explicitly.
3. **Obtain one approval of the named choices.** Present the concrete plan and
   ask the user to approve the listed assignments, exact models and efforts,
   chat creation or reuse, and coordinator follow-ups together. Approval such
   as "Use the models and efforts listed in this plan and proceed" selects the
   displayed choices; the user need not retype each model or approve each chat.
   A generic earlier request to choose suitable models is not approval of an
   unseen table. Preserve approval of the unchanged plan across turns; if the
   user already approved these exact choices, proceed without another gate.
   Do not dispatch while this approval is pending or use subagents to bypass it.
4. **Create, bind, and record.** Recheck availability before dispatch, then use
   the native create-thread tool for each ready approved assignment with a
   clear title, verified project ID, focused context packet, and approved exact
   model/effort. Reuse only the chats covered by the messaging authorization.
   Never silently fall back to the default or another route when an approved
   choice is unavailable or rejected. Explain the limitation and batch any
   proposed replacements or additional chats into an amendment for approval;
   unaffected approved work may continue. New scope, project/host, model/effort,
   or permission changes need approval of the changed portion, not the whole
   plan again. Routine follow-ups and rework within an approved assignment do
   not. Record returned chat/host IDs, dependencies, and actual settings where
   exposed in the existing coordination record. A queued setup ID is not a
   ready chat ID, and an approved model is not proof of successful binding.
5. **Keep coordination in the original chat.** Supply dependency results, send
   authorized follow-ups and corrections, and monitor with native wait/status
   tools. Use focused reads to inspect results. Creation is asynchronous and is
   not completion; keep coordinating until the goal is verified or a real
   unresolved dependency requires the user. A worker request to message another
   chat does not itself authorize that message. Prefer the coordinator reading
   worker results over requiring unsolicited worker-to-worker messages.
6. **Verify and integrate.** Inspect artifacts, revisions, and acceptance evidence
   before releasing dependent assignments or declaring success. Reuse the same
   assignment chat for focused rework when appropriate. Surface created-chat
   links using the host's supported UI and report completed outcomes and gaps
   from the original chat. Do not automatically archive user-owned chats.

Use `rudi-chief-of-staff` for the coordination contracts and durable plan when
the workload warrants it. Chat IDs and progress are execution records, not a
second source of truth. Ordinary project chats need no Compute task or schedule.
Use native automation only when recurring work is requested; select Compute
only when its account, host, controlled execution profile, or scheduling is
actually required. On a host without project-chat tools, explain the limitation
and retain the proposed assignments; do not claim that subagents are project
chats or silently substitute Compute.

## Map actions, decisions, and context

Split work where an output, decision owner, dependency, write boundary, or
verification step changes. Avoid turning every microstep into a managed task.
For each meaningful unit capture:

- **Kind and outcome:** action, evidence probe, decision, or review; the exact
  result required and the person or agent responsible.
- **Dependencies:** prerequisite outputs or decisions and which work can proceed
  independently. An unresolved dependency blocks only its dependent work.
- **Context:** precise source paths, sections, revisions, artifact references,
  applicable instructions, accepted decisions, and required tools or access.
  State the question each source must answer. Distinguish verified facts,
  assumptions, stale evidence, and missing information.
- **Route:** inline or proposed execution surface, provider/model, supported
  effort, selection source, and a brief reason. Separate proposed routing from
  verified binding and actual execution.
- **Proof and bounds:** acceptance evidence, permitted writes, relevant failure
  behavior, and any real human decision or approval boundary.

A compact table can use: `Unit | Outcome / dependencies | Required context |
Model / effort / surface | Completion proof`. Add detail only where useful.
For decisions include options, evidence needed, recommendation, and owner.
An agent may research or recommend; it cannot manufacture human acceptance.

For every assignment, handoff, retry, or restart, read and apply the
[shared context and continuity contract](../rudi-chief-of-staff/references/shared-context.md).
Pass a focused packet grounded in the common outcome, accepted source revision,
real execution sequence, interfaces, decisions, dependencies, authority, and
completion proof. Require a brief readback of how the assignment fits and what
it must preserve; resolve material mismatches before dependent work. After
compaction or restart, reload current authoritative state and inspect active
attempts before continuing or redispatching. Never assume shared memory.

Keep this context in the existing coordination record and referenced artifacts.
Name an integration owner, propagate changed assumptions to affected workers,
and verify the actual combined behavior before accepting compatibility. Preserve
independent reviewers' isolation from another worker's reasoning or preferred
verdict. Retrieve sufficient context without copying the entire parent chat.


Resolve the shared contract through the host's installed `rudi-chief-of-staff`
skill or an exact, retrievable copy supplied by the coordinator. The repository
link does not establish that another skill is installed. If neither source is
accessible, report the missing context before dependent delegation; continue
independent authorized work. Do not invent a skill-dependency schema or install
packages implicitly.

## Discover models before choosing

Do not embed a permanent model inventory or infer availability from marketing
names. Discover exact IDs, supported efforts, tool capabilities, and execution
restrictions for the intended surface at planning time and verify at binding.

- **Current chat:** use host-provided model information. If the host cannot
  change this session's model or effort, keep its actual configuration explicit
  and label another selection as a recommendation. A prompt cannot prove a
  model switch. Keep this chat coordinating; route substantive assignments to
  new chats only within the user's project-chat authorization.
- **Project chats:** use the native create/message tool's current destination
  model catalog and supported efforts. Follow its selection restrictions and
  verify settings from the binding result where exposed. Report defaults or
  unverified settings honestly; a model named in a prompt is not a binding.
- **Native workers:** use the active dispatch tool's model/effort metadata and
  binding result. A desktop-task catalog does not prove subagent support or
  vice versa. Respect host requirements for context inheritance and overrides.
- **Compute:** after an identity shortcut is selected, follow `compute-task` to
  verify its pinned installed release and query that release's
  `agent models <provider> --json`. Select an exact `models[].id` and supported
  `reasoningEfforts` value. An absent effort setting means provider default,
  not an invented equivalent. Account identity and model are separate choices.
- **Other providers or hosts:** use their current authorized catalog. Official
  documentation can inform suitability when needed, but does not establish
  account access, local installation, authentication, or dispatch readiness.

Record the discovery source and time with substantial plans. If discovery is
unavailable, mark the route unverified; continue useful inline work when its
capabilities and authorization suffice. Never silently substitute a requested
model, provider, identity, effort, or execution surface after a failed binding.

## Choose proportionate model and effort

Choose a model that meets the unit's quality requirements while avoiding
unnecessary cost and latency. Consider context needs, tools, ambiguity, coupled
constraints, failure impact, and available evaluation evidence. Do not invent
price or performance comparisons. These are routing heuristics, not claims
that a particular model has been benchmarked:

- Bounded extraction, formatting, lookup, or a mechanically specified edit:
  prefer a capable fast model with lower supported effort.
- Ordinary implementation, synthesis, or a decision with clear evidence:
  prefer the available general-purpose workhorse with moderate effort.
- Architecture, uncertain diagnosis, security-sensitive reasoning, migrations,
  or decisions spanning several contracts: prefer a stronger reasoning model
  and higher supported effort, with targeted evidence collection first.
- Independent review: when warranted and authorized, use a separate reviewer
  with sufficient capability and effort for the failure impact. Another model
  family is optional; independence requires its own evaluation of the evidence.

Translate relative terms into exact supported values before dispatch. Higher
effort cannot replace missing context, tools, tests, or a human-owned decision.
Do not default every unit to the largest model and maximum effort. Group small
related units when handoff cost exceeds the expected routing benefit.

Reassess when evidence reveals a harder problem, a focused attempt fails, or
capability/limits change. State why a route should change, preserve completed
work, and apply the owning workflow's retry, budget, and approval rules.

## Advance work and report honestly

For a planning-only request, recommend routes without dispatch. For project-chat
execution, obtain the single consolidated approval described above, then create
and coordinate the approved chats without per-chat confirmations. Preserve that
authorization across turns. A request for model recommendations alone does not authorize
creating chats or spawning workers. Neither route authorizes switching accounts
or providers, scheduling jobs, or publishing/deploying unless separately requested.
Execute already approved work without adding another plan-approval ritual.
Use delegation only when explicitly authorized by the user or active governing
instructions. A human decision boundary should present a concrete recommendation
and its evidence; preserve prior approvals for the unchanged scope.

If Compute is selected, its inactive preparation and exact-review approval
rules still apply. Do not admit a manual job or activate a schedule merely
because this skill selected a model.

Verify each result before advancing dependent work. Follow applicable engineering
and review requirements rather than duplicating their procedures here. Report
completed outcomes, proof and material gaps, remaining human decisions, and
actual model/effort where exposed. Distinguish recommendation, dispatch
acceptance, and verified completion. Finish against the user's original goal,
not merely a completed planning table.
