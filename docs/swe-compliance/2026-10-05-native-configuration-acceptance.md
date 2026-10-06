# Native configuration acceptance contract

## Approval and outcome

The owner explicitly selected “Prepare native-configuration acceptance” after
reviewing the evidence decision. Implement and independently review this local
contract. No credential provisioning, activation, external publication, source
commit/push/merge, server-policy change, new scheduler or spending is authorized.
Risk: high. Relevant SWE standards: boundary/authority discipline, phase gates,
red-green-refactor, lifecycle/revocation, explicit proof and independent review.

Accept verified native session configuration as the declared assurance basis.
Never claim effective provider attestation. Preserve all other acceptance gates.
Raw native observations and audit records remain non-publishable by themselves.

## Scope and interfaces

Paths relative to catalog/stacks/github unless specified:

- Modify src/review-request.ts: explicit schema-2 policy/candidate opt-in, owner
  approval digest, exact approved runtime/configuration hashes and prescribed
  independent runtime checks. Keep schema-1 audit behavior; no implicit upgrade.
- Modify src/review-controller.ts: prepareAcceptance(requestId) loads and
  revalidates an existing immutable audit under the same authority lock. It must
  never dispatch a new review. Require current source/proof/policy/intent and a
  fresh independent runtime proof; recheck enable/policy before returning.
- Modify src/review-authority-store.ts: bounded protected runtime-proof reader
  by digest, with existing ownership/no-follow/ancestor checks. No importer or
  provisioning shortcut.
- Add src/native-acceptance.ts: one canonical native provenance validator and
  evidence builder shared by controller preparation and signed verification.
- Modify src/review-evidence.ts: schema-2 signed envelopes require exact native
  provenance. Old generic envelopes do not silently gain this assurance.
- Modify src/review-publisher.ts: public check/review text states configuration
  assurance and its limit; retain exact revision/identity/replay/revocation rules.
- Update affected tests and add focused acceptance tests/helpers, REVIEWER.md,
  and the agent-hosts NATIVE-REVIEW.md integration boundary. Regenerate root index.
- Existing merge-readiness implementation remains unchanged; its signed fixture
  and canonical review-body fixture migrate to schema 2/disclosed assurance.
- Preserve agent-hosts implementation/tests and all unrelated source.

## Acceptance criteria

1. Schema-2 policy expressly names native-session-configuration and the owner
   approval digest. Missing opt-in never permits acceptance preparation.
2. Candidate binds exact protected runtime-proof bytes by SHA-256. Runtime proof
   binds current policy, worker and independent proof host, approved runtime and
   configuration hashes, finite observation validity and prescribed checks for
   runtime custody, configuration custody, worker isolation, process confinement
   and credential separation. Every exact check must succeed and have an output
   digest. Protected importer provenance remains a live deployment requirement;
   author/model assertions cannot stand in for these records.
3. Revalidate existing audit/intent against current candidate, derived packet,
   proof and policy, output digest and verdicts. Require all pass, no P0/P1/P2,
   bounded nonempty P3 dispositions. No new inference on prepare or replay.
4. Evidence binds source/candidate/packet/output/runtime-proof/approval digests,
   exact session/turn, requested/observed Astra/xhigh/OpenAI/ChatGPT profile,
   runtime, read-only fresh context and confirmed termination. Effective provider
   execution stays null; assurance is explicitly native configuration.
5. Evidence expiry is no later than the original audit lifetime or runtime-proof
   expiry. Preparing again cannot extend the original review's validity.
6. Preparation returns unsigned evidence only. Signing keys, GitHub tokens and
   publisher capability do not enter the controller. Signed verification still
   requires trusted Ed25519 identity, all binding fields and current time.
7. Keep stop/deadline/cancel controls, failure sanitization, immutable replay and
   current enable/policy checks. Missing, stale, failed, revoked or inconsistent
   evidence yields no acceptance evidence or publication.
8. Public review/check text names the assurance limitation. No changes to merge
   readiness, human vetoes, required checks, protections or publisher identity.

## Proof and closure

Use behavioral red-green for opt-in preparation, missing/invalid runtime proof,
failed review, stale/revoked/replayed evidence, signed provenance validation and
publisher disclosure. Run GitHub and affected agent-hosts suites, prescribed
registry checks and scoped debt scan. Fresh read-only GPT-6 Astra/xhigh formal
review must cover Standards, Spec and Proof before local acceptance. Record
exact snapshots and preserve the already accepted process slice. Live runtime,
importer, signer/publisher and server/canary activation remain separate gates.

## Implementation checkpoint

Behavioral red/green: opt-in audit/preparation, public assurance disclosure, and
revocation during the final runtime read. Boundary and regression coverage adds
missing owner approval, legacy audit-only policy, runtime/source/proof mismatch,
required check failure, stale/future/extended runtime validity, failed review,
replay expiry, cancellation, and signed-provenance rejection. Current GitHub suite
passes 129 tests. Full registry/scoped debt and independent review follow.

Scanner configuration correction: the installed scanner treats ignore strings as
regular expressions, so the default `.git` also excluded the `github` directory.
Zero-selected-file runs were discarded. A private scan config anchors the same
Git/dependency/generated-directory exclusions to path segments; the corrected
scan includes all 12 changed JS/TS/test files and reports zero findings.

Package tests create reproducible dist/node_modules directories. The catalog
hygiene gate requires them absent. Move only these task-generated directories to
private test-runtime storage for root hygiene/package verification, restore them
for independent test reruns, then retain them outside the catalog at closure.
No source or ignore rule is deleted or weakened.

Independent review identified one P2: maximum valid finding output could prepare
successfully but exceed the verifier's base64url-character cap. ASCII and multibyte
preparation/signature round trips reproduced the failure. Both boundaries now
share a 192 KiB decoded JSON limit, with encoding expansion accounted for, and
explicit oversized signed rejection. No finding truncation. A fresh independent
review of the corrected snapshot is required; the original verdict is revise.

Horizontal decision: the existing controller retains authority loading, replay,
locking, cancellation and deadlines; the existing protected reader and proof-check
validator are reused. Native provenance has one shared validator for preparation
and signed verification. No parallel publisher, journal, scheduler or merge gate.
