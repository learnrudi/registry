# Business Email Intake

Draft registry entry for a RUDI workflow package.

Status: draft. The current registry schema supports `runtime`, `binary`, `agent`, `stack`, `skill`, and `prompt`. It does not yet support `workflow`, so this folder documents the proposed package shape without adding it to `index.json`.

## Proposed Package

```text
workflow:business-email-intake
```

Purpose: help a user and their agent configure an always-on email watcher that logs business-relevant communication to a shared system of record.

This is not an MCP stack by itself. It composes MCP stacks, asks setup questions, creates or connects storage, performs dry runs, and can install a scheduler-backed automation instance. It should not be forced into `stack:*` unless it later exposes MCP tools of its own.

## Conceptual Model

- Stack: reusable capability provider, such as `stack:google-workspace` or `stack:notion-workspace`.
- Workflow: customizable business process that uses one or more stacks.
- Automation instance: one installed, configured copy of a workflow running on a schedule or trigger.
- Thread action row: one active Notion database row representing the current state of a Gmail thread, with message history logged inside the row page.

For this package:

- Workflow: `workflow:business-email-intake`
- Instance: this Mac's hourly `launchd` watcher
- Outputs: Notion Company Communications database, per-row thread logs, and local Markdown communication log

## Agent-Guided Setup

The user works with an agent to instantiate the workflow. The agent should:

1. Verify required stacks are installed.
2. Verify required secrets exist without printing secret values.
3. Ask which email account or accounts to monitor.
4. Ask whether to watch the whole mailbox, inbox only, or selected labels.
5. Ask what counts as business communication.
6. Ask whether to create a new Notion database or use an existing one.
7. Verify the Notion integration can read and write the database.
8. Ask whether matching messages should auto-log or go through review first.
9. Ask whether sent replies should update prior `Needs Reply` rows to `Waiting`.
10. Ask whether calendar events should update meeting rows.
11. Ask whether multiple messages in one Gmail thread should update one action row.
12. Ask whether the agent may prepare response drafts, and where draft text should live.
13. Ask for cadence, such as 15 minutes, hourly, or daily.
14. Generate local config, rules, and scheduler files.
15. Run a dry run and show sample classifications.
16. Install the automation instance only after the dry run looks right.
17. Record health checks, pause/resume commands, and output locations.

## Depends On

Stacks:

- `stack:google-workspace`
- `stack:notion-workspace`

Runtime:

- `runtime:node`

Secrets:

- `GOOGLE_CREDENTIALS`
- `NOTION_API_KEY`

Host capabilities:

- macOS `launchd` for the current instance
- User LaunchAgents directory
- Access to `~/.rudi/secrets.json`
- Access to Google Workspace account state managed by `stack:google-workspace`
- Notion integration access to the target database

## Configurable Fields

Suggested workflow config:

- `gmail.query`: Gmail search query
- `gmail.sentQuery`: sent-mail query for correspondence reconciliation
- `gmail.maxResults`: maximum messages to inspect per run
- `gmail.accounts`: account selector, if multi-account support is enabled
- `calendar.enabled`: whether to reconcile meeting rows against calendar events
- `calendar.days`: number of upcoming days to inspect
- `classification.mode`: `auto-log` or `review-first`
- `classification.rulesPath`: local rules file
- `classification.excludeCategories`: promotions, social, forums, spam, trash
- `correspondence.threadUpsert`: whether one active row should represent a Gmail thread
- `correspondence.threadLog`: whether message history should append to the row page
- `correspondence.updateNeedsReplyFromSent`: whether sent replies update prior rows to `Waiting`
- `drafts.enabled`: whether the workflow can prepare response drafts
- `drafts.destination`: `notion`, `gmail-draft`, `local-file`, or `manual`
- `notion.databaseId`: target database ID
- `notion.createDatabase`: whether the setup flow should provision a database
- `outputs.localMarkdownLog`: local communication log path
- `scheduler.kind`: `launchd`, `cron`, or `manual`
- `scheduler.intervalSeconds`: cadence for scheduled instances
- `privacy.storeBodies`: whether to store full bodies, snippets, or summaries only

## Installs

The reusable workflow package should install to:

