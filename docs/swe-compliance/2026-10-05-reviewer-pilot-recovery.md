# Reviewer pilot diagnosis and control preparation

## Phase 0: baseline and manual lookup

- Existing retained branch starts clean at `9c1821f`; protected deployment remains disabled.
- Owner diagnostic: source/proof/candidate/intent present, audit/acceptance/result absent, journal empty. Preserve all records and the root operation lock.
- Read native observer/RPC/supervisor, host installer/config/sandbox, and deployment contract. Manual: index, co-pilot standard, master doctrine Appendices C/D, infrastructure runtime/rollback principles.
- Risk: high, because runtime configuration and OS confinement affect acceptance authority.
- Credential-free installed-runtime probe reproduces a session warning for the intentionally enabled `skip_host_skill_discovery` feature. Observer rejects warnings. Sandbox also prevents DNS resolution. Historical stderr was discarded; probe evidence supports reproducible blockers, not a complete reconstruction of the failed native session.

## Phase 1: scope lock

- First slice: correct evidenced startup configuration/network prerequisites, with real credential-free macOS regression tests. Preserve warning rejection, no fork/additional executable privileges, no model calls in tests.
- Expected paths: host deployment module, focused Python tests, deploy documentation, this record.
- Horizontal scan: one canonical worker config/sandbox generator in host; independent native observer remains unchanged. No third configuration implementation.
- Second slice, after diagnosis: smallest fixed-action unattended control package, immutable policy/code and explicit owner installation. Design is saved privately; installation remains a separate approval gate.
- No retries, credential provisioning, lock eviction, policy reset, merge, scheduler changes, repository expansion or permission installation in this source slice.
- Planned commit: one coherent tested startup correction; publication through existing authorized feature branch/PR after review and peer validation. No merge.

## Phase 2: red tests

- Real macOS native app-server session creation with isolated credential-free config must emit no warnings, use exact read-only requested profile, and never start a model turn.
- Real system resolver in network-enabled sandbox must resolve a public provider name while credential-free proof sandbox still denies network and process escape.
- Native red: `RUDI_REVIEWER_TEST_CODEX=<trusted-0.151.0> <actual-python> -I -B catalog/stacks/github/tests/reviewer_native_startup_test.py NativeStartupTests.test_credential_free_session_has_expected_profile_without_warnings` failed on the exact unstable-feature warning; passed unchanged after config acknowledgement.
- DNS red: same runner selecting `NativeStartupTests.test_network_worker_can_resolve_but_cannot_use_arbitrary_local_sockets` returned `dns:false` with network enabled while host DNS worked; passed after granting only the system DNS socket. Initial harness attempt used a Python launcher and failed before the test script; retained as setup evidence, not behavioral red.

## Phase 3: implementation

- Smallest changes supported by red behavior. Use runtime-supported unstable-feature warning acknowledgement in config, retaining strict unexpected-warning rejection.
- Resolver grant must be limited to the system DNS service; do not enable arbitrary local sockets or broad Mach access.
- No production runtime files changed. Failure remains fail-closed.

## Phase 4: green and refactor

- Both unchanged real-runtime tests pass on the admin peer with isolated temporary source/config and its installed, hash-verified CLI. No privileged invocation or model turn.
- Host suite: 14 pass locally and on admin peer. Native observer/package suite: 90 pass.
- No unrelated refactor or dependency change.

## Phase 5: verification

- Focused real-runtime smoke and host regressions; all registry-prescribed gates; applicable package tests.
- JS/TS debt scan if those files change. Fresh independent Astra/xhigh formal review of exact source and evidence.
- Admin peer source/artifact checks must distinguish unprivileged test evidence from protected deployment acceptance.
- Registry: 356 tests / 33 files pass; validation 173 packages, generated index sync/check pass. Catalog hygiene initially found a pre-existing host bytecode cache; moved it to private preserved evidence and reran successfully. Build/pack final results recorded with review evidence. No JS/TS edits; debt scan not applicable.

## Phase 6: closure

- Source correction prepared; independent review/publication pending; existing protected install untouched.
- Owner-local recovery and helper installation require concrete separately reviewed steps. Current failed request remains disabled.
- Live authenticated inference, publication readback, stop/recovery and unattended authorization tests remain explicit gaps.
- Worktree closeout and ledger update required at delivery boundary.
