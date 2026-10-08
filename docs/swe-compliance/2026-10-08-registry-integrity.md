# Registry integrity and verification remediation — 2026-10-08

Scope: findings 7, 9, 10, 12, 14, 15, and 20 from the supplied registry scan. Changes are limited to the registry compiler/validator, stack-verification runner, package inventory, CI, focused tests, and their security/contributor documentation. No commit, push, release publication, or deployment was performed.

## Changes and disposition

| Finding | Change | Disposition |
| --- | --- | --- |
| 7: incomplete catalog hash | Hash the full catalog, including dotfiles and all payload extensions, with the existing runtime exclusions. Add `.DS_Store` exclusion to both hash and release archive. An actual npm dry-pack inventory test checks every distributed catalog file is hashed. Include stack HTML in npm packaging so the processor frontend accompanies its script. | Fixed; final generated artifacts belong to the parent integration pass. |
| 9: mutable action references | Pin Registry CI checkout, setup-node, and upload-artifact to full upstream commit IDs. Remove the unreachable tag-release action (job admitted only main pushes; inner step required a tag). Existing stack-publish workflows were already pinned. | Fixed. |
| 10: deleted verification files skipped | Use NUL-delimited Git diff paths including deletions and both rename endpoints. Retain changed stacks whose directories remain, even if their manifest/verifier was removed. Fully absent retired directories have no executable contract and remain covered by catalog/reference validation. | Fixed. |
| 12: partial platform indexes on policy error | Treat target-policy failures as compilation errors; resolve/validate every platform before writing any new index. | Fixed. |
| 14: alias collisions | Shared alias-map validation rejects aliases colliding with any canonical ID or an already-declared alias. Catalog validation and compilation use the same invariant. Fix the previously unexercised `new AliasMap()` type-only constructor. | Fixed. |
| 15: claimed offline execution without isolation | All real runner execution goes through a fail-closed OS sandbox. macOS uses a deny-default sandbox-exec profile; Linux uses bubblewrap with isolated filesystem/PID/network namespaces. Expose repository and toolchains read-only, selected stack and temporary home writable, no other user-home files. Package hooks and verification deny network. Dependency installation is separately network-enabled with the same filesystem limits. No unsandboxed fallback. Kill the verification process group on timeout/exit. | Partial: containment kernel-tested on macOS, but Chromium verification remains incompatible; Linux backend requires CI execution with bubblewrap/user namespaces. |
| 20: release build has contents-write credential | Registry artifact-build job is read-only; all checkouts disable credential persistence. No GitHub Release action remains in this build job. | Fixed. |

## Red → green evidence

Each command below first failed for the reported behavior, then passed after its corresponding fix. These were sequential fix slices, not one batch implementation.

- `npx vitest run src/compile.test.ts -t 'binds every'`: red listed 190 npm-distributed catalog files absent from the hash tree; green covers every actual packed catalog path, including `.mjs`, `.cjs`, `.tsx`, `.jsx`, SQL, dotfiles and manifest types.
- `npx vitest run src/compile.test.ts -t 'invalid target platform'`: red compiler succeeded and emitted a zero-package Windows index despite a missing checksum; green exits nonzero and creates no new index files.
- `npx vitest run src/catalog.test.ts -t 'aliases that shadow'`: red accepted canonical-name shadowing; green rejects both canonical and duplicate alias collisions. An initial fixture lacked an unrelated required stack operator, so it was replaced with valid binary fixtures before recording the behavioral red.
- `npx vitest run src/verify-stacks.test.ts -t 'includes deletions'`: red returned only the new rename destination; green returns deleted files and both rename endpoints. Follow-up red/green with `npx vitest run src/verify-stacks.test.ts` covers complete retirement while retaining incomplete-stack failures.
- `npx vitest run src/workflow-security.test.ts`: red found mutable checkout references; green verifies all workflow external action references are full 40-character SHAs.
- `npx vitest run src/workflow-security.test.ts -t 'read-only'`: red found contents-write; green verifies read-only permissions and credential-persistence disabled on all three registry checkouts.
- `npx vitest run src/stack-verification.test.ts -t 'denies host files'`: red synthetic verifier could read a sibling host-private fixture; green denies host reads/writes, denies connection to a controlled parent loopback listener, and prevents a subprocess reading the same private fixture. No real credentials or provider endpoints were used.
- `npx vitest run src/stack-verification.test.ts -t 'terminates verification descendants'`: red descendant survived the deadline and wrote a late marker; green kills the process group before that write.

