# GitHub reviewer delivery — 2026-10-03

## Contract and working plan

Implement a separately authenticated review publisher for a scheduled agent-host
workflow. The host owns model execution. GitHub owns repository protection. This
public stack stays portable: account names, repository allowlists, machine paths,
App IDs, credentials, run records and schedules are private deployment state.

The deployment requires an exact requested model and effort, independently
verifiable host evidence, revision-bound review/proof verdicts, no author access
to publisher credentials, fail-closed acceptance, bounded retries, reconciliation
of unknown writes, and a separately verified merge-stop control. A model-written
JSON verdict or an unrestricted second process is not a trust boundary.

No new paid service or GitHub spend. No competing scheduler. Preserve existing
work. Automatic merging remains held until live identity, custody, protection,
rejection-path and shutdown proofs pass. This document is not activation proof.

## Phase 0 — baseline

- Isolated branch: `codex/rudi-reviewer-20261003`, base `8e09556`.
- Canonical registry and peer have unrelated dirty work; do not copy it here.
- Existing GitHub client accepts one environment token and supports PR reviews,
  raw REST, and expected-head merge requests. It has no App token lifecycle.
- Existing agent-host gateway V0 accepts synthetic nonprivate prompts only; do
  not widen that contract or pretend its model metadata pins actual execution.
- Reviewed manual index, Co-Pilot Operating Standard, Security F13, and current
  GitHub JWT/installation/check-run API documentation.
- Risk: high (authentication and acceptance authority).
- Horizontal disposition: extend the existing GitHub transport boundary; keep
  model execution in the host, account policy in private configuration. No new
  stack, duplicated general GitHub client, or scheduler.

## Phase 1 — scope and interfaces

1. Add an internal asynchronous token-provider dependency to the existing client;
   preserve the existing MCP tools' authentication and behavior.
2. Add bounded App JWT/installation-token support and proof-oriented tests.
3. Define and implement the restricted publisher and receipt acceptance contract.
4. Connect host-derived evidence and run local integration/rejection tests.
5. Independently review, prepare deployment and canary, then verify external
   identity/protection/synchronization gates when separately authorized.

Never expose a private key, token minting, arbitrary credential selection or
publisher impersonation as an author-callable MCP tool. Concrete host isolation
and evidence provenance must be validated before enabling acceptance writes.

Commit slices: authentication; evidence/publishing; host/deployment integration;
private rollout configuration. This execution does not newly authorize registry
publication or credential/deployment/protection changes. Existing daily Business
publication authority remains scoped to that automation.

## Phases 2–4 — red, green, refactor

Maintain one behavior-level failing test at a time, implement the smallest change,
rerun unchanged tests, then refactor. Record commands and results below. Use
synthetic credentials generated in memory; never read operational keys in tests.

## Phase 5 — proof required

- Package: `npm test` in `catalog/stacks/github`.
- Registry: `npm test`, `npm run validate`, `npm run indexes:sync`,
  `npm run indexes:check`, `npm run catalog:clean:check`, `npm run build`,
  `npm pack --dry-run --json`.
- JS/TS debt scan restricted to edited files through the SWE stack.
- Fresh independent formal review: Standards, Spec and Proof.
- Live canary: App identity, grant scope, exact head/base, native approval,
  wrong/forged/replayed evidence, changed revisions, foreign checks, partial
  writes, expiry/timeouts, merge-stop cutoff and outstanding-write reconciliation.

## Phase 6 — delivery status

Authentication/evidence/publication library checkpoint implemented and tested.
Host controller, proof execution integration and separately enforced merge controls
are not implemented by this checkpoint. The full delivery goal remains active.
No live App registration, credential, service, repository protection, acceptance
success or automatic merge is established here.
Worktree retained; no cleanup authorized. Closeout receipt owner is this task;
trigger is the implementation delivery checkpoint, with source state, proof and
remaining rollout gates recorded before any lifecycle disposition.

## Verification log

### Behavioral red/green evidence

Each next behavior was exercised before its implementation or correction. Commands
were `npm run build && node --test tests/<file>.test.mjs` from the GitHub package;
the final unchanged-assertion regression command was `npm test` there.

