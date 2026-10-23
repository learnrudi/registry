---
name: "Google Workspace Tools Operator"
description: "Workflow-focused tools for Gmail, Google Sheets, Docs, Slides, Drive, Calendar, and Tasks"
version: 1.0.2
category: "communication"
tags:
  - rudi
  - operator
  - google-workspace
  - capability:manage
  - provider:google
requires:
  stacks:
    - stack:google-workspace
---

# Google Workspace Tools Operator

Use this skill as the host-native operating layer for `stack:google-workspace`.
Translate the user's intent into the smallest safe sequence of stack tool calls,
then verify and report the result.

## When To Use

Workflow-focused tools for Gmail, Google Sheets, Docs, Slides, Drive, Calendar, and Tasks

Use the stack when the request needs these capabilities. Do not substitute
invented results when the stack, a required secret, or a supporting service is
unavailable.

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

- `account_list`
- `account_switch`
- `account_current`
- `gmail_profile`
- `gmail_history_list`
- `gmail_send`
- `gmail_search`
- `gmail_draft`
- `gmail_draft_list`
- `gmail_draft_get`
- `gmail_draft_update`
- `gmail_draft_delete`
- `gmail_draft_send`
- `gmail_get`
- `gmail_get_raw`
- `gmail_list_attachments`
- `gmail_get_attachment`
- `gmail_reply`
- `gmail_forward`
- `gmail_get_thread`
- `gmail_message_trash`
- `gmail_message_untrash`
- `gmail_message_delete`
- `gmail_filter_list`
- `gmail_filter_get`
- `gmail_filter_preview`
- `gmail_filter_create`
- `gmail_filter_delete`
- `gmail_label_list`
- `gmail_label_create`
- `gmail_label_update`
- `gmail_label_delete`
- `gmail_message_modify_labels`
- `gmail_message_archive`
- `gmail_message_mark_read`
- `gmail_message_mark_unread`
- `gmail_message_star`
- `gmail_message_unstar`
- `gmail_message_batch_get`
- `gmail_thread_batch_get`
- `gmail_message_batch_modify_labels`
- `gmail_message_batch_trash`
- `gmail_message_batch_untrash`
- `gmail_message_batch_delete`
- `sheets_read`
- `sheets_write`
- `sheets_append`
- `sheets_create`
- `docs_read`
- `docs_create`
- `docs_insert_image`
- `slides_get_presentation`
- `slides_get_slide`
- `slides_get_thumbnail`
- `slides_batch_update`
- `drive_list`
- `drive_upload`
- `drive_update`
- `drive_create_folder`
- `drive_move_file`
- `drive_download`
- `drive_make_public`
- `drive_delete`
- `calendar_list`
- `calendar_get`
- `calendar_update`
- `calendar_create`
- `calendar_quick_add`
- `calendar_delete`
- `tasks_tasklists_list`
- `tasks_list`
- `tasks_create`
- `tasks_update`
- `tasks_complete`
- `tasks_delete`

Use only tools that are actually available in the active RUDI router. If the
installed stack exposes a different tool set than this catalog version, report
the mismatch and use the live tool schema only when doing so remains within the
user's request.

## Incoming-mail filters

Use `gmail_filter_list`/`gmail_filter_get` to inspect rules and
`gmail_label_list` to resolve existing label IDs. Every filter call requires an
explicit `account` email and verifies its authenticated Gmail profile. Preserve
the selected identity; do not switch the active account.

Before proposing a rule, use `gmail_filter_preview` with a candidate search
`query` and inspect representative matches. Prefer `criteria.query` when the
same search can express the rule. Preview takes a query rather than structured
criteria and returns a bounded sample of message/thread IDs and an estimated
count; it excludes spam/trash, preserves unread state, and does not simulate
future delivery or apply a rule.

`gmail_filter_create` takes Gmail-native `criteria` and `action` objects;
`gmail_filter_delete` takes the exact `filter_id`. Creation/deletion requires
authorization for the concrete account and rule. Tool-development, testing and
audit requests authorize no mailbox changes. Honor already-given permission.
Use label IDs, not names; at most one user label can be added per filter.
Removing `INBOX` skips the inbox; removing `UNREAD` marks mail read; adding
`TRASH` moves matching mail to Trash. Forward only to an explicitly approved,
already verified address. Never infer these actions from a sender being automated.

Creation affects incoming mail; changing existing messages is separate work.
Gmail has no filter update method: replacing a rule requires explicit
create/delete steps and authorization for both. Verify the returned state;
if a mutation is unverified, inspect the rule/list before retrying. Do not
blindly repeat an uncertain create or delete.

Filter settings need `gmail.settings.basic` OAuth consent. Report missing scope
or administrator denial; do not switch accounts, copy tokens or silently start
reauthorization. If live schemas lack filter tools, report that source/installation
gap instead of pretending the skill itself installs the capability. Details and
schemas are in the stack's README and live tools.

## Failure Behavior

For existing Calendar events, use `calendar_get` to inspect the exact event and
`calendar_update` to patch its title, notes, location, or timed interval. Pass
the selected account on both calls and the returned etag when updating. Choose
`send_updates` explicitly according to the user's authorization. Omitted fields
are preserved; empty notes/location clear those fields. Time changes require
both start and end with UTC offsets. An all-day event can receive metadata edits
but cannot be converted to a timed event. Recurring series edits are unsupported;
use an exact occurrence ID for one instance. The tool reads back the result;
if it reports an unverified update, inspect with `calendar_get` before retrying.

- Missing stack or tools: stop and ask the user to install, index, or integrate
  `stack:google-workspace`; do not simulate a successful tool call.
- Missing credentials or authorization: name the required setup without
  printing secret values.
- Invalid input: explain the rejected field or constraint and request only the
  information needed to continue.
- Tool or dependency failure: preserve successful prior work, avoid blind
  retries of mutations, and report a safe retry or recovery step.
- Partial completion: distinguish completed actions from pending or failed
  actions so the user can recover without duplicating side effects.
