# Finite protected reviewer pilot

This is an opt-in macOS integration for one documentation PR. Nothing installs
or activates it through the MCP stack. It creates no daemon, scheduler, sudoers
rule, merge path or recurring model work. Source publication is separate from
host installation, credential provisioning and live acceptance.

## Execution and authority

`reviewer_host.py` is a root-owned one-shot supervisor. `pilot-entry.mjs` runs
under a distinct, non-administrative publisher UID. The native Codex process
runs under a third UID, with a clean environment, empty protected working
directory, protected configuration, and a dedicated ChatGPT subscription login.
The author is a separate identity. Root and administrators with interactive
privilege remain trusted; this is not isolation from a malicious administrator.

The worker can read its own authentication but cannot reach publisher keys,
policy, authority records or the publication journal. The macOS sandbox denies
fork, execution of other binaries, local service sockets and general Mach IPC.
Writes are limited to scratch/state/log, `tmp` and `installation_id`. The last
two are required by Codex 0.151.0 and grant no configuration authority. Plugins,
remote plugins, tools, hooks, delegation, skill search and dependency install are
disabled. Root ownership prevents adding ambient configurations or skills. The
CLI logs a denied attempt to install bundled skills; unauthenticated protocol
probes confirm initialization and an instruction-free ephemeral thread still
succeed. An unexpected protocol warning or tool event rejects acceptance.

Codex changes the non-secret `installation_id` UUID to mode `0644` during
startup. Verification permits read access while still requiring the worker
owner, protected ancestry, no group/world writes, a single regular file and
valid UUID bytes. It does not rewrite the file or change credential permissions.

The worker's outbound TCP 443 and DNS support the native provider connection;
this is not destination-pinned egress. No repository program executes in that
process. The static document proof runs separately, without credentials or
network access. Root alone holds the stop-control socket and confirms process
group death before the controller can complete an audit. Unknown termination or
partial writes preserve locks and remain held. Startup admission and the owner
stop control use the host process classifier: unknown worker processes and live
Reviewer publisher runtimes block. Only the exact system `distnoted`, `cfprefsd`
and Contacts `contactsd` helpers may be ignored after kernel path lookup, PID 1
parentage, protected root ancestry and Apple signature verification. A second
PID/start-time/path inventory rejects churn or uncertain process identity. This
does not permit repository subprocesses or require terminating macOS services.

`reviewer-source.ts` independently reads pinned GitHub commit/tree/blob objects,
verifies their Git SHA-1 bytes, traverses every changed subtree, and rechecks the
selected PR before and after import. The base must be the merge base. Both PR
sides must be in the selected repository. Exact allowed changed paths must be
regular, non-executable UTF-8 `.md`, `.json` or `.txt` files. Limits are 100 files,
128 KiB per blob, 350 KB total decoded before/after bytes, 384 KiB source JSON,
256 HTTP reads and 120 seconds. Renames can be conservatively rejected when
GitHub's changed-file count differs from the path diff. General code PRs, forks,
submodules, symlinks, incomplete/truncated responses and stale revisions reject.

The trusted document proof checks Git blob integrity, JSON syntax without
ambiguous duplicate keys, and trailing whitespace. It is not a general test
runner. The approved contract must provide all specification and contextual
requirements; the source packet contains the complete changed files only.

The controller keeps the raw audit held. The separate signer accepts only its
prepared schema-2 evidence after current policy checks and stores an immutable
signed handoff. The publisher verifies it and all existing veto/current-state
rules. Assurance is **native session configuration**, with
`effectiveExecution: null`; no component claims effective provider attestation.
No operation grants merge permission. Publication and current acceptance require
GitHub to report `auto_merge: null`; enabled or missing auto-merge state blocks.
This is rechecked before every publication mutation, including after credential
refresh. Historical reconciliation remains read-only. These checks cannot make
separate GitHub reads and writes atomic or prevent later owner changes.
Prior green GitHub checks are not revoked
by stopping this host; external merge freezes and server enforcement are separate.

## Package and installation

1. Use an accepted Git commit in an isolated checkout. Install locked package
   dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, then run the
   GitHub package build/tests, native tests and Python host tests. Build from the
   exact commit; preserve generated files outside the public catalog afterward.
2. Run `python3 -I -B catalog/stacks/github/deploy/reviewer_host.py build
   --repository <accepted-checkout> --output <new-private-package-directory>`.
   The builder rejects uncommitted selected sources and emits a bounded package
   plus SHA-256 manifest. The operator must approve the exact manifest digest,
   bootstrap digest and local Node/Codex binary digests. The manifest identifies
   source and produced bytes; it is not a compiler attestation.
