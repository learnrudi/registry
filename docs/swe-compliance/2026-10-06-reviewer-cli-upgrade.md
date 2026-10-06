# Protected reviewer CLI upgrade

## Phase 0: Baseline and manual lookup

Baseline af41ccc. The normal CLI on both Macs is 0.160.1; the protected
reviewer is independently pinned to 0.151.0. Official CLI changelog lists
0.160.1 as the current stable release. Native diagnosis established that the
worker sandbox cannot enumerate native trust roots, while an explicit
root-owned system CA bundle succeeds without relaxing confinement.
Manual: Master Engineering Doctrine dependency and trust-boundary guidance;
Appendix C red-green; Appendix D evidence-based diagnosis.
Risk: high, because this changes a protected executable and its acceptance
contract. Preserve GPT-6 Astra/xhigh, no fallback, disabled state, existing
failed-attempt records, role identities, credentials, fixed controls and grants.

## Phase 1: Scope lock

Upgrade the native observer, controller, acceptance validators, host verifier,
fixtures and current deployment documentation to exactly 0.160.1. Bind the
explicit system CA digest into installed configuration and verify custody before
launch. Inspect adjacent runtime pins to prevent shared-contract drift; disposition
is standardize contract in this change, with no unrelated consolidation.
Expected paths: agent-hosts native adapter/tests/docs; github native request,
controller, acceptance, host and their focused tests/docs; generated index only
through indexes:sync. Historical evidence retains its observed old version.
Private owner package is upgrade-only, with create-only release staging,
preserved prior descriptor/configuration, no attempt replay or policy enable,
and a bounded no-turn model-catalog check. All failures preserve the disabled
marker and records. Root installation requires the owner's terminal password.
User authorized upgrade and prior feature-branch publication/peer sync. No
merge, scheduler, new review request, credential migration or provider change.
One coherent source commit after gates and independent Astra/xhigh review;
separate reviewed private installation package after source commit.

## Phase 2: Red tests

First reproduce the existing verifier's version rejection with the real 0.160.1
CLI and empty credentials. Then test the supported native session and reject
the old runtime; add behavior coverage for explicit CA selection and tamper
rejection before launch. Do one behavior at a time.

## Phase 3: Implementation

Pending. External binary bytes require official npm metadata integrity verification
and an exact SHA-256 pin. Preserve no-tool/no-delegation confinement. Do not
weaken protocol validation to accommodate unexpected runtime behavior.

## Phase 4: Green tests and refactor

Pending focused native protocol, adapter/controller, host custody and CA tests.

## Phase 5: Full verification

Required: registry tests/validate/index sync/check/catalog hygiene/build/pack;
affected stack verification; scoped JS/TS debt scan; real credential-free
startup and sandbox checks on both architectures; fresh read-only independent
Standards/Spec/Proof review. Owner authenticated model-catalog confirmation is
a separate installation proof, not inferred from an unauthenticated handshake.

## Phase 6: Docs, contracts and closure

Pending source revision, peer verification, package review, owner run and
worktree closeout. A passing startup or model listing does not establish a
completed private review, publication, or provider execution attestation.

## Source verification checkpoint

Native 0.160.1 failed first on the prior runtime pin, then failed closed during
managed-preferences synchronization under the existing sandbox. A bounded
credential-free experiment isolated the minimum new permissions: preferences
agent lookup and read-only shared memory for daemon + exact role UID. No
additional executable, fork, arbitrary local socket or shared-memory write grant.
Production profile now opts in only for its worker UID. Strict-config launch
prevents the CLI's default-config fallback when managed preferences fail.

Adapter red: updated one fixture session to 0.160.1, then ran `node --test
--test-name-pattern='records selected' catalog/stacks/agent-hosts/test/codex-review.test.js`;
it rejected the new session. Updating active version pins made the adapter suite
pass, retaining explicit rejection of old/unknown runtimes before private input.
CA red: focused `CustodyTests.test_worker_environment_requires_pinned_ca_and_ignores_ambient_trust`
failed for missing production behavior. Green: 17 host tests pass with custody,
CA-change and ambient-environment rejection. Configuration digest binds CA bytes.

Real credential-free startup passes on both arm64 and x86_64 with exact 0.160.1,
Astra/xhigh and no instructions, credentials, turn or tools. DNS succeeds while
local sockets, fork and extra execution remain denied. Admin peer: 2 native,
17 host, 6 process tests pass under actual CLT Python. Initial peer harness used
a system Python launcher and home ancestry carrying ACLs; corrected harness
uses the actual protected interpreter and private macOS temporary directory.
No custody assertions were relaxed.

Registry's required gates, release:verify and validate:public pass. Changed-from
stack selection omitted unstaged work, so explicit stack selection is required.
Scoped debt: 5 Github and 4 agent-hosts files reported, zero findings with explicit
packaged controller/observer entrypoints (pilot-entry imports the built controller
and observer). Tests do not prove authenticated catalog access or a real review.

Private evidence directory: cli-upgrade-09 under the 2026-10-06 RUDI execution
outputs. Official npm tarballs verified against SHA-512 metadata; installed peer
x64 binary matches downloaded SHA-256. Source review and owner installation remain
pending; no protected files have changed.
