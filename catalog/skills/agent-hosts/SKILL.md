---
name: "Agent Hosts Operator"
description: "Governed synchronous MCP gateway for a fixed local DeepSeek, Claude Code, and Codex Agent Host fleet."
version: 1.0.2
category: "agents"
tags:
  - rudi
  - operator
  - agent-hosts
  - capability:manage
requires:
  stacks:
    - stack:agent-hosts
---

# Agent Hosts Operator

Use this skill as the host-native operating layer for `stack:agent-hosts`.
Translate the user's intent into the smallest safe sequence of stack tool calls,
then verify and report the result.

## When To Use

Governed synchronous MCP gateway for a fixed local DeepSeek, Claude Code, and Codex Agent Host fleet.

Use the stack when the request needs these capabilities. Do not substitute
invented results when the stack, a required secret, or a supporting service is
unavailable.

## Task Routing And Verification

Use this operator for a bounded invocation through the installed Agent Host gateway.
Use `agent_host_list` and `agent_host_probe` to resolve a supported host before
`agent_host_invoke`. Pass the exact working directory, task and execution limits
from the user’s scope; inspect the returned status and output. Multi-step task
orchestration belongs to its workflow skill; managing native desktop tasks belongs
to the native task surface. Neither is implied by gateway availability.

For an invocation that is part of coordinated work, apply
[shared context and continuity](../rudi-chief-of-staff/references/shared-context.md)
to the task brief and returned handoff. Pass the common outcome, exact source and
dependency evidence, relevant behavior, authority, and proof; require a brief
readback and a result stating context used, checks, gaps, and next action. Verify
source access on the selected host and recheck current state on retry. Keep
acceptance with the owning coordinator; gateway success is not task acceptance.


Resolve the shared contract through the host's installed `rudi-chief-of-staff`
skill or an exact, retrievable copy supplied by the coordinator. The repository
link does not establish that another skill is installed. If neither source is
accessible, report the missing context before dependent delegation; continue
independent authorized work. Do not invent a skill-dependency schema or install
packages implicitly.

## Workflow

1. Identify the user's requested outcome, inputs, constraints, and whether the
   action changes external state.
2. Inspect the active MCP tool schema before calling a tool. The runtime schema
   is authoritative for parameter names, required fields, and enums.
3. Start with discovery, inspection, validation, preview, or dry-run tools when
   the stack provides them.
4. Use the fewest tool calls that can complete the request. Reuse returned IDs
   and paths instead of guessing them.
5. Before a destructive, irreversible, public, paid, or externally visible
   action, obtain the user's confirmation unless they already authorized that
   exact action.
6. Validate tool results before using them as inputs to another call. Stop on
   malformed results, explicit errors, missing required data, or partial
   completion that makes the next action unsafe.
7. Verify mutations with a read-back, status, inspection, or artifact check
   when the stack supports one.
8. Report what was attempted, what succeeded, what failed, and any output IDs,
   URLs, or paths the user needs.

## Stack Tools

- `agent_host_list`
- `agent_host_probe`
- `agent_host_invoke`

Use only tools that are actually available in the active RUDI router. If the
installed stack exposes a different tool set than this catalog version, report
the mismatch and use the live tool schema only when doing so remains within the
user's request.

## Failure Behavior

- Missing stack or tools: stop and ask the user to install, index, or integrate
  `stack:agent-hosts`; do not simulate a successful tool call.
- Missing credentials or authorization: name the required setup without
  printing secret values.
- Invalid input: explain the rejected field or constraint and request only the
  information needed to continue.
- Tool or dependency failure: preserve successful prior work, avoid blind
  retries of mutations, and report a safe retry or recovery step.
- Partial completion: distinguish completed actions from pending or failed
  actions so the user can recover without duplicating side effects.
