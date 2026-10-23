# Google Workspace RUDI Stack

RUDI MCP stack for Gmail, Google Drive, Google Docs, Google Sheets, Google Slides, Google Calendar, and Google Tasks workflows.

This stack owns Google Workspace OAuth, account selection, and direct Workspace API calls. Other stacks should call this stack for Gmail or Drive access instead of handling Google OAuth themselves.

For per-client account and capability activation, see [Workspace binding](WORKSPACE-BINDING.md). Bound runs expose only their explicit tool allowlist and verify the pinned account. Installing filter support does not add tools to existing client activations.

## Tools

- Account tools: `account_list`, `account_switch`, `account_current`
- Gmail tools: profile, ordered history/cursor reads, search, header-only contact discovery, get, send, draft, reply, forward, incoming-mail filters, labels, archive, trash, batch operations, and attachments
- Sheets tools: read, write, append, create
- Docs tools: read, create, insert image
- Slides tools: get presentation, get slide, get thumbnail, raw batch update
- Drive tools: list, upload, create folder, move, download, make public, delete
- Calendar tools: bounded historical organizer/attendee discovery pages, list, create, quick add, delete
- Tasks tools: list task lists, list tasks, create, update, complete, delete

## Requirements

- Node.js 20+
- RUDI installed and integrated with your agent
- A Google Cloud OAuth client for the Google account or Workspace tenant
- Enabled Google APIs for the tools you plan to use: Gmail, Drive, Docs, Sheets, Slides, Calendar, and Tasks

## OAuth Credentials

The stack reads OAuth client credentials from the RUDI secret `GOOGLE_CREDENTIALS`.

`GOOGLE_CREDENTIALS` may be either:

- the full `credentials.json` content from Google Cloud, or
- an absolute path to a local `credentials.json` file

The credentials JSON must contain either an `installed` or `web` OAuth client with `client_id` and `client_secret`.

Do not paste OAuth client secrets, refresh tokens, access tokens, or connection strings into agent messages, logs, docs, or committed files.

Do not copy credentials or tokens into `~/.rudi/stacks/google-workspace/`; installed stack source may be replaced during reinstall or update. Use `rudi secrets set GOOGLE_CREDENTIALS` for OAuth client credentials and let `rudi auth` write per-account tokens under RUDI state.

## RUDI Setup

Install and configure the stack:

```bash
rudi install stack:google-workspace
rudi secrets set GOOGLE_CREDENTIALS
rudi auth google-workspace user@example.com
rudi index stack:google-workspace --json
rudi integrate codex
```

Restart or reload the agent after integration.

## OAuth Callback

The auth helper starts a local callback server and opens a browser.

Default callback:

```text
http://localhost:3456/callback
```

If that port is occupied, the helper tries the next free port through `3465`. Register the callback URI your OAuth client will use in Google Cloud. For web clients, add every fallback URI you expect to allow.

The account argument is an identity boundary, not just a local label. During consent, select the exact Google user passed to `rudi auth`. Before saving a token, the helper retrieves the authenticated Gmail profile and verifies that its primary email address matches the requested account. A mismatch is rejected without overwriting the account's existing token.

Each account must have its own real directory beneath the stack's `accounts` state directory. Account-directory symlinks and linked token files are rejected so one mailbox cannot redirect or share another mailbox's credentials.

For a client that needs only email reading and calendar viewing, use:

```sh
RUDI_GOOGLE_AUTH_PROFILE=mail-calendar-readonly rudi auth google-workspace user@example.com
```

This requests only `gmail.readonly` and `calendar.readonly` (under
`https://www.googleapis.com/auth/`). It does not combine prior grants, and checks
the token's effective scopes before saving. A broader or incomplete grant fails
without replacing a token. Workspace activation is still a separate required step.

For a remote host, add `RUDI_GOOGLE_AUTH_MANUAL=1`, forward the selected callback
port over SSH, and open `http://localhost:<port>/authorize` in the local browser.
The callback listener binds only to `127.0.0.1` and validates the OAuth state.
Credentials are issued and saved on the host running the helper; never copy them.
The person must select the intended account and approve consent.

