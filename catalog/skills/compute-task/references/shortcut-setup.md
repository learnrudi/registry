# Private identity shortcut setup

Install the shared `skill:compute-task` through the registry's normal accepted
release workflow. Account-specific names, emails and host paths stay out of the
public catalog. Generate them locally from non-secret operator configuration.

Configuration shape (one target per desired shortcut):

```json
{
  "schema_version": 1,
  "targets": [{
    "identity": "codex-example",
    "provider": "codex",
    "account": {
      "id": "codex-example",
      "email": "operator@example.invalid",
      "config_directory": "/private/identity/codex"
    },
    "host": {"name": "Execution host", "transport": "ssh", "ssh_alias": "execution-host"},
    "worker": {
      "root": "/private/worker",
      "python": "/runtime/bin/python",
      "bundle": "/accepted/release",
      "manifest_sha256": "EXACT_ACCEPTED_RELEASE_MANIFEST_SHA256",
      "label": "example.compute"
    }
  }]
}
```

On the execution machine, use `{"name":"Execution host","transport":"local"}`
instead. Claude accounts also require `organization_id` and `anthropic_directory`.
Resolve and verify these values from existing approved worker/release metadata
and the native identity's non-secret account descriptor. Never copy auth files.
The generator does not probe login or certify the configuration.

Use an explicit Python 3.12+ interpreter:

```text
python3.12 scripts/generate_shortcuts.py --config /private/targets.json
  --output /absolute/rudi-home/skills
  --workflow /absolute/rudi-home/skills/compute-task/SKILL.md
```

Pass all arguments on one command line. The output root and shared workflow must
already exist at canonical paths. The generator validates the whole config,
rejects unexpected fields (including token fields), and refuses existing shortcut
destinations. It writes private skill packages, never commands, jobs or schedules.
On a write-time failure it preserves created folders and reports failure; inspect
them before retrying. Do not delete or force-overwrite existing user content.

Project only the new named skills through the existing native skill lifecycle:

```text
rudi skills sync codex skill:compute-task skill:codex-example --dry-run --json
rudi skills sync codex skill:compute-task skill:codex-example --json
rudi skills sync claude skill:compute-task skill:codex-example --dry-run --json
rudi skills sync claude skill:compute-task skill:codex-example --json
```

Use actual generated IDs. Review drift/unmanaged conflicts instead of forcing
replacement. Verify projected entrypoints and target metadata after sync.
Codex skills can be invoked as `$identity-name` or selected in its skills UI;
Claude exposes installed skills through `/identity-name`. Host UI reload may be
required. Do not claim a particular slash-menu entry exists without checking the
host's installed projection.
