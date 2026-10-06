# Reviewer native installation identity compatibility

## Scope and supported cause

Source baseline dd9bfacf; owner-approved migration failed before any staging,
configuration update or privilege grant. A pinned read-only diagnostic isolated
old verify_installation to private-mode validation of installation_id. The
worker-owned UUID is now0644. Root backup/control/release/grant paths are absent;
the disabled marker, original operation lock and preserved metadata are intact.

Codex0.151.0 startup changes this non-secret runtime UUID from0600 to0644 without
changing its bytes. The UUID grants no configuration or acceptance authority.
The worker already owns it and the sandbox intentionally permits its writes.
Credential files, private runtime directories and root configuration retain
existing custody requirements. The scope is this metadata compatibility check,
its behavior/native regressions and documentation. No new network permissions,
credential changes, pilot restart, recovery reset, scheduler or merge authority.

## Red, green and boundaries

Extracted the unchanged identity validation into read_installation_identity,
then added a real-file behavior test. The focused command
`python3 -B catalog/stacks/github/tests/reviewer_host_test.py CustodyTests.test_native_installation_identity_allows_readable_metadata_but_rejects_unsafe_files`
failed on0644 with Protected path mode mismatch. Removing the private-read
restriction for this one non-secret file made the unchanged test pass.

The test still rejects wrong ownership, group writes, symlinks, hardlinks and
invalid identity content. Existing protected_path and checked_file continue to
validate ancestry, ownership, ACLs, regular-file type, no group/world writes,
stable reads and bounded size. No generic custody or credential check changed.

The actual credential-free native startup test now seeds0600, observes0644 after
startup, verifies unchanged UUID bytes through the production reader, and still
requires warning-free read-only selected profile, no inherited instructions,
no credentials or model turn. An initial peer harness omitted TMPDIR and
therefore used world-writable /private/tmp; ancestry validation correctly
rejected it. The harness now supplies the existing private macOS temporary parent. An
intermediate nested parent exceeded the Unix socket path limit; the final
shorter parent passes both tests. These setup failures did not weaken checks.

## Validation and delivery gates

Passed: 15 host tests locally and on the peer; both actual native startup/DNS
tests on admin-mac using its pinned Codex 0.151.0 and protected Python 3.9;
356 registry tests; validate, indexes:sync, indexes:check, catalog:clean:check,
build and package dry-run. Index generation used SOURCE_DATE_EPOCH=1791236050.
Evidence: local RUDI output identity-correction-01 dated 2026-10-06.
Fresh independent Astra/xhigh source review is the remaining publication gate.
No JS/TS edits or new dependencies; JS/TS debt scan not applicable.

Private migration must use this corrected, pinned verifier to inspect the old
hash-bound descriptor because the old verifier rejects normal native metadata.
It must retain all other existing install checks, validate exact old descriptor
and code hashes, preserve UUID bytes/mode and credentials, and remain disabled.
The separately identified private control release path must derive from the
same manifest prefix as installation. Revised package review, owner-local
execution, installed authorization checks and live recovery proof remain gates;
source tests alone do not establish any of them.
