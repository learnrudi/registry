# Task workflow and command contract

## Resolve the execution boundary

Use the shortcut's `target.json`. `host.transport` is either `local` or `ssh`.
For SSH, use its configured SSH alias and a remote login shell. Verify the
executable paths on that host. Keep user instructions and JSON data in files or
stdin, never interpolated into shell command text. Use argument arrays for local
subprocesses and correct shell quoting for the fixed remote command.

Let `worker` be the target's worker metadata and `B = worker.bundle`.
On the execution host, first run:

```text
worker.python -I -m rudi_compute.bridge_release verify B --deployment --manifest-sha256 worker.manifest_sha256
```

Substitute each value as one argument; these are notation, not literal commands.
Reject fixtures, a missing release, or hash drift. Read the verified `B/release.json`
to find `external_runtimes.node.invocation_path`. Retrieve the exact model catalog
with this argument array:

```text
[node_path, B + '/cli/dist/index.cjs', 'agent', 'models', provider, '--json']
```

Use an exact `models[].id` and an entry in its `reasoningEfforts`. If that model
does not support selectable effort, explain this rather than inventing one.
Use the metadata's account object unchanged. Claude additionally needs the
organization ID and its separate Anthropic directory. Native checks at admission
and execution verify the selected account; a descriptor alone is not login proof.

Construct the common Compute CLI array `C`:

```text
[worker.python, '-I', '-m', 'rudi_compute.cli',
 '--services-dir', worker.root + '/services',
 '--schedules-dir', worker.root + '/schedules',
 '--state-dir', worker.root + '/state',
 '--logs-dir', worker.root + '/logs']
```

Run `C + ['health']` and inspect the configured worker's live state (on macOS,
`launchctl print gui/<execution-user-uid>/<worker.label>`). Health checks SQLite
and registries; it alone does not prove a running controller. Do not start or
restart a worker as a side effect of drafting a job.

## Prepare files and an inactive definition

Use a fresh task ID matching `[a-z][a-z0-9-]{0,63}`: start with a lowercase
letter, then lowercase letters/digits/hyphens, at most 64 characters total.
Reserve `worker.root/tasks/<task-id>/` exclusively; preserve existing content and
choose a new ID on conflict. Keep control files and runtime outside output roots.
Create only the project/output directories the user requested or approved for
preparation. Resolve canonical execution-host paths; reject symlink aliases.
The project is required as a read root. Write roots must equal deliverable roots,
exclude the whole project/control/runtime roots, and remain disjoint from native
account directories. Existing output trees with symlinks/hardlinks are rejected
by Agent Host. Do not disable that validation.

Write UTF-8 `instructions.md`, then `profile.json` with this shape:

```json
{
  "schema_version": 1,
  "provider": "codex",
  "model": "EXACT_MODEL_FROM_CATALOG",
  "reasoning_effort": "EFFORT_FROM_MODEL",
  "account": {"id": "SELECTED_ID", "email": "EXPECTED_EMAIL", "config_directory": "/private/native/home"},
  "workspace_mode": "registered-shared",
  "working_directory": "/project",
  "read_roots": ["/project"],
  "write_roots": ["/approved-output"],
  "network": "disabled",
  "timeout_ms": 600000
}
```

This is a shape illustration; replace every illustrative value with verified
settings. Use the selected provider's complete account object. Claude requires
`network: "disabled"` and supports only Read/Write/Edit file tasks. Reject a
request needing task-tool network or shell access before preparing a review;
changing its provider or scope requires the user's explicit choice. Omit
`reasoning_effort` only when the catalog offers no effort setting and the review
explicitly says provider default. JSON must have unique keys and finite values.
Choose the runtime policy before hashing the profile. The example uses a finite
timeout; explicit unlimited duration requires `timeout_ms: 0` and a matching
zero bridge timeout on a release qualified for that behavior. Do not silently
change an existing task's timeout or infer installed support from current source.

Compute SHA-256 over the exact file bytes. Write `task.json`:

```json
{
  "schema_version": 1,
  "id": "unique-task-id",
  "title": "User's task title",
  "instructions": {"path": "/control/instructions.md", "sha256": "EXACT_FILE_SHA256"},
  "execution_profile": {"path": "/control/profile.json", "sha256": "EXACT_FILE_SHA256"},
  "working_directory": "/project",
  "outputs": {"deliverables": ["/approved-output"], "runtime": "/control/runtime"},
  "recurrence": {"kind": "manual"},
  "session": {"mode": "fresh"},
  "notifications": {"policy": "none"}
}
```

