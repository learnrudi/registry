# Configurable worker definitions — 2026-10-02

## Scope and result

The requested change adds five portable jobs to the existing Markdown worker
authoring area: LinkedIn Post Publication, Email Review, Business Communication
Secretary, Real Estate Intake, and RUDI Repo Steward. Each has a six-component
`SKILL.md`, a short `AGENTS.md` entry point, a `CLAUDE.md` import, private-instance
configuration requirements, and a fictional walkthrough.

The [worker guide](../../catalog/workers/README.md) maps display names to distinct
skill IDs and explains account/workspace configuration. The
[authoring contract](../proposals/workers.md) retains the boundary between source
definitions and future installable packages. Existing operators, engines, source
records, and receipt/coordination systems retain their ownership. No existing
operator skill was replaced or modified by this change.

LinkedIn setup uses a supported host browser, human login, exact target identity,
and verified composer author. Configuration stores non-secret bindings; it does
not copy browser credentials or activate posting. The publication process retains
approved copy, duplicate reconciliation, rendered spacing/media checks, single
submission, native scheduling, and verified readback.

No live instance, source-connector run, publication, domain mutation, host skill
registration, scheduler, package kind, installer, or execution loop was created.
The existing uncommitted work in this checkout was preserved. The coherent future
commit slice is these worker definitions and their authoring/review documentation;
commit and publication were not requested.

## Verification

The following repository gates passed on both the primary and admin peer:

| Command | Result |
| --- | --- |
| `npm test` | 33 files, 358 tests passed on each peer |
| `npm run validate` | Passed |
| `npm run indexes:sync` | Passed; existing index bytes unchanged |
| `npm run indexes:check` | Passed |
| `npm run catalog:clean:check` | Passed |
| `npm run build` | Passed |
| `npm pack --dry-run --json` | Passed; worker authoring files remain outside the npm payload |

All five new skills passed the skill-creator validator on the primary peer.
Its PyYAML dependency was supplied through an isolated `uv run` environment;
no repository dependency changed. Reproduce from the registry root:

```sh
for worker in linkedin-post-publication email-correspondence-review business-communications-update real-estate-opportunity-intake repository-stewardship; do
  uv run --no-project --with 'PyYAML==6.0.2' python \
    ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
    "catalog/workers/$worker"
done
```

Additional checks verified the six components, host entry points, instance
guidance, fictional examples, relative document links, whitespace, and absence
of personal account selectors or machine-specific source paths. Worker structure,
portability, and links were also checked on the admin peer. Source transfer was
limited to explicit task-owned Markdown paths, guarded by prior checksums or
nonexistence, and verified by matching resulting checksums. No credentials or
runtime state were transferred.

## Procedure review and limits

These are manual instruction reviews, not executed live smoke tests:

| Scenario | Defined outcome |
| --- | --- |
| LinkedIn is signed out or composer author differs | Human login/identity resolution before copy entry or submission |
| LinkedIn submission times out | Reconcile the exact post or native queue; preserve uncertainty and do not resubmit blindly |
| An email receives a later teammate reply | Attribute that reply and verify the underlying action separately |
| A board has duplicate rows or an uncertain create | Preserve rows, reconcile by account/source key, and report conflict before another create |
| Property search has multiple candidates or pending parcel scope | Retain evidence and the engine's review blocker; do not infer acceptance |
| A repository has mixed work or another active lease | Defer the affected action and preserve work/coordination |

Red-green-refactor was not used because the change authors Markdown definitions
without implementation code. No JS/TS files changed, so the JS/TS debt gate does
not apply. Registry and document checks prove authoring consistency, not live
authentication, connector behavior, submission success, unattended execution, or
future installer/runner behavior. Those require configured, authorized runs and
their own runtime evidence.

## Publication preparation — October 6, 2026

Prepared the seven worker definitions and their guide alongside the pending portable skill revisions in an isolated checkout of current main `8e09556`. Canonical source on both Macs and both versions of the client-meeting instructions remain backed up. The primary SKILL.md's incremental history and bounded repair rules are preserved. Its AGENTS.md is restored to the short entry-point contract: the old copy duplicated instructions, began with a stray backtick, and linked to a nonexistent examples file. Teaching content already lives inside SKILL.md.

The next source change contains instruction/documentation updates, one existing skill-version contract adjustment and their generated index. Runtime changes remain in draft PR #72 until a compatible CLI npm release is published. Booking Pages and the combined Google Workspace 1.1.2 release have separate source and rollout decisions. No worker instance, host registration, scheduler, source connector or live domain operation is activated by this source publication.