## Final focused verification

- `npx vitest run src/stack-verification.test.ts src/compile.test.ts src/catalog.test.ts src/resolver.test.ts src/verify-stacks.test.ts src/workflow-security.test.ts`: **104 passed**.
- After readability refactoring: `npx vitest run src/stack-verification.test.ts src/compile.test.ts src/verify-stacks.test.ts`: **43 passed**.
- `npm run stacks:verify -- --stack stack:otter-mcp`: **passed** through the actual macOS sandbox, including the package-owned verifier.
- `npm run build`: **passed**, validating all 174 packages and generating every platform index.
- RUDI `swe_debt_scan`, profile `ci`, scoped to all 12 edited/new root JS/TS files: **zero errors, warnings, or informational findings**.
- `git diff --check`: **passed** at review time.

## Upstream action identity checks

Verified with read-only `git ls-remote` against the official repositories:

- `https://github.com/actions/checkout.git`, `refs/tags/v7.0.1`: `3d3c42e5aac5ba805825da76410c181273ba90b1`.
- `https://github.com/actions/setup-node.git`, `refs/tags/v7.0.0`: `820762786026740c76f36085b0efc47a31fe5020`.
- `https://github.com/actions/upload-artifact.git`, `refs/tags/v7.0.0`: `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`.

## Limits and integration requirements

- Linux bubblewrap execution could not be exercised locally: the host is macOS and its Docker daemon is not running. CI now installs bubblewrap before the tests. Lack of a supported sandbox fails verification rather than executing on the host. Windows verification is intentionally unsupported until a real backend exists.
- Directly invoking stack scripts bypasses the registry runner; documentation states this explicitly. This is OS filesystem/network containment, not a VM or kernel-exploit defense. Trusted runtime installation directories and the checkout must not contain secrets. Python dependency installation may execute build backends in the network-enabled preparation phase.
- The exact sandbox process-group cleanup covers ordinary descendants; a deliberate new-session descendant can outlive the parent on macOS, but retains its inherited sandbox restrictions. Linux PID namespaces additionally limit descendant lifetime.
- `npx tsc --noEmit` was attempted and fails on existing repository type setup: root package lacks Node typings and existing AJV ESM import typings fail. This is not the prescribed build command; `npm run build` passes. No dependency/type-configuration expansion was made.
- Full root suite, final source-clean checks, deterministic index synchronization, release verification, and admin-Mac delivery are owned by the parent integration pass. No source catalog files were edited by this slice, and no installed runtime or service was changed.

## Independent-review corrections

The independent reviewer found two P1 gaps in the initial macOS sandbox implementation. Both were reproduced safely and corrected before acceptance.

1. A selected stack symlink to the repository root broadened its writable grant. `npx vitest run src/stack-verification.test.ts -t 'selected-stack symlink'` first executed the fixture preparation hook and wrote a marker at the temporary repository root; after the fix it rejects the layout before any metadata read or preparation. Shared `assertCanonicalStackDirectory` requires exactly `catalog/stacks/<id>` and rejects symlinked `catalog`, `stacks`, or selected-stack directories. Discovery checks this before reading the manifest; sandbox construction checks it again before granting access. Additional ancestor-symlink tests use deliberately invalid target JSON to prove it is never read.
2. A synthetic-only parent process environment could be inspected through `KERN_PROCARGS2`. `npx vitest run src/stack-verification.test.ts -t "synthetic parent's environment"` failed with syscall success before the fix and passes with permission denied afterward. Removing blanket sysctl access alone did **not** fix this macOS behavior: explicit `process-info*` denial for targets outside the same sandbox is necessary. Broad process access is replaced by fork/exec only; device reads are limited to `/dev/null`, `/dev/random`, `/dev/urandom`. A named sysctl allowlist retains only uname/page-size/CPU-model properties demonstrated necessary by failing legitimate runtime tests. No actual parent secrets were inspected or printed; the test parent is launched with only PATH and a synthetic marker.