| Behavior / test file | Observed red | Green / refactor verification |
| --- | --- | --- |
| App JWT and internal provider (`app-auth`) | unavailable App exchange / missing environment token | signed/scoped exchange and provider auth pass |
| Provider error redaction and modern token syntax (`app-auth`) | leaked synthetic error / dotted token rejected | fixed sanitized error; JWT-shaped tokens accepted |
| Shared expiry-aware token cache (`app-auth`) | concurrent requests minted separate tokens | shared refresh and expiry tests pass |
| Signed exact-contract evidence (`review-evidence`) | evidence verifier rejected valid fixture | valid accepted; forged/stale/mismatch/failing rejected |
| Ordered publication (`review-publisher`) | publisher unavailable | pending checks, approval, then successful checks/readback |
| Durable journal (`publication-journal`) | journal unavailable | fsync persistence, private ownership, lock exclusion and immutable completion |
| Lost final response reconciliation (`review-publisher`) | no recovery method | GET-only recovery, no duplicate writes |
| Whole-body HTTP deadline (`reviewer-transport`) | redirects unrestricted | fixed origin, redirect/size/deadline rejection |
| Disable/expiry during token acquisition (`review-publisher`) | one mutation instead of zero | final-dispatch guard; zero writes |
| Shutdown/expiry and changed-revision audit (`review-publisher`) | historical audit rejected before readback | audit-only recovery; republishing remains blocked |
| Superseding bot decision (`review-publisher`) | expected rejection missing | latest relevant bot decision required |
| Stalled key/provider (`app-auth`) | hung rather than deadline rejection | bounded waits; late key result cannot start requests |
| Base moves between success updates (`review-publisher`) | both checks completed | second check remains pending |
| Superseding and pending App checks (`review-publisher`) | historical receipt replayed as current | latest checks plus complete pending-history inspection |

Adversarial regression coverage also includes exact installation/account identity,
suspension, broadened grants, foreign/malformed/duplicate/truncated histories,
readback revocation, invalid journal modes/symlinks and real subprocess death while
holding a journal lock. The subprocess proof verifies sole-writer exit, preserves
the uncertain record and orphan lock, then audits without GitHub mutation. No TTL
lock eviction exists. Production drain/custody are separately unproven.

### Earlier library checkpoint verification

- GitHub package `npm test`: **45 passed**, including the existing MCP surface.
- Registry `npm test`: **356 passed** across 33 files.
- Registry `npm run validate`: **173 packages passed**.
- Final `npm run indexes:sync` and `npm run indexes:check`: passed.
- `npm run catalog:clean:check`: passed, zero targets. The initial check found
  this task's generated GitHub `dist` and `node_modules`; both were removed after
  the independent package rerun. No source/evidence was removed.
- `npm run build`: passed, including 173-package validation and compilation.
- `npm pack --dry-run --json`: passed; no registry publication performed.
- `git diff --check`: passed; no dependencies added; no live keys used.
- Final scoped SWE debt scan: 15 files in graph, 12 edited JS/TS files reported,
  zero errors. Two existing large-file warnings in shared `core.ts`: 2637 lines
  and 130 functions; base was already 2618 lines. Broad core extraction is outside
  this authentication change; dedicated modules contain the new behaviors.
- The scanner's default unanchored `.git` ignore also matched `github`, producing
  zero scanned package files. Those runs are not counted as proof. The valid scan
  retained repository thresholds/checks and replaced ignore with
  `(^|/)(node_modules|\.git|dist)(/|$)`, using package root, graph/scope `.`, the
  12 edited files, and internal library entrypoints plus `src/index.ts`.
- Fresh independent GPT-6 Astra xhigh review found six defects. Focused correction
  reproduced each behavior, then closed dispatch timing, historical audit,
  superseding reviews/checks, dependency deadlines, and crash recovery. The reviewer
  independently reran 45 tests. Final checkpoint verdict: Standards pass, Spec
  pass for this library boundary, Proof pass, overall pass after focused corrections.
  Full activation verdict: Standards blocked (custody), Spec revise (missing host/
  merge integrations), Proof blocked (live checks), overall blocked. This is not
  full-goal acceptance. Publication and automatic merge remain unactivated.

### Limits and next full-goal checkpoint

