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

## Maintain runtime pins

A worker upgrade can leave a private shortcut pointing to a Compute interpreter
that cannot read the worker's current database schema. The Agent Host bundle can
still pass integrity verification in this state: `worker.python` and
`worker.bundle` are separate pins. An unsupported-schema error is a compatibility
failure; it does not by itself establish database corruption.

Perform this procedure only as authorized shortcut maintenance. Normal task
preparation must preserve the pinned execution boundary and report a mismatch.

1. **Inventory the affected targets.** Read the selected shortcut's routing
   instructions and target metadata. Include other private shortcuts that share
   the same worker root and database, and each machine that projects them.
   Inspect separate manual and recurring targets independently; they may use
   different workers and supported schemas. Compare canonical skill files,
   native projections and sync receipts, preserving unrelated edits.
2. **Verify the intended runtime before editing.** On the execution host,
   inspect the live controller's interpreter, arguments, worker label and state
   directory, using a remote login shell when required. Confirm the replacement
   against the accepted deployment configuration; do not select a runtime only
   because its directory name appears newer. Run release verification and the
   read-only health command from [the task workflow](task-workflow.md) with the
   proposed interpreter and the existing directories. The interpreter must
   support the current schema, and integrity checks must pass. A different
   interpreter path can be compatible; a pathname mismatch alone does not
   justify replacing an independently qualified manual target.
3. **Update the canonical private metadata.** Preserve the prior bytes or
   hashes in private maintenance evidence. Update only the verified field in
   `<rudi-home>/skills/<identity>/references/target.json`, or the alternate
   target file selected by that shortcut. For an interpreter-only repair,
   preserve the identity, account, host transport, worker root/label, bundle and
   manifest hash. Preserve per-machine `local` versus `ssh` routing. If an
   operator-maintained generator configuration is used for future provisioning,
   update its affected entries too; retain historical inputs as historical
   evidence. Do not rerun the creation-only generator over existing shortcuts.
4. **Regenerate the selected native projections on each affected machine.**
   Run the scoped sync commands below with the actual affected skill IDs.
   Inspect every dry-run result before applying it; preserve drifted or unmanaged
   files instead of forcing replacement. Do not hand-edit native copies or
   ownership receipts. Reload host sessions when the sync result requires it.
5. **Verify the repair through every configured route.** Compare source and
   projected target bytes on each machine, confirm current sync receipts, and
   rerun pinned release verification, health and model-catalog discovery.
   Confirm the account through the native read-only account interface when
   available; metadata alone does not establish authentication. Verify that
   unrelated skill files, separate routes and existing task revisions remain
   unchanged. A pure pin repair requires no database migration or worker restart
   when the accepted worker and database are already healthy.
6. **Distinguish readiness from execution.** If an end-to-end smoke run is
   requested and authorized under the task workflow, use a fresh manual task
   with a dedicated fixture and deliverable directory, a finite timeout and the
   selected identity/model. Have it read the fixture, compute its checksum, and
   write a small report. Require a succeeded job, a complete application outcome,
   matching observed account, valid receipt/output hashes and independently
   verified report contents. Record whether a native job actually ran; health
   and model discovery alone do not prove execution. Create no recurring schedule
   for a manual smoke test.

For an existing private shortcut, sync only the affected identity packages:

```text
rudi skills sync codex skill:codex-example --dry-run --json
rudi skills sync codex skill:codex-example --json
rudi skills sync claude skill:codex-example --dry-run --json
rudi skills sync claude skill:codex-example --json
```

Supply multiple explicit skill IDs when they share the affected worker. Run the
commands on each host owning the corresponding projections. Keep account names,
absolute host paths, task IDs, receipts and smoke outputs in private evidence;
publish only generic maintenance guidance in the Registry.

If the proposed runtime also fails health, the live worker uses another state
directory, or deployment authority is unclear, preserve the files and report the
unresolved boundary. Do not invoke `init`, downgrade or edit the database, change
logins, replace the Agent Host bundle, or restart services to bypass this repair.
