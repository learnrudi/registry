# Registry #76: Linux verification repair

## Phase 0: Baseline and manual lookup

- Baseline: feature `9233997dc60d9875ab3ae94d213596cf1eb91c29`; accepted main `2ad101b32efb955cbeee52396ffbcd485da83f83`. The retained feature worktree was clean before a history-preserving main merge. Its only conflict is generated `index.json`, resolved using `indexes:sync` from the combined canonical sources.
- Instructions: root AGENTS.md; SWE Operating Manual testing/debugging doctrine, co-pilot and security standards; diagnosis, compliance, publication, review and worktree-closeout skills.
- Inspected: workflow; verification environment, sandbox and package preparation; browser launch and security tests; failed Linux run; generated-index compiler; incoming main commits.
- Risk: **high**, because this verifies an untrusted-package/browser containment boundary. No production runtime or sandbox permissions are to be relaxed.
- Horizontal scan: `src/verification-sandbox.ts`, `src/stack-verification.ts`, `src/verification-browser.test.ts`, `catalog/stacks/web-export/src/browser.ts`, related tests and workflow. There is one OS sandbox builder and one browser launch boundary; no new semantic implementation is needed.
- Evidence directory: external task receipt `registry76-linux-fix-20261020` under the operator's output directory. Earlier evidence is retained unchanged.

## Phase 1: Scope lock

- Goal: make PR #76's real Linux package verification pass, including native Chromium sandbox startup, offline network/file containment and rendering, then obtain a fresh Astra Extra High review.
- Invariants: `chromiumSandbox: true`; unprivileged bubblewrap; offline child network isolation; scrubbed environment; explicit deadlines and cleanup; no unsandboxed fallback; SHA-pinned actions and read-only workflow token.
- Expected changes: this record, `.github/workflows/registry.yml`, Web Export's browser-security fixture, generated `index.json` for main integration, and append-only outcome notes in the existing security/integrity records if needed.
- External inputs: package scripts and active HTML are untrusted; package provisioning alone may use network. Linux verification must remain inside its private namespaces. The native browser sandbox must also remain enabled.
- Failure behavior: unsupported kernel/AppArmor combinations fail closed. No global sysctl changes, permissive AppArmor profile, Chrome sandbox bypass, or swallowed package-test failure.
- Authorized endpoints: Registry #76 feature fix and exact-branch publication needed for GitHub Linux checks, plus Astra Extra High review. No Registry merge/release/installed-stack adoption, CRM merge/deployment, live database/schema/data/grant changes, credentials or providers.
- Commit slices: (1) current main merge with regenerated index and root gates; (2) bounded CI/fixture correction plus evidence, after local checks; (3) any deterministic review correction separately. Only normal commits and exact feature-branch pushes; no history rewrite or deletion.
- Horizontal disposition: no consolidation obligation. Supported-runner assumptions are documented below and require reassessment before widening platform support.

## Phase 2: Red proof and diagnosis

- Existing reproducible red: `npm run stacks:verify -- --changed-from <PR base> --prepare` in [run 37862143771](https://github.com/learnrudi/registry/actions/runs/37862143771/job/113600130300), feature `9233997...`, Ubuntu 24.04. Web Export: 10 failures, 12 passes, 2 skips; native startup reports `No usable sandbox!`. Root tests and manifest matrix passed.
- First incorrect state: distro bubblewrap's AppArmor child profile strips capabilities before Chromium attempts its nested native sandbox. `no_new_privs` causes profile stacking; a Chrome-specific allowance does not remove the enclosing denial.
- References: [Chromium's AppArmor/userns guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md), [upstream bubblewrap restriction profile](https://gitlab.com/apparmor/apparmor/-/raw/master/profiles/apparmor/profiles/extras/bwrap-userns-restrict).
- Hypothesis: the supported Ubuntu 22.04 runner, without Ubuntu 24's additional AppArmor userns restriction, permits nested native Chromium sandboxing inside the unchanged unprivileged bubblewrap boundary. The same real package hooks must pass; a string assertion about `runs-on` would not prove this.
- Red-green adaptation: this is a CI environment correction, not a production behavior change. The existing native-rendering/containment failures are the red proof. Green requires actual GitHub Linux execution on the final feature head, not a local Mac result or mocked browser.

## Phase 3: Implementation

- Pin the core package verification job to Ubuntu 22.04; retain the separate latest-platform manifest matrix.
- Install bubblewrap, FFmpeg and Poppler. Remove the Ubuntu 24-specific AppArmor profile setup. Do not alter host security settings or source sandbox flags.
- Run the active-HTML loopback denial fixture inside Linux's private network namespace. Retain the offline skip on macOS, where the verifier forbids binding the host listener fixture. Assert that script execution completes and no loopback request arrives.
- Status: bounded workflow/fixture correction implemented; Linux verification pending. No refactor or dependency-version change.

### First qualified-runner execution

Run [39439454371](https://github.com/learnrudi/registry/actions/runs/39439454371), head `2e3b5c678b1cdb7de9a7ad3383ad2150ad93da47`, passed the manifest matrix and OS containment tests but stopped at the new main-branch Compute skill test: `spawn python3.12 ENOENT` (371 passed, one failed, two skipped). Ubuntu 22's default PATH does not supply that explicit interpreter. Add SHA-pinned `actions/setup-python` v7.0.0 with Python 3.12 before root/package verification; keep the test and required interpreter unchanged. This observed integration failure supplies red evidence; the next full Linux execution must supply green. Source and tag were resolved from the action's official GitHub repository.

## Phase 4: Green tests and refactor

- Root tests; workflow/security-focused tests; required validation, deterministic index sync/check, clean-catalog check, build and package dry-run.
- No refactor planned. Audit complete staged diffs and preserve incoming main sources before each commit.

## Phase 5: Full verification

- Required final-head GitHub gates: Test, Build & Verify, including every changed stack hook and debt scan; Ubuntu/macOS/Windows manifest matrix.
- Local gates pass: 373 root tests, one explicitly opt-in browser-cache proof skipped; validate (175 packages), indexes:sync/check, catalog:clean:check, build, release:verify (seven hashes), public readiness (zero errors/warnings), and package dry-run. Logs are preserved in the external evidence directory.
- Root debt scan: zero findings. Scoped Web Export scan: 20 graph files, one changed fixture reported, zero findings. An initial root-scoped scan reported no fixture files, so it was replaced by this non-vacuous package-scoped scan.
- Native Linux rendering/network smoke: pending GitHub. The optional root browser-cache smoke remains opt-in; do not claim it ran without a cache.
- Independent reviewer: fresh GPT-6 Astra, Extra High, with separate Standards/Spec/Proof verdicts; pending.

## Phase 6: Documentation, limitations and closure

- Ubuntu 24 strict AppArmor rendering remains unsupported and fail-closed. This fix qualifies Ubuntu 22.04 CI, not all Linux distributions or arbitrary hosts. Reassess before the runner's retirement or expanding the supported environment.
- macOS nested native-browser sandbox proof remains a known separate environment limitation. No weaker browser startup mode is introduced.
- Main integration: `df32027bb1ff2b268a29672b88de52a9b5f9e0ab`, normal two-parent merge preserving both histories, generated conflict resolved via canonical sync. Fix commit, exact-head CI, reviewer verdict and retained-worktree receipt: pending.
- Definition of Done: local required gates pass, Linux package hooks and platform matrix pass on the pushed head, independent review has no unresolved blocking findings, evidence and retained-worktree receipt are read back. Registry merge and all live changes remain separate, unexecuted gates.
- Current verdict: **in progress**.