The operator-facing library contract and crash procedure are in
`catalog/stacks/github/REVIEWER.md`. No activation is authorized by test success.
A signed fixture does not prove real host execution or credential separation.
The native host controller, protected policy/proof store, signer custody, deployed
writer identity, tested server protection/merge freeze, live canary and accepted
peer synchronization remain required. Existing primary and peer checkouts have
unrelated dirty work and have not been overwritten. Commit/push/PR, credentials,
service deployment, GitHub settings and activation remain separate authority gates.


### Independent review record

The fresh reviewer used GPT-6 Astra at xhigh with no implementation-history fork.
It reviewed the exact uncommitted diff against base `8e09556`, the approved
contract, source, tests and delivery evidence. Six original findings were closed
through focused confirmation: final-dispatch authorization/expiry (P1), superseding
bot decision (P1), superseding App checks (P1), shutdown/expiry audit availability
(P2), dependency deadlines (P2), and drained-process orphan-lock recovery (P2).
The final publisher SHA-256 was
`60a4beac72fedfc16eda6a8a2aae398b1ddc3fc603df308191a040475a7f9e97`.
The reviewer independently executed the 45 package tests; broader repository
results were inspected as recorded proof, not independently rerun.
No unresolved library findings remain. Non-atomic remote writes, actual credential
custody, real host provenance, current-state merging, shutdown enforcement and
peer delivery remain explicit full-activation gaps. No model/provider/effort
substitution, GitHub write or operational secret was used for this review.

## Continuing checkpoint — merge readiness

Previous goal turn: progress (implemented/reviewed library and recorded local
proof). App registration approval remains unanswered; automatic continuation is
not approval. Live mutations remain disabled.

This checkpoint adds a read-only `inspect` path to the existing publisher and a
live GitHub merge-readiness collector/validator. It will use the protected accepted
request, exact signed base/head evidence and existing publication journal; no
caller-provided successful status is sufficient. Reads will verify exact repository
and PR identity, strict App-pinned branch protection with admin enforcement and no
bypass allowances, current native review decision and resolved conversations,
current base ancestry and complete App-owned successful checks. Missing, unknown,
truncated or stale results reject. No merge endpoint or settings mutation is added.

Expected files: review-publisher.ts and its tests; merge-readiness.ts and focused
tests; REVIEWER.md and this engineering record; generated index. Shared GitHub
transport and evidence verification remain canonical. Risk high. Source/test work
is authorized locally; commit/publication, identity creation and activation remain
separate gates. Exit: one-at-a-time red/green proofs, full package regression,
required registry checks/debt scan and independent fresh Astra review. The actual
coordinator merge/unknown-outcome journal, protected host execution/signing, live
freeze/canary and peer synchronization remain later full-goal requirements.

### Readiness implementation and proof

Implemented publisher `inspect` (existing complete publication only, no remote or
journal write) and a separate read-only readiness validator. It returns
`ready-at-observation` with `mergeAuthorized: false`; it is deliberately not a
cached authorization or a merge dispatcher. The trusted controller must wire the
canonical publisher inspector and the same accepted immutable request. Current
risk comes from that protected request; current policy digest is operator input.

Red proofs: the new publisher inspection test failed with missing `inspect`, then
passed unchanged after mode dispatch was added. The first readiness behavior test
failed against the explicit unavailable implementation, then passed unchanged.
After that green behavior, adversarial regression exercised degraded protection,
App pinning, bypass allowances, branch freeze, native review state, complete
conversations, veto chronology, repository/base/head identity, ancestry, accepted
risk/policy, forged/expired evidence, enable changes, publication changes and
sanitized failures. A composition test uses the canonical publisher inspector:
a complete journal with a revoked live check rejects. Every mock rejects mutating
HTTP operations except the fixed read-only GraphQL query. No live GitHub call was
made by these tests.

`npm test` in the GitHub package now passes **56 tests**. The earlier 45-test
review and publisher hash above remain historical; they do not cover this
continuation. Final readiness verification and review are recorded below.
The inspector currently validates classic branch protections and rejects ruleset-
only/unavailable equivalents. The separate controller read identity needs access
to inspect protections; the minimal Reviewer App is not assumed to have it.