3. Prepare a host-specific owner runbook. Resolve existing account UIDs and
   root-controlled directories; inspect ACLs and preserve existing state. Place
   the reviewed bootstrap under protected root ownership and independently
   compare its hash **before** executing it as root. Do not run root Python from
   an author-writable script. Use the root-owned Command Line Tools Python.
4. `install` requires explicit root/package/digest/runtime/account arguments. It
   never overwrites a release, configuration or existing installation. It copies
   only approved bytes, checks protected runtime library dependencies, creates
   the inactive layout, and writes the installation descriptor last. A partial
   install requires owner investigation. `verify --root <root>` rechecks hashes,
   ownership/ACLs, account identities, empty cwd and exact CLI 0.151.0. Every
   operational command except emergency `disable` performs the same verification.
5. The owner runs `keygen`, interactive `login`, and `provision-app-key` against
   the protected installation. Login uses only the worker's fresh login home;
   it never imports another account's auth. Provision the App key through an
   already-private publisher-owned file. Never put credentials in chat, command
   arguments, history, Git or a source package. Token refresh failure holds the
   finite pilot; this design is not a long-running subscription credential store.

The host-specific runbook contains resolved commands and hashes, not these
portable placeholders. Installation and owner authentication are separate gates.

## One selected pilot

`configure` accepts a digest-approved private JSON policy, valid for at most one
hour, with one repository/PR/base/head/path allowlist, exact App/install/account
and bot IDs, three independent host IDs, approved contract and owner acceptance
text. Both enable flags are explicit; `mergeAuthorized` must be false. The
schema is validated by `validate_pilot`; policy creation is exclusive.

`run` acquires an exclusive root lock, imports source, verifies actual cross-UID
key/config access, tests kernel confinement and credential-free proof, persists
root receipts and immutable authority inputs, then supervises exactly one native
review. With publication disabled it records audit only. With publication enabled
it attempts separate sign and publish after the passing audit and live gates.
No failed or uncertain operation is automatically replayed. Missing keys/login,
revocation, stale policy/head/base, failed proof or veto fail closed.

`inspect` reads current GitHub acceptance. `reconcile` is GET-only and can inspect
an uncertain historical operation while disabled; a completed historical record
is not current approval. `disable` writes the protected revocation marker. An
active audit polls revocation and cancellation; confirmation still requires
process drain. Emergency disable validates only protected root/policy custody,
so damaged runtime state cannot prevent revocation. Catchable TERM/HUP/INT signals
latch cancellation; the bounded owner loops unwind after recording child ownership
and drain all owned groups. Repeated signals cannot interrupt cleanup. SIGKILL,
suspension or host loss requires explicit owner recovery and never proves drain. Disabling does not withdraw earlier GitHub checks or reviews.

Recovery is owner-only: disable, ensure any external merge freeze, prove all
worker/publisher processes and triggers stopped, preserve receipts, quarantine
only the exact orphan lock under exclusive control, then GET-only reconcile.
Do not delete uncertain records, evict a lock by time, edit evidence, refresh an
old acceptance or choose a new ID to avoid reconciliation. Preserve the inactive
marker and private evidence until separately accepted live rollout proves source,
identity, publication, veto/staleness, stop/drain and recovery on a real PR.

## Verification limits

Worker startup acknowledges the explicitly selected experimental
`skip_host_skill_discovery` feature through the runtime's
`suppress_unstable_features_warning` setting. The native observer still rejects
unexpected warnings. The network-enabled profile permits only the system DNS
socket `/private/var/run/mDNSResponder` in addition to its existing HTTPS/DNS
egress; arbitrary local sockets remain denied. Credential-free proof profiles
retain network denial.

On macOS, run `RUDI_REVIEWER_TEST_CODEX=/absolute/path/to/trusted/codex
python3 -B tests/reviewer_native_startup_test.py` with CLI 0.151.0 and the actual
Python interpreter executable (not a launcher that execs another binary). This
opt-in test uses a fresh empty credential home, checks session configuration and
warning-free startup, and checks real DNS plus denial of other local sockets,
fork and other exec. It never sends `turn/start` or repository source. Host DNS
must work; these probes are not authenticated inference or deployment evidence.

Existing installations need separately reviewed owner migration of their
hash-bound config/profile/installation descriptor and code. Source correction
alone does not update them. Preserve failed requests, locks and receipts;
do not rerun installation or remove the disabled marker to retry.

Tests cover library boundaries, immutable handoff, malformed/oversized/deadline
RPC, real local process drain and macOS fork/exec/write denial. An unauthenticated
admin-peer CLI probe covers initialize/account read/thread configuration only.
Root installation, actual protected accounts/ACLs, owner login, App provisioning,
authenticated inference and real GitHub publication still require the controlled
live pilot. Fixture success cannot close these gates.

References: [Git trees and modes](https://docs.github.com/en/rest/git/trees),
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).