```text
~/.rudi/workflows/business-email-intake/
```

An installed automation instance can live at:

```text
~/.rudi/automations/business-email-intake/
```

Expected instance layout:

```text
business-email-intake/
├── README.md
├── config.json
├── business-communication-intake-rules.md
├── communication-log.md
├── bin/
│   ├── business-email-intake.mjs
│   └── run-business-email-intake.sh
├── logs/
└── state/
```

macOS scheduler for the current instance:

```text
~/Library/LaunchAgents/com.learnrudi.business-email-intake.plist
```

LaunchAgent settings:

- `RunAtLoad`: true
- `StartInterval`: 3600
- Working directory: `~/.rudi/automations/business-email-intake`
- Program: `~/.rudi/automations/business-email-intake/bin/run-business-email-intake.sh`

## Required Notion Shape

Default database name:

```text
Company Communications
```

Configured per-instance database ID:

```text
<notion_database_id>
```

Expected properties:

- `Thread` title
- `Company` rich text
- `Engagement` rich text
- `Contact` rich text
- `Channel` select
- `Category` select
- `Priority` select
- `Status` select
- `Owner` people or text, optional for current automation
- `Last Activity` date
- `Due Date` date
- `Last Inbound At` date
- `Last Outbound At` date
- `Last Calendar At` date
- `Sender` rich text
- `Last Message ID` rich text
- `Thread ID` rich text
- `Gmail Thread URL` url
- `Summary` rich text
- `Next Action` rich text
- `Sensitivity` select
- `Source URL` url
- `Drive URL` url
- `Storage URL` url
- `GitHub Path` rich text
- `Reviewed` checkbox

## Security Rules

- Do not store secret values in registry files.
- Do not print OAuth credentials, Notion tokens, or connection strings.
- Do not mutate email without explicit user approval.
- Prefer summaries over full message bodies for shared outputs.
- Keep scheduler logs local unless scrubbed.
- Store only secret names in manifests.

## Health Checks

Dry run:

```bash
~/.rudi/automations/business-email-intake/bin/run-business-email-intake.sh --dry-run
```

LaunchAgent status:

```bash
launchctl print gui/$(id -u)/com.learnrudi.business-email-intake
```

Recent watcher log:

```bash
tail -n 80 ~/.rudi/automations/business-email-intake/logs/business-email-intake.log
```

State file:

```bash
cat ~/.rudi/automations/business-email-intake/state/business-email-intake-state.json
```

## Proposed Registry Schema Extension

A workflow package needs fields that stacks do not currently model:

```json
{
  "id": "workflow:business-email-intake",
  "kind": "workflow",
  "name": "Business Email Intake",
  "version": "0.1.0",
  "description": "Configure an email watcher that logs business-relevant communication to Notion.",
  "delivery": "catalog",
  "install": {
    "source": "catalog",
    "path": "catalog/workflows/business-email-intake"
  },
  "dependsOn": [
    "runtime:node",
    "stack:google-workspace",
    "stack:notion-workspace"
  ],
  "requires": {
    "secrets": [
      "GOOGLE_CREDENTIALS",
      "NOTION_API_KEY"
    ],
    "hostCapabilities": [
      "launchd"
    ]
  },
  "configurable": true,
  "runModes": [
    "dry-run",
    "manual",
    "scheduled"
  ],
  "scheduler": {
    "supportedKinds": [
      "launchd",
      "cron",
      "manual"
    ],
    "defaultKind": "launchd",
    "defaultIntervalSeconds": 3600
  },
  "operations": {
    "dryRun": "bin/run-business-email-intake.sh --dry-run",
    "runOnce": "bin/run-business-email-intake.sh",
    "status": "launchctl print gui/$(id -u)/com.learnrudi.business-email-intake"
  }
}
```

## Open Design Questions

- Should the package kind be `workflow` or should `workflow` be a subtype of a broader `blueprint` kind?
- Should scheduler install/uninstall hooks be part of the workflow package or implemented by the RUDI CLI?
- Should Notion database schemas be declared as provisionable templates?
- Should workflows support multiple named instances, such as one per email account?
- Should state use local SQLite instead of Markdown dedupe once this graduates from draft?
