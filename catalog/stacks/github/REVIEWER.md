# Independent review publication library

Status: library with read-only merge-readiness inspection, **not an installed
service or an authorized merge executor**.
The existing GitHub MCP tools are unchanged. No tool exposes the new publisher,
its keys, token provider, or journal. A caller must supply an independently secured
host integration before using these modules for acceptance.

## What is implemented

- `createReviewerTokenProvider` in `src/reviewer-auth.ts` uses a private RSA key
  to obtain short-lived installation tokens with exact repository IDs and exact
  Contents read, Metadata read, Statuses read, Pull requests write and Checks write
  grants. It verifies installation/account/App identity and suspension. Private
  keys are trusted in-process dependencies, never tool arguments.
- `verifyReviewEvidence` in `src/review-evidence.ts` verifies an Ed25519 signature,
  exact schema, repository/PR/base/head/contract/proof/policy binding, distinct
  host IDs, model/effort, bounded lifetime, passing Standards/Spec/Proof/overall
  verdicts, dispositioned P3 findings and schema-2 native provenance. Only the explicit historical audit
  purpose can inspect expired evidence. Publication always requires freshness.
- `createReviewPublisher` in `src/review-publisher.ts` loads a request by bounded
  opaque ID from a trusted store, verifies its signed envelope and policy, checks
  current GitHub identity/revisions, records intent durably, creates two pending
  checks, submits the exact-head App approval, and completes the two checks.
  It reads back live check/review identities and the latest relevant bot decision.
- `openPublicationJournal` in `src/publication-journal.ts` provides exclusive
  operation locks and atomic, fsynced private records. Unknown writes persist as
  uncertain; repeating a trigger cannot blindly resend them. A complete journal
  record never overrides revoked GitHub approval or changed candidate revisions.
- `reconcile(requestId)` only reads GitHub and updates the local journal. Its
  result is explicitly `auditOnly: true`. Shutdown, expiry or changed candidate
  revisions do not prevent inspection of an older completed operation. Partial,
  revoked, missing, ambiguous or truncated histories remain unresolved. It never
  completes an unfinished remote check or creates another approval.
- `inspect(requestId)` on the publisher requires an existing completed journal
  record and verifies live exact-revision checks and approval without publishing
  or changing the journal. Missing and uncertain records reject.
- `createMergeReadiness` in `src/merge-readiness.ts` composes that live inspector
  with current repository identity, classic branch protection, base ancestry,
  native review decision, merge state, complete discussion history and review
  veto checks. It requires low/medium risk from the protected accepted request and
  the current operator-accepted policy digest. Strict required checks must be pinned
  to the expected App; admins are enforced and returned review-bypass allowances
  must be empty. A locked branch rejects. Unknown, incomplete and stale state
  reject; rules, revisions, reviews, evidence freshness and enable control are
  checked again before returning.

The readiness dependency `inspectPublication` must be wired to the canonical
publisher's `inspect` method in the protected controller. It is a trusted service
dependency, not a caller-provided receipt or model tool argument. `loadRequest`
must use the same immutable accepted request as the publisher. Risk is trusted
controller input bound by the accepted contract/policy; a model must not select it.
An integration test exercises the canonical inspector with revoked GitHub checks.

Readiness returns `ready-at-observation` and `mergeAuthorized: false`. It never
calls the merge endpoint. Multiple reads are not an atomic snapshot or a lease:
GitHub can change immediately afterward. The eventual coordinator must perform
its own just-in-time gate and expected-head merge against server-enforced rules.
This implementation supports the classic branch-protection endpoint; it does not
infer equivalent ruleset-only protection or silently relax unavailable fields.
The controller's read identity needs permission to read branch protection; the
minimal Reviewer App alone is not assumed to supply that permission. This is a
separate read dependency, not a change to the Reviewer's requested write grants.

Reconciliation inspects at most 100 check runs and fewer than 100 reviews. A
larger history, malformed response or body above 256 KiB fails closed and requires
operator investigation; there is no partially paginated acceptance. GitHub lists
reviews in chronological order, which is used to detect superseding decisions.

The operation ID is a SHA-256 digest of the verified evidence object. Journal
records contain the phase, operation ID and completed GitHub IDs, not credentials
or review source. A second independently signed execution is a new operation.
The host must prevent duplicate concurrent review executions for the same candidate.

HTTP calls use a fixed GitHub origin, reject redirects, bound complete response
bodies to 256 KiB and stop waiting after 30 seconds. Key loading is bounded to
30 seconds (tests use a smaller trusted dependency override). The shared client's
injected token provider uses its existing configured API timeout, default 30
seconds. Dependency deadlines discard late results; they do not claim to cancel
external work already accepted by another process. No automatic HTTP write retry.

