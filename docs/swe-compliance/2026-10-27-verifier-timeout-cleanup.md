# Verifier timeout cleanup — issue #91

## Phase 0: Baseline and diagnosis

- Accepted baseline: main `ff0ff65bc2d101ff760357f6d1f79c614bed8345`.
- Task: reproduce and fix #91, rerun required checks, obtain independent review,
  publish and merge the accepted fix. Integration owner: this task.
- Evidence: main CI run 40502984409 attempt 1 failed at the post-timeout
  `late-marker` assertion; unchanged attempt 2 passed. The first failure remains
  evidence of descendant execution after the verifier returned.
- Inspected: verifier runner, sandbox construction, process-group signal helper,
  focused tests, contributor guidance, issue/CI evidence, and SWE manual index,
  Appendix C7A and Appendix D.
- Risk: high because lifecycle cleanup is part of the verification boundary.
  Keep the existing file/network isolation and fail-closed signal-error handling.
- Ranked hypotheses: (1) signalling returns before descendant teardown finishes;
  (2) Linux Bubblewrap sessions/PID namespaces place the surviving descendant
  outside the signalled group; (3) the fake-clock fixture changes event ordering.
  Correlate real PID/PGID/session identity, signalling and marker timing before
  selecting a correction. A passing rerun alone does not disprove any hypothesis.
- Local Linux diagnostic environment will use an isolated task container with
  Ubuntu 22.04, Bubblewrap and Node 24. Final acceptance also requires the real
  supported GitHub Linux runner. Host files, credentials and Docker sockets
  must not be exposed to verification code.

## Phase 1: Scope lock

- In scope: verification lifetime/cleanup, focused regression tests and current
  contributor guidance. Expected source neighborhood: `src/stack-verification*`,
  `src/verification-process-group*`, `src/verification-sandbox*`; add a small
  shared lifecycle helper only if diagnosis requires it.
- Non-goals: stack implementations, dependency upgrades, broad process scanning,
  arbitrary PID signalling, sandbox permission expansion or host deployment.
- External observations must be bounded and validated. Never turn unknown
  cleanup state or a denied signal into success.
- Rollback: new feature-branch commits; no protected-branch push or history
  rewrite. Preserve diagnostic evidence and kill only task-owned processes.
- Publication authority: the user explicitly requested the fix, checks, review
  and merge. Issue closure follows verified acceptance; no cleanup is inferred.
- Horizontal scan: the process-group helper is the runner's shared signalling
  boundary. Preserve its existing ownership and Darwin terminal-group contract;
  avoid a second independent signalling implementation.

## Phase 2: Red proof

- Next behavior: after a timeout result returns, a real verification descendant
  cannot react to a newly written trigger or produce a late artifact.
- Reproduce on Linux, then pin the supported cause with one deterministic
  behavior-level test before implementation. Keep the original assertion.
- Observed with Ubuntu 22.04, Bubblewrap 0.6.1, Node 24.21.0 in an isolated
  ARM64 Docker VM: outer launcher and namespace init use different process
  groups. Under controlled CPU scheduling, the init was still `R` after the
  launcher's `close`, then became `Z`. The local real marker probe did not
  reproduce the CI marker write; the original timeout test also passed locally.
  The CI failure remains the real descendant-execution reproduction.
- Deterministic red: `npx vitest run src/verification-lifetime.test.ts` on Linux
  failed at “launcher exit must not complete verification while the sandbox is
  live”: expected false, received true. A launcher protocol fixture uses a real,
  separately grouped process held alive by a release file. OS observation is
  real; no kernel scheduler timing is needed for the regression.
- Local evidence directory: `registry-issue91-20261027` under the operator's
  RUDI outputs. Retained files include `red-lifetime.log`,
  `lifetime-probe-scheduler.log`, `lifetime-probe-busy.log`, and the probe source.

## Phase 3: Implementation