Without the read-only profile, the requested scopes are:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.settings.basic`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/presentations`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/tasks`

## State

Tokens and account state are stored outside the installed stack:

```text
~/.rudi/state/stacks/google-workspace/
```

Per-account tokens live at:

```text
~/.rudi/state/stacks/google-workspace/accounts/<account-email>/token.json
```

State files are written with private file permissions where the filesystem supports POSIX modes. Legacy token/account files from older installed stack directories are migrated into this state directory when the stack starts.

## Agent Guidance

Use `account_current` before acting when account context matters. Use `account_switch` or pass the tool's account argument when working across multiple Google accounts.

For privacy-minimized relationship discovery, `calendar_discovery_page`
requires an exact `account`, exact `calendar_id`, inclusive `window_start`,
exclusive `window_end`, bounded page/observation sizes, and an optional
continuation token. It verifies the authenticated Gmail profile matches the
requested account and returns only the echoed scope/window plus ordered
organizer/attendee observations. Provider event IDs and recurrence IDs become
source/account/calendar-scoped SHA-256 keys; event titles, descriptions,
locations, URLs, response statuses, raw provider objects, and credentials never
cross the discovery boundary.

`gmail_send` resolves the authenticated Gmail profile and renders that primary mailbox as the RFC 2822 `From` header. It does not silently inherit a different default Send-As alias.

Gmail composition loads the saved signature for the actual sending address using
`users.settings.sendAs.get` (existing `gmail.modify` access suffices). New drafts,
updates, direct sends, replies, and forwards include it once before quoted content.
Missing, unreadable, image-only, or duplicate signatures block the operation.
Draft sends check the reviewed body without modifying it; update and review an
old unsigned draft before sending. A changed saved signature also requires a
new draft review. Sent messages are read back and report `signatureVerified`;
if verification fails, the response still reports the successful send and warns
against resending. Text-bearing signature comparison ignores HTML formatting;
this is a presence check, not pixel-level logo or link verification. Nested MIME
alternatives use one preferred body. A metadata-only draft update fails before
writing if the existing text body is unreadable, stored externally, or has multiple
independent authored MIME parts that cannot be safely rebuilt. Supply
an explicitly reviewed replacement body if replacing that content is intended.

Ask for explicit user confirmation before sending email, sending a draft, deleting messages, deleting Drive files, making Drive files public, creating/updating/deleting calendar events, applying Slides batch updates, or creating/updating/completing/deleting tasks, unless the user has already authorized that action.

### Managing incoming-mail filters

All five filter tools require `account` as an explicit email address and verify
the authenticated Gmail profile matches it. They do not switch the active
account. Use the live tool schemas; installing skill instructions does not
install tools or grant OAuth permissions.

| Tool | Inputs beyond account | Behavior |
| --- | --- | --- |
| `gmail_filter_list` | None | Read existing rules and their IDs, criteria and actions |
| `gmail_filter_get` | `filter_id` | Inspect one exact rule |
| `gmail_filter_preview` | `query`, optional `max_results` (1–100, default 20), `next_page_token` | Sample a candidate Gmail search query without changing messages |
| `gmail_filter_create` | `criteria`, `action` | Create one authorized rule and read it back |
| `gmail_filter_delete` | `filter_id` | Inspect, permanently delete one authorized rule, and verify absence |

`criteria` uses Gmail's field names: `from`, `to`, `subject`, `query`,
`negatedQuery`, `hasAttachment`, `excludeChats`, and paired positive-byte `size`
and `sizeComparison` (`smaller` or `larger`). At least one effective condition is
required. `action` accepts `addLabelIds`, `removeLabelIds`, and `forward`.
Resolve label IDs with `gmail_label_list`; names and nonexistent IDs are rejected.
Only one user-defined label can be added per rule. A label cannot be both added
and removed. Removing `INBOX` skips the inbox; removing `UNREAD` marks mail read;
adding `TRASH` moves matching mail to Trash. Forwarding requires a separately
approved destination already verified by Gmail; these tools do not set up
forwarding addresses.

Start by listing existing rules and resolving labels. Prefer `criteria.query`
when the same query can express the rule and be sampled directly. Preview
accepts a search query, not a structured criteria object. It returns message
and thread IDs, `resultSizeEstimate`, and an optional `nextPageToken`, preserving
unread status and excluding spam/trash. It is explicitly approximate: it does
not simulate future incoming delivery or translate structured criteria. Inspect
representative messages using read-only tools before proposing a rule.

Creating or deleting a rule requires user authorization for that account and
concrete criteria/actions or filter ID. An audit or permission to build/test
these tools does not authorize changing filters. Gmail offers no update method;
a replacement requires explicit create/delete steps and authorization for both.
Creation does not apply the rule to existing messages. Backlog labeling,
archiving, read-status changes and deletion are separate mailbox actions.

Gmail API requests use a 30-second request timeout with Gaxios retries disabled.
The Google auth SDK may refresh credentials and replay definitive 401/403
rejections; credential refresh has its own duration outside that request timeout.
The application never retries an uncertain write.
Only matching create read-back returns `status: created, verified: true`; deletion
requires a 404 on its read-back for `status: deleted, verified: true`.
`create_not_verified`/`delete_not_verified` mean an attempted write has an uncertain
outcome; `created_unverified`/`deleted_unverified` mean Gmail accepted the write
but verification failed. These return MCP errors with `verified: false`. Inspect
the rule/list before retrying; never blindly repeat a mutation. Provider errors
are summarized without raw request objects or credentials.

Filter settings require `gmail.settings.basic`, added to the OAuth helper's
requested scopes. Existing consent is not expanded automatically. If an exact
account lacks this scope, report the gap and use the approved
`rudi auth google-workspace user@example.com` flow when authorized. A 403 may
also indicate administrator policy. Do not copy tokens, switch accounts or
silently start reauthorization to recover.

Provider contracts: [filter resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters),
[create scope](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create),
and [filter criteria and actions](https://developers.google.com/workspace/gmail/api/guides/filter_settings).

### Editing an existing Calendar event

Use `calendar_get` with `account`, `calendar_id` (defaults to `primary`), and
`event_id` to inspect event details and its etag. `calendar_update` accepts the
same identity plus optional `summary`, `description`, `location`, `start`, `end`,
`time_zone`, and `etag`. It requires an explicit `send_updates` choice (`all`,
`externalOnly`, or `none`) and at least one changed field. Use the returned etag
to reject changes made since inspection. Notes/location can be cleared with an
empty string; omitted fields remain unchanged.

Time changes require both start and end as ISO timestamps with UTC offsets,
with end after start. An optional IANA time zone applies to both; otherwise
existing zones are preserved. Metadata edits support all-day events, but timed
conversion and recurring series edits are rejected. For one recurring instance,
pass that occurrence's ID. Attendees, conference links, attachments, reminders,
and other fields are preserved and cannot be edited through this tool.

The implementation reads the current event, uses a conditional patch with its
etag, and reads it back to verify the requested fields. Each provider call has
a 30-second timeout and mutations are not retried automatically. A concurrent
edit returns `conflict`. An uncertain patch failure returns
`update_not_verified`; an accepted patch with failed/mismatched read-back returns
`updated_unverified`. Both are MCP error results with `verified: false`; inspect
with `calendar_get` before retrying. Only matching read-back returns
`status: updated` and `verified: true`.

Provider contracts: [event patch semantics](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
and [conditional modification](https://developers.google.com/workspace/calendar/api/guides/version-resources).

If a tool reports that authentication is missing, run:

```bash
rudi auth google-workspace user@example.com
```

Then rebuild the router cache:

```bash
rudi index stack:google-workspace --json
```

## Local Development

From this stack directory:

```bash
npm install
npm run build
npm run test:gmail
npm run test:gmail-filters
npm run test:workspace
npm run test:auth
npm run test:gmail-signature
npm run test:calendar
npm run test:slides
npm run test:tasks
npm run test:state
```

Run the MCP server directly:

```bash
npx tsx src/index.ts
```