## Required host composition

A signature proves control of the configured signing key, not that a particular
model ran or that its assessment was correct. Synthetic test signatures are not
production provenance. Before publication, a separately secured host controller
must:

1. Load the operator-accepted policy, task contract and candidate identity from a
   store that the author and reviewing model cannot edit. Risk-specific human
   acceptance belongs here; a change cannot authorize its own gate modification.
2. Obtain an immutable exact-revision source/proof snapshot. Run the approved
   checks with a recorded execution boundary, not by trusting author-written
   success text. Do not execute arbitrary PR code in a credential-bearing service.
3. Invoke the existing native agent host with the exact model/effort, fresh context
   and enforced read-only source access. Record actual host settings, terminal
   status and bounded output. Reject fallback, missing provenance, interruptions,
   failed proof, unknown specification or blocking findings.
4. Construct the binding and signed evidence in the controller. The model returns
   verdicts/findings; it never chooses its own host identity, revisions, policy,
   signing key, credential scope or acceptance authority.
5. Call this library using one repository-scoped token provider per allowlisted
   repository, a private POSIX journal, and a protected enable control. Drain the
   process and reconcile uncertain operations during shutdown.

These host/controller and proof integrations are not implemented by this library.
Neither same-UID filesystem modes nor a second unrestricted process establish
isolation from an author agent with the same permissions. The App key, evidence
key, policy store, journal and enable control must be outside that agent's access.
The reviewing model must also be unable to read or invoke publisher credentials.

## Crash and orphan-lock recovery

An existing lock is never expired by TTL or silently deleted. The library cannot
prove a process is dead from a timestamp. Recovery is an operator procedure in the
protected service environment, not an author/model tool:

1. Disable publication; engage the separately verified merge freeze if acceptance
   checks have been published. Stop the service, disable restart/triggers, and
   verify all writers under the dedicated service identity have exited. A paused
   scheduler or expired lease alone is insufficient. If death/exclusive control
   cannot be demonstrated, leave the lock and uncertain record intact.
2. Resolve the exact private journal root and operation ID from the incident.
   Inspect the root/lock ownership, mode, real path and inode and preserve the
   uncertain JSON unchanged. Reject symlinks, a changed root or another live writer.
3. With exclusive operator control, rename only that orphan lock directory to a
   unique incident quarantine name in the same private directory. Preserve it as
   evidence. Do not remove other locks, edit the record, or reset it to absent.
4. Start one recovery invocation with publication still disabled. Call
   `reconcile` for the protected original request. It acquires a fresh lock and
   performs GET-only GitHub inspection. Partial, dismissed, missing, oversized or
   ambiguous outcomes remain uncertain and cannot be retried automatically.
5. Record the audit outcome. Restart requires operator acceptance, current policy
   checks, reconciled outstanding writes and fresh review where revisions changed.
   A historical `complete` result is not a merge authorization.

The subprocess regression kills the sole writer while holding its lock, confirms
its process exit, preserves the uncertain record and quarantined orphan lock,
then performs GET-only reconciliation with publication writes unchanged. This is
local filesystem/HTTP simulation; production service drain and identity isolation
still need a live proof.

## Merge and shutdown limits

The publisher does not merge, change branch rules, resolve discussions, dismiss
reviews, or enforce human review requirements. The merge coordinator must verify
current receipts and live rules, required App-pinned checks, eligible approval,
resolved discussions, exact base/head, and any human acceptance. It must use an
expected-head merge and strict server-enforced up-to-date checks with no bypass.

GitHub publication is not one transaction. State may advance after the last read
or after a successful write. A return error does not roll back a green check or
approval. Server protections and the separate current-state merge gate must make
stale acceptance unusable. Disabling or suspending the Reviewer App does not revoke
previously green checks or cancel an already-submitted merge by another identity.
A verified server-side freeze/revocation, process drain and request reconciliation
are separate activation prerequisites. None has been activated by these modules.

## Verification

From this package, run `npm ci --ignore-scripts --no-audit --no-fund`, then
`npm test`. Tests use generated in-memory keys, synthetic GitHub responses and
private temporary journals. The registry's engineering record lists broader
checks and live rollout gaps. No real GitHub mutation or key is required.