### Readiness checkpoint acceptance

Fresh independent GPT-6 Astra/xhigh review, with no implementation-history fork,
reported no actionable P0–P3 findings: Standards pass, Spec pass for the read-only
library checkpoint, Proof pass for local behavior, overall checkpoint pass.
The reviewer independently reran all 56 package tests and `git diff --check`.
Temporary in-memory deadline probes confirmed sanitized rejection for stalled
enable, request loader, publication inspector and token dependencies, including
no downstream work after a late request-loader result. These probes did not edit
source and are supplementary; the checked-in suite remains the reproducible gate.
The reviewer inspected the red/green narrative without reenacting historical reds.

Reviewed SHA-256 values:

- `src/merge-readiness.ts`: `643aa165bb792af21b912e1aa7badf6844765b3f34e3c074e9c80a875e0da479`
- `src/review-publisher.ts`: `3b750f6baee2965b384981a9bca82679e6c18d4bce9390d5cd24c078bd475404`
- `tests/merge-readiness.test.mjs`: `808c7518f56d9e51bead3dff0092026b5620316e5bf78c56b72a9e42c2e29db1`
- `tests/review-publisher.test.mjs`: `33ad76d259b37122cb9d0052664bedc65b23654606d7b30745cc8167fda95ee0`

Implementer verification for this continuation: registry tests 356/33 passed;
catalog validation 173 passed; index sync/check and root build passed. Scoped SWE
debt scan inspected 17 graph files and 14 edited files: zero errors, the same two
pre-existing `core.ts` size/function-count warnings. Catalog hygiene passed with
zero targets after removing only task-generated package `dist`/`node_modules`.
Packaging dry run passed with 1098 entries; no package was published. Broader
registry gates are implementer evidence, not independently rerun review claims.

Full workflow activation remains blocked by protected host/model execution,
proof provenance, signer/credential custody, canonical deployed composition,
merge execution/uncertain-outcome recovery, server-side freeze/shutdown proof,
live canary and accepted-source peer delivery. Multiple reads are not an atomic
snapshot or authorization lease. No App registration, credential provisioning,
commit, push, PR, merge, service deployment or activation was performed.
The full goal remains active; this passing checkpoint does not reduce its scope.


## Native controller continuation — scope lock

Risk remains high. Implement a finite native review protocol client inside
`agent-hosts`, and an internal protected request/proof controller inside `github`.
The existing V0 gateway, its synthetic-only contract and version range stay intact.
No new scheduler, generic runner, MCP publisher tool, credentials, or deployment.

Interfaces: the host owns a dedicated native RPC connection and lifecycle; the
controller loads an opaque request from a protected authority store, validates
revision/contract/source/proof/policy bytes, constructs the review packet, and
records a controller-built audit receipt. Model output contains verdicts/findings
only, never authority or execution identity. Trusted proof records are supplied
by the protected proof authority, never inferred from model output. The same
immutable binding feeds the existing acceptance verifier/publisher boundary.

Observed protocol: generated experimental JSON Schema from Codex CLI 0.151.0.
`thread/start` reports selected model/reasoning effort; `turn/completed` has no
per-execution model/effort attestation. `model/verification` requests account
verification. Native configuration observations must not become effective-provider
attestation. Missing execution assurance blocks acceptance signing/publication;
an audit receipt is deliberately rejected by the existing evidence verifier.

Commit slices (uncommitted, publication unauthorized): native session observation
and strict failure handling; protected authority store/controller/proof binding;
docs and generated index. Exit: focused red/green loops, native wire fixtures and
failure tests, controller integration/rejection tests, package and registry gates,
scoped debt scans, fresh independent Astra/xhigh review, retained closeout.
Actual protected OS/account custody, effective execution attestation, live App
publication, server acceptance/stop/recovery canaries and peer delivery remain
activation gates. No private source is sent in discovery/protocol schema reads.

Horizontal scan: bounded searches of agent-hosts and GitHub found the V0 CLI
parser and NodeProcessExecutor, existing evidence verifier, publisher, journal and
deadline helper. Keep the interactive RPC client distinct from one-shot CLI output
parsing (different lifecycle); reuse GitHub evidence verification and deadlines.
Standardize the native observation contract across the two internal libraries;
resolve here with a cross-package composition test. Protected store persistence
is immutable create-only; publication journal records mutable uncertain/complete
remote writes. Intentional separation, reassess if a third store appears. No new
external dependency or machine-specific catalog configuration.