Supported recurrence alternatives:

```json
{"kind":"daily","timezone":"America/New_York","times":["08:00"],"dst_policy":"skip","start_at":"2026-01-01T00:00:00Z"}
```

```json
{"kind":"interval","timezone":"UTC","anchor_utc":"2026-01-01T00:00:00Z","interval_minutes":60}
```

Choose actual future start/anchor minutes; examples do not establish a default.
Daily times must be sorted, unique HH:MM (1–24); intervals are 1–1440 minutes.
Ambiguous/nonexistent local minutes and missed occurrences are skipped, not
replayed. No weekday filter, weekly rule, end date or future one-shot is supported.

Execute `C + ['task','validate', task_file]`, then
`C + ['task','create', task_file]`. Verify returned ID/revision/inactive state.
Use `task show TASK_ID` for the stored definition and its hash. For recurring
tasks, use `task preview TASK_ID --after CURRENT_UTC_MINUTE --count 5` and show the
nominal UTC times alongside their selected-timezone equivalents. This preview
does not imply admission, current native login validity or domain eligibility.
Compute definition validation may return `provider_validation: "unverified"`;
it verifies references, not the provider's profile schema/capabilities. Label
that distinction in the review. Native admission remains the final readiness
check after approval, and can fail without starting a job.

No `activate` or `run-now` belongs in this preparation step. Persist a review
record containing the returned revision/definition hash, file hashes, selected
target/release pins and human-readable settings. Show that review to the user.

## Approval and activation

Approval must refer to the review above. Re-read the task, compare its revision,
definition and file hashes to the review, and verify the release again. If any
value changed, prepare a new review. Do not accept an arbitrary user-supplied
revision or replace an existing task without its current compare-and-swap value.

For a finite native profile timeout of 1–3600000 milliseconds, set
`bridge_timeout_seconds = ceil(timeout_ms / 1000) + 20`, within 21–3620 seconds.
For explicitly reviewed unlimited duration, both profile `timeout_ms` and
`bridge_timeout_seconds` must be integer `0`; do not add the 20-second reserve
to zero. This requires a matching CLI/Compute release with schema-5 support and
exact release qualification. Check the delivered bundle, not a global CLI.
An older or unqualified bundle blocks this option rather than being upgraded
as a side effect.

Unlimited duration removes the elapsed deadline, not output bounds, leases,
custody, shutdown handling or workspace concurrency. A busy sequential controller
skips missed task occurrences. Confirm these semantics in the owning
[Compute task contract](https://github.com/learnrudi/rudi-compute/blob/main/docs/task-contract.md)
and [Agent Host contract](https://github.com/learnrudi/cli/blob/main/docs/agent-task-execution.md)
at the selected release revisions.

For a reviewed recurring job:

```text
C + ['task','activate', TASK_ID, '--expected-revision', REVIEWED_REVISION,
     '--agent-cli', B + '/agent-runner', '--timeout-seconds', BRIDGE_TIMEOUT]
```

For an approved immediate manual run:

```text
C + ['task','run-now', TASK_ID, '--expected-revision', REVIEWED_REVISION,
     '--agent-cli', B + '/agent-runner', '--timeout-seconds', BRIDGE_TIMEOUT,
     '--idempotency-key', 'manual-review-' + UNIQUE_REVIEW_ID]
```

Use a dedicated manual namespace to avoid collisions with scheduled occurrence
keys. Reuse the exact manual key after an uncertain result; inspect state before
retrying. Do not retry automatically with new keys or credentials.

Read back `task schedule TASK_ID` for recurring work or `task runs TASK_ID` for
manual admission and completion. Report task ID, revision, account, next nominal
time or job ID, and current state. A succeeded queue job can still report a
partial/needs-evidence application outcome; inspect receipts before claiming the
requested work is complete. No ongoing schedule is implied by a paused example.

For later user-requested edits, create new hash-bound files, use `task replace`
with the current revision, and repeat review before activation. Use `task pause`
with the current revision to stop future admissions; it does not cancel active
jobs. Preserve failed requests and receipts for diagnosis.