References: [JWT authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app),
[installation tokens](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app),
[review chronology](https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Native controller audit boundary

`review-controller.ts`, `review-request.ts` and `review-authority-store.ts` add
an internal, finite audit composition. These exports are not MCP tools or an
installed service. `agent-hosts/src/codex-review.js` and `codex-review-rpc.js`
provide its native protocol adapter; the existing V0 gateway is unchanged.

The only caller input is an opaque request ID. A trusted bootstrap supplies a
protected authority store, an enable callback and the native host capability.
The store requires distinct non-root controller, author and worker UID settings,
controller-owned private files/directories, safe ancestors, bounded regular files,
no symlink/hardlink records, exclusive operation locks and immutable fsynced
intent/audit records. UID settings are deployment assertions, not proof that the
host actually runs under those identities. ACLs, administrative access, native
process credentials and signer custody still require independent live tests.

The store reads `<id>.candidate.json`, `policy.json` and
`<sha256>.proof.json`; it creates `<id>.intent.json` and `<id>.audit.json`.
Candidate and proof production belong to the protected importer/proof authority.
The controller does not execute repository code or trust a model's claim that
checks passed. The proof producer must execute policy-approved commands in an
isolated credential-free worker against the exact frozen source; the importer
must independently obtain and verify repository/base/head identity and source
bytes. Hashes bind those supplied bytes; they do not prove their Git origin.
Neither producer is deployed by this library.

The candidate schema binds repository/PR/base/head, exact contract/proof/policy
hashes, model, effort and independent host IDs, plus contract/source text and a
source hash. Policy pins repository IDs, GPT-6 Astra/xhigh, reviewer/proof IDs and
an ordered nonempty set of check IDs and command hashes. Proof must match the
candidate, policy, source and independent proof identity, include every required
check with exit zero and output hash, and confirm termination. Unknown fields,
wrong hashes, source over the byte cap, missing/failed checks and identity reuse
reject before dispatch. See the focused controller tests for synthetic records.

The native host supplies an exclusively owned stdio connection for the exact
observed Codex CLI 0.151.0 protocol. It owns launch, configuration and process-group
termination; `createCodexReviewRpc` only adapts those streams. A bootstrap must
use a separately provisioned worker account and clean approved Codex home, an
empty trusted cwd, no inherited repository/user instructions, hooks, MCP servers,
plugins or credential-bearing environment. Credentials must be provisioned by
the owner under that worker's own subscription login, never copied from another
home. The native process must have no signer/publisher key or authority-store
access. A connected socket or separate same-UID process does not prove custody.
Feature overrides in thread/start are defense in depth; event rejection is
observation after an event, not a sandbox for an already executing tool.

The adapter uses initialize, account/read, fresh ephemeral thread/start and one
turn/start. It requires ChatGPT authentication, openai provider, exact selected
Astra/xhigh, no fallback, no parent/fork/history, no loaded instructions and
read-only/no-network sandbox. It requests disabled shell/apps/browser/computer/
hook/image features and no environment access. It rejects tool events, reroutes,
verification requests, warnings/errors, malformed/oversized output, wrong thread
or turn, failed turns and uncertain termination. RPC errors and controller errors
are sanitized. Input/output are capped, waiting is bounded to at most 15 minutes,
and cancellation poisons further dispatch. Trusted host termination is separately
bounded; a hung host leaves an uncertain intent, never an accepted receipt.

The [native app-server protocol](https://learn.chatgpt.com/docs/app-server)
reports selected model and reasoning effort at thread start, while its turn result
has no separate effective model/effort attestation. `model/verification` is an
account-verification event. A successful observation therefore records
`effectiveExecution: null`, `acceptanceEligible: false`, and
`assurance: native-session-configuration-only`. Runtime schema evidence is private
run evidence, not a bundled schema or a claim of completed live inference.

Every `audit` result remains `status: held`, `publication: null`, with an
`effective_execution_attestation_unavailable` blocker, even when all four model
verdicts pass. No signer, token provider or publisher is injected into this
controller. Its audit shape deliberately fails `verifyReviewEvidence`; callers
must not sign the audit or relabel it as provider attestation. Explicitly approved
native-configuration acceptance uses the separate preparation contract below.

Repeated completed audit requests return the same protected audit after current
policy/proof validation. An intent without an audit, orphan lock or partial file
requires explicit reconciliation after proving the native process group drained.
There is no TTL eviction or automatic retry. Preserve intent/receipt and use a
new authorized request ID only after reconciliation; a new ID alone is not proof
that an earlier process stopped. Audits contain private findings; retain them in
the private authority store and expose only sanitized status outside it.

Before deployment: independently verify custody and effective ACL access, native
configuration/termination and subscription route, importer/proof provenance,
the approved assurance policy, owner enable/revoke control, then the existing
App/server/stop/recovery/peer canaries. Until then this is tested local library
behavior and an acceptance hold, not an operational reviewer or merge workflow.

The controller's `audit(id, { signal })` accepts an owner-controlled shutdown
signal. It aborts ongoing native work, rejects promptly, and suppresses late
reads/results/audit writes; an already durable intent remains for reconciliation.
The enable callback is an admission/final-dispatch check, not a subscription to
configuration changes. The trusted owner bootstrap must also abort the signal on
shutdown or revocation. Signal delivery itself never proves process termination.

Replays revalidate the entire receipt against the current candidate, rederived
packet, immutable intent, exact native observation shape, raw output digest,
strict scalar verdicts and derived blockers. Private audit records retain bounded
raw model output as well as findings so their output digest can be verified.
Do not expose that private output through generic status logs. The observer
conservatively rejects all hook, account-update and thread-settings-update events,
including during connection drain; it does not infer that an update is harmless.

## Explicit native-configuration acceptance

`prepareAcceptance(id, { signal })` prepares unsigned schema-2 evidence only
from an existing completed audit. It never launches a review, signs an envelope,
publishes a check or grants merge permission. It reuses the controller's lock,
deadline, cancellation and current authority validation. Schema-1 policies remain
audit-only; there is no implicit upgrade based on a passing model verdict.

Schema-2 candidate adds `runtimeProofDigest`. Schema-2 policy adds `acceptance`:
`assurance: native-session-configuration`, SHA-256 `approvalDigest` of the owner's
accepted contract, exact `runtime: 0.151.0`, approved `binaryDigest` and
`configurationDigest`, and `requiredRuntimeChecks`. The latter pins IDs and
command digests in this order: runtime-custody, configuration-custody,
worker-isolation, process-confinement, credential-separation. Source-proof checks
and the existing policy/base/head/contract bindings remain mandatory.

The authority reads `<sha256>.runtime-proof.json` through the same bounded,
private, no-follow reader. Its schema-1 record contains `policyDigest`,
`workerHostId`, `executorHostId`, runtime/binary/configuration fields, `checkedAt`,
`expiresAt`, `terminationConfirmed: true`, and checks with exact approved command
digests, zero exits and output digests. The proof identity must be the independent
proof host already pinned by policy. The checked time cannot follow audit
completion; validity is at most 30 minutes. Exact bytes must match the candidate's
digest. These fields are reports from the protected proof producer, not a substitute
for actually running its isolation checks or independently verifying its custody.
The importer/proof producer must never copy author-provided claims into this store.

Preparation revalidates the original intent/audit and current source/proof/policy,
requires all four verdicts pass and only dispositioned P3 findings, and checks
runtime proof, enable control and policy again before returning. Evidence issuance
uses the original audit time; expiry is the earlier of that time plus 30 minutes
or runtime-proof expiry. Replay cannot refresh old acceptance. Cancellation or
missing, failed, stale, altered or revoked evidence returns no acceptance record.

The evidence's `provenance` binds source/candidate/packet/output/runtime-proof and
owner-approval digests, binary/configuration digests, session/turn, requested and
observed profile, runtime, fresh read-only context and confirmed termination.
It states `assurance: native-session-configuration` and `effectiveExecution: null`.
The separate protected signer may sign only this prepared evidence after its own
current enable/authority checks; raw model output cannot supply provenance. The
publisher still verifies the signature, exact binding and freshness, and public
review/check text says that effective provider execution is not attested.

Generic schema-1 signed envelopes are rejected, including historical inspection;
preserve any old local evidence for explicit operator reconciliation, never silently
upgrade or recreate it. No production migration is performed by this library.
Native observations and unsigned prepared evidence alone remain insufficient for
publication. Independent signer/App identity, current server enforcement, human
vetoes, risk-specific acceptance, stop/recovery canaries and peer synchronization
are unchanged rollout gates. This preparation library does not activate them.

Preparation and signed verification share a 192 KiB decoded JSON byte limit;
base64url verification separately accounts for encoding expansion. This contains
the native adapter's 128 KiB verdict output plus bounded provenance metadata.
Oversized evidence rejects; findings are never silently truncated.


## Finite protected integration

The opt-in [deployment package](deploy/README.md) now composes these boundaries
for a single documentation PR. It adds a Git object importer, credential-free
static proof, root-owned installation/configuration, cross-UID supervisor and
acceptance signer. Earlier library-only sections describe the required boundaries;
they are not a claim that a host has been installed or a live pilot accepted.
The normal MCP registration and existing gateway remain unchanged. See the
deployment runbook for owner steps, strict scope and unresolved live gates.
