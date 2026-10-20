# Worker Definitions

Status: authored Markdown definitions and teaching examples; package installation
and automatic execution are not implemented.

The [workers authoring area](../../catalog/workers/README.md) gives each worker
six explicit components: goal, process, capabilities, context, operating
boundaries, and completion criteria. The initial Client Meeting Update example
composes Otter, Gmail, Calendar, and client workspace context without retrieving
live client data. The authoring area also includes Finance Transactions Update,
LinkedIn Post Publication, Email Review, Business Communication Secretary,
Real Estate Intake, and RUDI Repo Steward. The linked authoring guide is the
current definition inventory and configuration entry point.

## Current contract

- `catalog/workers/README.md` is the human guide and host setup explanation.
- `SKILL.md` contains the full goal, process (including triggers and decisions),
  capabilities, context, operating boundaries, and completion criteria.
- `AGENTS.md` directs a host working in the folder to that self-contained skill.
- `CLAUDE.md` imports AGENTS.md for Claude Code without duplicating instructions.
- The fictional walkthrough lives within the skill. Separate reference/example
  folders are unnecessary for this teaching example. A live run also loads its
  private instance and required operators.
- A host discovers the skill only after its folder is placed or linked in that
  host's supported skill location. The README documents optional local setup;
  no global registration or RUDI package installation is performed by authoring.
- Examples are explicitly synthetic and contain no private configuration.
- Private instance bindings live under `~/.rudi/workers/<worker>/`.
- Actual run state lives under `~/.rudi/state/workers/<worker>/`.
- Client evidence and authored knowledge retain their existing canonical home.
- A capable host can read the definition for a separately requested manual run.
- Agent hosts retain ownership of reasoning, sessions, tools, and execution.
- Worker skill IDs remain distinct from the existing operators they compose.
  Private/separately installed operators and domain engines must be bound and
  verified before live work; this authoring area does not bundle them.
- Instance configuration describes required non-secret bindings, not a runtime
  schema, installer, authenticated session, or activation record. Browser and
  connector authentication remain on the execution host.

This authoring area is an explicit documentation exception to keeping unsupported
package ideas outside the catalog. It does not declare a `worker` manifest or
change package discovery, hashes, schemas, CLI installation, npm contents,
native projections, triggers, or scheduling. The existing `agent` package kind
continues to identify external hosts.

## Before installable workers

Supporting installation requires a separately engineered package contract:
schema and dependency validation, discovery/compiler/index support, portable
payload hashing and packaging, isolated CLI installation and removal, preservation
of private instance settings, and host loading. Any automatic trigger additionally
needs bounded discovery, durable source identity, safe retry/concurrency behavior,
status and pause controls, and verified activation with an approved data scope.

Folder existence or a successful Registry build is not evidence of those runtime
capabilities. No command such as `rudi install worker:...` is advertised here.

## Scope and verification

Worker authoring changes add definitions and synthetic teaching material and
document source/instance/context/state separation. The five additional definitions
provide instance-configuration requirements without creating live instances,
authenticating accounts, calling source connectors, changing domain records, or
activating schedules. Existing private manual instances are separate from these
portable definitions.

Verification should check relative document links, the six-component contract,
absence of private account/path data in public files, consistency with installed
operators, preservation of pre-existing source changes, and the existing
Registry checks. No implementation tests are added for documentation-only
definitions; behavior of a future installer or runner requires its own red-green
tests and live smoke evidence.
