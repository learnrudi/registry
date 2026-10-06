# Workers

An agent is an AI system that pursues a goal by following a process, using its
capabilities and relevant context to take actions and make decisions within
defined operating boundaries, and evaluating its progress until the goal is
achieved.

A **worker definition** makes those six components explicit. An agent host
uses the definition with a configured instance, current context, and execution
state to perform the work. The host owns execution; RUDI supplies the shared
capabilities and definitions.

## The six components

| Component | Question |
| --- | --- |
| Goal | What outcome are we trying to achieve? |
| Process | What triggers the work, and what tasks, actions, and decisions move us toward it? |
| Capabilities | Which stacks and skills enable those steps? |
| Context | What must we know, and where do we retrieve it? |
| Operating boundaries | What may we do, and when must we stop or ask? |
| Completion criteria | What evidence establishes that we are done? |

Tasks belong inside the process. Actions change or inspect something; decisions
select what happens next. Results update the working context. The host evaluates
completion after each meaningful step and either continues, finishes, or reports
the boundary that requires help.

Every process defines its triggers and entry checks. A trigger answers “why
start now?”; entry checks establish readiness, scope, and authority. Completion
criteria answer “when is this run done?” A timer or event listener detects a
trigger; its existence and authorization must be verified separately from the
worker definition.

## Worker definitions

[Client Meeting Update](client-meeting-update/SKILL.md) turns a completed
client meeting into a verified update to the correct client workspace. Its
worked example uses Otter, Gmail, Google Calendar, and local client context.

[Finance Transactions Update](finance-transactions-update/SKILL.md) uses an
existing Finance application to refresh bank activity, import selected supported
transaction files, preserve custom categories, and review exceptions. Its private
instance binds the application CLI and Finance policy. It creates no schedule
and does not treat a refreshed report as a closed accounting period.

| Worker | Responsibility | Existing procedure/capabilities |
| --- | --- | --- |
| [LinkedIn Post Publication](linkedin-post-publication/SKILL.md) | Prepare one post, publish or natively schedule when authorized, and verify the exact result | Supported browser skill, optional private account operator, source/style policy, existing receipts |
| [Email Review](email-correspondence-review/SKILL.md) | Review a bounded mailbox interval and verify responses and outstanding actions | Mail operator, optional `email-review` reporting policy, scoped supporting evidence |
| [Business Communication Secretary](business-communications-update/SKILL.md) | Reconcile source conversations into the configured Notion action board | `business-communication-secretary`, mail/calendar and Notion operators |
| [Real Estate Intake](real-estate-opportunity-intake/SKILL.md) | Produce verified, reviewable DevelopmentOS Intake workspaces | Existing `real-estate-intake` skill, engine/contracts, and read-only Dwellow evidence |
| [RUDI Repo Steward](repository-stewardship/SKILL.md) | Observe a repository collection and perform bounded authorized maintenance | `rudi-repo-steward`, Repo Steward stack/ledger, repository tools |

These worker skill IDs intentionally differ from their existing operator skill
IDs. Keep those operators available: a worker composes a job, while the operator
continues to own its tool procedure, domain schemas, or engine. Do not replace an
installed operator with a same-named link to a worker. Some operators are private
or separately installed; authoring a worker does not package those dependencies.

```text
catalog/
├── stacks/                          # Executable capabilities
├── skills/                          # Reusable operating instructions
├── agents/                          # External agent host definitions
└── workers/                         # Goal-oriented compositions
    ├── linkedin-post-publication/
    ├── email-correspondence-review/
    ├── business-communications-update/
    ├── real-estate-opportunity-intake/
    ├── repository-stewardship/
    ├── finance-transactions-update/ # Finance refresh, import, and category review
    └── client-meeting-update/
        ├── AGENTS.md                # Directs the host to SKILL.md
        ├── CLAUDE.md                # Imports AGENTS.md
        └── SKILL.md                 # Complete six-component worker instructions
```

## Definition, configuration, context, and history

| Material | Home |
| --- | --- |
| Portable worker definition | `catalog/workers/<worker>/` in Registry source |
| Private instance settings | `~/.rudi/workers/<worker>/` |
| Client knowledge and retained evidence | The existing, approved client workspace |
| Run receipts and operational state | `~/.rudi/state/workers/<worker>/` |

The public definition contains no real client records, personal account
selectors, credentials, or machine-specific absolute paths. The private
instance binds the definition to its host, accounts, source operators, allowed
workspace roots, and authorized run scope. Credentials remain in the existing
secret and connector systems.

### Configure a worker for a real account or workspace