Browser provisioning compatibility also exposed a real requirement. The runner now installs locked Playwright's Chromium with a fixed `node node_modules/playwright/cli.js install chromium` command during network-enabled dependency preparation, and sets an isolated `PLAYWRIGHT_BROWSERS_PATH` for every phase. Package-owned preparation/pretest hooks remain offline and reuse the prepared cache. `npx vitest run src/stack-verification.test.ts -t 'provisions locked Playwright'` failed before this stage existed and passes afterward. A CPU-model regression test caught Playwright selecting the wrong architecture when hardware sysctls were unavailable; exact hardware-model/count/brand-name permissions resolve that while the parent-environment denial regression remains green.

### Post-review verification and concrete browser limitation

- Focused registry suites rerun after the review fixes: **110 passed** using the same six-file command above.
- Actual `npm run stacks:verify -- --stack stack:web-export --prepare` demonstrated successful dependency installation, isolated Chromium provisioning, and offline reuse by both `verify:prepare` and `pretest`.
- Full browser-stack verification does **not** pass under the current strict macOS sandbox. Native ARM64 Chromium crashes during startup; bounded investigation described below identified an additional fundamental nested-sandbox incompatibility. Five rendering tests fail; the loopback-listener regression is separately skipped by the package under offline verification because the runner forbids listener binding. Full final execution log: `/tmp/registry-web-export-sandbox.log` (local ephemeral evidence, not a distributed artifact).
- Do not infer all-stack compatibility from the passing Otter and synthetic runner tests. Browser-stack integration remains a concrete limitation pending narrowly reviewed native-browser sandbox support or validation under the Linux backend. No host-network, user-file, parent-process-info, or broad device permissions were added to make browser tests pass.
- Debt scan repeated with the new stack-path helper: non-vacuous graph/scope counts are recorded in the tool result (`filesReported: 13`), with zero findings.

### Bounded native-browser investigation and cleanup failure handling

The opt-in real fixture `RUDI_VERIFY_BROWSER_CACHE=/Users/hoff/Library/Caches/ms-playwright/chromium_headless_shell-1200 npx vitest run src/verification-browser.test.ts` copies only the installed browser distribution into a fresh session and attempts an actual screenshot with Chromium's native sandbox enabled. It remains **red** on this Mac, and is skipped without the explicitly supplied browser cache. It records an unresolved integration requirement, not a passing compatibility claim.

Reading only relevant crash frames and sandbox-denial messages identified `IONotificationPortGetRunLoopSource` and denied `RootDomainUserClient` access. A temporary exact IOKit permission, safe OS-version/memory sysctls, and exact PID-shaped Chromium Mach rendezvous registration progressed startup to its GPU children, which consistently failed with `sandbox initialization failed: Operation not permitted`. Chromium then exited because all GPU subprocesses failed. [Bazel's primary sandbox documentation](https://bazel.googlesource.com/bazel/+/3b9ed6e9d3570a0c67e0d59e65b3785bbc1fad99/site/en/docs/sandboxing.md) independently documents that macOS does not permit sandbox-exec nesting inside an already sandboxed process. Final detailed local fixture log: `/tmp/registry-browser-smoke.log`.

All exploratory browser-only permissions were removed because they did not yield a supported verified runtime. Chromium sandbox disabling and unsandboxed fallback were not used. Browser verification requires a separately validated Linux bubblewrap runner or an isolated VM; Linux Chromium compatibility is still unproven locally and must not be assumed. Network-enabled browser provisioning itself was demonstrated, while package hooks stayed offline.

An independent loaded-suite run also exposed macOS `EPERM` when signaling a verification process group during cleanup. `npx vitest run src/stack-verification.test.ts -t 'OS refuses process-group cleanup'` reproduced two uncaught exceptions and a test timeout by safely simulating this kernel error. The fix converts non-ESRCH signal failures into explicit rejected verification results, including timeout escalation; it never silently accepts failed cleanup. The same regression passed after the fix. `npx vitest run src/stack-verification.test.ts -t 'OS refuses process-group cleanup|terminates verification descendants'` then passed both tests, preserving the real descendant-termination behavior. The intermittent kernel cause is not established; no live-descendant kill failure is suppressed.

Final post-investigation check: `npx vitest run src/stack-verification.test.ts src/compile.test.ts src/catalog.test.ts src/resolver.test.ts src/verify-stacks.test.ts src/workflow-security.test.ts src/verification-browser.test.ts` passed **111 tests**, with the explicitly opt-in native browser integration test skipped. Final scoped `swe_debt_scan` passed with **53 graph files, 14 files reported, zero findings**. `git diff --check` passed. Source was stable before the parent whole-repository gates.