### Native controller implementation and independent correction proof

Implemented a finite native app-server observation adapter and bounded stdio RPC
client within agent-hosts, plus immutable protected authority storage, exact
request/proof/policy validation and an internal audit controller within GitHub.
The controller has no signer/token/publisher capability. It always holds acceptance
because the inspected native completion protocol lacks separate effective model/
effort evidence. Its audit cannot pass the existing acceptance-envelope verifier.
No existing library implementation or V0 gateway behavior was modified.

Red/green commands: `node --test catalog/stacks/agent-hosts/test/codex-review*.test.js`
and `npm --prefix catalog/stacks/github run build && node --test
catalog/stacks/github/tests/review-controller.test.mjs
catalog/stacks/github/tests/review-authority-store.test.mjs` from repository root.
The next behavioral test was added and run red before each implementation:
first native observation; pre-cancel zero dispatch; rejected reroute during drain;
controller-bound held receipt; immutable authority storage. Initial GitHub build
needed `npm ci --ignore-scripts` from its existing lockfile; that setup failure is
not counted as a behavioral red. No dependency was added.

Fresh independent GPT-6 Astra/xhigh review with no implementation-history fork
matched all 27 supplied source hashes and reran 75 GitHub tests, 57 agent-hosts
tests, TypeScript noEmit and diff checks. It reported four actionable findings:
ignored hook/auth/settings events (P1), incomplete persisted-audit validation,
missing owner cancellation through the controller, and coerced non-string
verdicts (P2). Each was reproduced by an unchanged-assertion regression before its
fix. The implementation now rejects unsafe native notifications before private
source/during drain, revalidates full audit/intent/binding/output/native/verdict
consistency, propagates owner cancellation with no late work, and requires scalar
verdict enums. Focused confirmation and final proof are recorded separately.

Tests also cover negative proof and command hashes, revision/identity/policy
changes, malformed model-authored authority, independent proof checks, uncertain
intent retry suppression, POSIX permissions/symlinks/hardlinks/locks, controller
and native deadlines, synthetic real-child exit, and cross-package native-wire
composition. No private source was sent to a provider by these tests. Mock
connections and synthetic process tests are not deployment or provider proof.

### Native controller final local checkpoint

Focused independent confirmation closed all five findings. The fifth was a
crafted comma-containing key bypass in exact-field comparison; a behavioral red
proved omitted verdict axes could pass. Exact own-key membership/count checks
now reject the case in fresh and replay paths. New input/receipt assertions were
not weakened. The native request schema uses the same exact comparison rule.

Final package proof: **93 GitHub tests**, **62 agent-hosts tests**, TypeScript and
whitespace checks pass. The reviewer independently reran those checks, matched
27 corrected source fingerprints, and compared all 12 emitted GitHub JavaScript
files with an in-memory compiler emit. It independently verified account-route
change rejection before source, separate receipt corruptions, controller-to-native
cancellation/intent preservation, and fresh/replay crafted-key rejection.

Root verification: **356 tests / 33 files**, **173 packages**, generated-index
sync/check, build and packaging dry run pass. Scoped debt has zero errors and no
new warnings; the existing two core.ts warnings remain accepted out of scope.
Final hygiene removes only this task's reproducible GitHub dist/node_modules;
private run evidence and retained-worktree ledger are stored outside the catalog.

Local conditional boundary: Standards/Spec/Proof pass after focused corrections,
subject to the recorded final hygiene/debt verification. Full workflow:
Standards blocked, Spec revise, Proof blocked, overall blocked. Native provider
execution attestation, actual protected host/account/ACL/signer custody, protected
Git importer and isolated proof producer, App publication, server-enforced merge
and stop/recovery canaries, and accepted peer delivery remain unproved. No source
was delivered to the admin peer because rollout/synchronization was explicitly
held. No commit, push, PR, merge, credentials or service activation occurred.
Worktree disposition remains retained/preservation-required, never cleanup-ready.