Each new worker's **Configure an instance** table lists its required bindings.
Use a supplied private instance or `~/.rudi/workers/<worker>/INSTANCE.md` on the
execution host. Multiple instances may use different private files supplied
explicitly; keep their identities, destinations, and evidence separate.

1. Select the host, installed operators, exact accounts/workspaces, and allowed
   destinations. Resolve paths on that host and check current tool availability.
2. Have the person authenticate the existing browser or connectors through their
   supported login flow. Store only non-secret selectors and operator references.
3. Verify the actual identity and access read-only. For LinkedIn, verify both the
   target profile/company page and the composer author; signing into a personal
   admin account does not establish the selected company's posting identity.
4. Record the requested operation, actual authorization, relevant domain policy,
   and receipt/report destination. Reuse an existing canonical receipt/ledger
   instead of creating a competing publisher or source of truth.
5. Perform a separately requested bounded run and verify its completion criteria.
   A configured instance is not a schedule, persistent agent, or standing grant
   to publish, change records, or commit code.

Login remains on the machine/browser where it occurred. Verify access each run;
do not transfer credentials, cookies, browser profiles, or private runtime state
between hosts. The catalog contains only the portable definition and fictional
walkthrough; real configuration and live smoke evidence stay private.

## Current support

These are Markdown definitions and teaching examples. SKILL.md contains the
complete six-component definition, including triggers, the full procedure,
and a fictional walkthrough. AGENTS.md directs the host to that skill;
CLAUDE.md imports the short entry point. This overview is the human guide.
Read the selected instance, operator skills, and applicable client policies
before a live run. Host instruction discovery depends on the session's working
directory and settings; an existing session can explicitly read the skill.

`worker` is not yet a Registry package kind. These files are not discovered in
`index.json`, installed by the CLI, automatically projected into hosts, or
included in the current npm package. No watcher, schedule, or persistent
execution loop is activated by creating this folder. The definition can guide
an explicitly requested manual run in a capable host. The skill can also be
linked or copied into a supported host skill location; its presence here alone
does not make a dollar-sign or slash command available.

See [worker authoring status](../../docs/proposals/workers.md) for the boundary
between this authoring area and future package support.

## Make the skill discoverable

A SKILL.md in an arbitrary worker folder does not automatically create a command.
Use the exact uppercase filename and frontmatter `name` and `description`.
The host must discover the folder in a supported location:

| Host | Project location | Personal location | Explicit invocation |
| --- | --- | --- | --- |
| Codex | `.agents/skills/client-meeting-update/` | `~/.agents/skills/client-meeting-update/` | `$client-meeting-update` (CLI/IDE also offer `/skills`) |
| Claude Code | `.claude/skills/client-meeting-update/` | `~/.claude/skills/client-meeting-update/` | `/client-meeting-update` |

Both hosts support symlinked skill directories. For a local teaching setup,
link the entire worker folder so the supporting files stay with it. The following
is an **optional setup example**, run from the client-meeting-update worker folder. It changes host
skill discovery; it does not configure accounts, permissions, or event triggers.
Skip it when an existing system already manages the same skill.

```sh
worker_source="$(pwd -P)"
mkdir -p "$HOME/.agents/skills" "$HOME/.claude/skills"
ln -s "$worker_source" "$HOME/.agents/skills/client-meeting-update"
ln -s "$worker_source" "$HOME/.claude/skills/client-meeting-update"
```

If a destination exists, inspect it and reuse the existing managed setup; do not
force replacement. Project-scoped setup uses the same folder name under the
chosen project's host skill directory instead. For a copy, copy the whole folder
and maintain one authoritative source. Other hosts may use different discovery
locations and command syntax; verify their current documentation.

After setup, verify the skill appears in the host's skill selector or command
menu. If discovery has not refreshed, restart the session. A safe first invocation
is the fictional walkthrough:

```text
Codex:       $client-meeting-update Walk through the synthetic example only.
Claude Code: /client-meeting-update Walk through the synthetic example only.
```

Live work additionally supplies a real meeting reference or bounded interval,
a private instance, and a request to propose changes or apply a local update.
The same skill supports both; the request and existing policies determine scope.

## Teaching from the folder

Show the three files, then open SKILL.md. Its six headings explain the worker
in one place; Triggers, Tasks/actions/decisions, and the fictional walkthrough
are subsections of Process. AGENTS.md and CLAUDE.md are host entry points, not
additional copies of the worker instructions. Extra references or example folders
are optional and should be introduced only when their content warrants them.

Official references:
[Agent Skills specification](https://agentskills.io/specification),
[Codex skills](https://learn.chatgpt.com/docs/build-skills),
[Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[Claude skills](https://code.claude.com/docs/en/skills), and
[Claude instructions](https://code.claude.com/docs/en/memory).