- Added a Linux lifetime observer and connected it to the existing runner's
  completion path. Bubblewrap's private `--info-fd` supplies the namespace init
  PID; it is closed before executing verification code. Metadata is bounded and
  validated. The observer checks the host procfs identity and process owner,
  keeps one open stat descriptor (avoiding retargeting on PID reuse), and waits
  up to five seconds for a terminal or absent process. It sends no new
  termination signals. A signal-0 existence probe of the trusted init PID
  distinguishes process absence from hidden procfs entries; only ESRCH proves
  absence, while live processes and denied probes fail closed.
- Existing group signalling, namespaces, network and filesystem restrictions
  remain in place. Cleanup uncertainty fails explicitly; previous signal errors
  remain failures. Both successful and failed command exits await observation.
- Source references: Bubblewrap 0.6.1 `monitor_child`, `do_init`, info-fd setup
  and setsid/fork sequence; Linux 6.12 `find_child_reaper` / `exit_notify` in
  `kernel/exit.c` and `zap_pid_ns_processes` in `kernel/pid_namespace.c`.
  Linux kills and waits for namespace descendants before publishing init as
  EXIT_ZOMBIE. Pipe EOF or launcher close alone precedes that guarantee.
- Commit strategy: one coherent fix/test/current-guide/compliance commit after
  green checks; separate follow-up commits only for review corrections.

## Phase 4: Green and refactor

- The unchanged red assertion passed with the implementation. The original real
  descendant test, signal-denial tests, and filesystem/network containment tests
  also passed on Linux (`green-lifetime.log`: 55 passed, 2 platform skips).
- Added metadata corruption/overflow, interrupted pipe, observation denial, and
  a real process that exceeds the cleanup bound: 18 focused tests pass on Linux.
  No behavioral refactor and no changes to the original timeout assertion.

## Phase 5: Verification

- Required: focused real-boundary tests; root suite; validation; deterministic
  index sync/check; catalog hygiene; build; release verification; package dry
  run; scoped debt scan; independent Standards/Spec/Proof review; exact-head CI.
- Final macOS full suite: 433 passed, 10 expected platform/browser skips.
  Final Linux focused suites: 78 passed, 2 Darwin-only skips; lifetime suite has
  24 tests. Artifacts: `mac-full-final.log`, `linux-focused-final.log`.
- Root validation, deterministic index sync/check, catalog hygiene, build,
  release verification, public readiness, and package dry-run all passed.
  Index regeneration produced no tracked drift. Scoped SWE debt scan: 0 findings.
- Local Linux focused checks passed. Its full-suite diagnostic attempt is not a
  qualification result: the archive container lacks Git provenance and Python
  3.12 (it has 3.10). Final Linux acceptance requires the normal GitHub runner
  with real checkout, Node 24, Python 3.12 and native Bubblewrap/Chromium.
- Extra `npx tsc --noEmit` is unavailable as a clean repository gate: the root
  package does not install Node type declarations and reports missing Node
  modules/globals throughout existing source. No dependencies were added for
  this unrelated baseline gap; prescribed build/tests remain the gates.
- Pending independent Standards/Spec/Proof review and exact-head CI. Retain
  failing and passing artifacts; do not turn a passing retry into defect proof.
- Review correction: independent review of `b0d330f` found that procfs ENOENT
  can mean denied visibility (`hidepid=2`). A new real-live-process regression
  failed because the observer resolved instead of rejecting. It passes unchanged
  after independent absence checking (`red-hidden-process.log` and
  `green-hidden-process.log`). Additional coverage checks denied probes, actual
  reaped-process absence and unavailable host procfs. No delivered signal or
  procfs permission expansion was introduced.

## Phase 6: Delivery

- Current guide updated: `CONTRIBUTING.md`, stack verification contract, now
  states the Linux procfs prerequisite, lifetime observation and cleanup bound.
  No package schema, stack/tool interface, dependency or cross-repository
  consumer contract changes. Publication/installation/deployment are separate.
- Horizontal disposition: standardize the runner completion contract in this
  change; no duplicate signalling implementation or deferred consolidation.
- Pending final source/proof identities, independent review, commit/PR/merge/
  issue readbacks, post-merge CI and retained-worktree receipt.
- Diagnostic containers and probes are task-owned; remove temporary processes
  after evidence capture. Preserve source worktree and logs until separately
  authorized cleanup. Admin adoption and service deployment remain separate.
