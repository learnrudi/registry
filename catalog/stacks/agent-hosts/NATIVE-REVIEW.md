# Native review protocol observation

`src/codex-review.js` implements one bounded private-source audit using the
observed Codex CLI 0.160.1 app-server protocol and exact GPT-6 Astra/xhigh.
`src/codex-review-rpc.js` adapts a dedicated native host stdio channel. Neither
module launches or schedules agents or changes the synthetic-only V0 gateway.
They are internal library entrypoints, not additional MCP methods.

Use `observeCodexReview(connection, request, { signal })`. The request contains
`contentClass: private_repository`, exact packet bytes and their SHA-256,
trusted empty `cwd`, and `timeoutMs` (100–900000). The native host supplies
`request`, `notify`, `onNotification` and `stop`; the RPC helper implements the
first three from readable/writable streams and a trusted `terminate` callback.
The callback must drain the actual process group and report
`terminationConfirmed`; socket close alone is insufficient. Host bootstrap and
OS isolation are deployment responsibilities, not assertions proven by this
library. Do not connect a shared desktop session, invoke with inherited private
customizations, or expose this internal API as an author-callable gateway.

Only ChatGPT account authentication and the openai provider are accepted; no API
key fallback or alternate model route exists. Native configuration observations
are distinct from effective provider execution evidence. All successful results
have `effectiveExecution: null` and `acceptanceEligible: false`. They can support
audit; raw observations cannot be signed for acceptance or published. The GitHub
controller's separately approved preparation contract can combine a validated
audit with protected policy and independent runtime/source proof into unsigned
native-configuration evidence. It never turns this observation into provider
attestation. Missing configuration fields,
unknown versions, reroutes, tool activity, malformed streams, deadlines and
unconfirmed termination reject. A future protocol needs its own reviewed support.

Codex 0.160.1 emits one asynchronous initial `account/updated` after workspace
routing discovery. Before starting a thread, the observer waits for that notice
when account/read includes routing, requires ChatGPT authentication and a matching
plan, closes startup notification admission, then confirms the complete account
and routing snapshot with a second account/read. Account identity stays in memory
and is never returned. Missing or duplicate notices, malformed routing, changed
snapshots, and all account updates during confirmation, review or drain reject.
The existing deadline and cancellation cover this handshake. No-routing sessions
still require a stable second account read and cannot admit a startup notice.

The integration contract, proof/source importer requirements, custody gates and
recovery procedure are in the GitHub stack's `REVIEWER.md`. Focused tests are
`node --test test/codex-review*.test.js`; full package regression is `npm test`.
Synthetic stream fixtures prove protocol logic, not provider execution or custody.

## Host process connection

`createCodexReviewProcess(configuration, { signal })` from
`src/codex-review-process.js` supplies a dedicated finite POSIX stdio connection
to `observeCodexReview`. Only trusted host bootstrap supplies this configuration:
absolute `command` and `workingDirectory`, bounded string `arguments`, explicit
`environment`, `timeoutMs` (100–900000), and `maxStdoutBytes` (1024–8388608).
Configuration must never come from the review packet or model. No shell is used;
configuration/environment records and argument arrays must contain data values,
not accessors. A stable data snapshot is validated before use.
The existing minimal environment allowlist applies, with no inherited provider
keys or arbitrary environment. This is an internal primitive, not an MCP method,
scheduler, privileged launcher or change to the synthetic-only V0 gateway.

The connection rejects cancelled startup, bounds the entire connection lifetime,
counts stdout before forwarding it, and discards stderr with a 256 KiB limit.
Startup/stream failures and overflow produce static errors without command,
argument, environment or output contents. Termination begins on cancellation,
deadline, EOF or leader exit. Idempotent stop signals the owned process group
with TERM, allows 150 ms grace, then escalates to KILL. Its 1200 ms total shutdown
budget is within the observer's 2000 ms stop budget. A positive result requires
both child close and a demonstrably absent process group; permission errors or
other signal failures leave termination unconfirmed. An unconfirmed result
releases this caller's pipes and process handle, never claims the child died,
and cannot support a successful native observation.
Automatic cleanup keeps the connection deadline active until drain finishes;
an uncertain drain also fails the RPC even if destroyed pipes never emit EOF.

Real synthetic child-process tests cover descendants, inherited pipes, EOF,
timeouts, cancellation, graceful/forced shutdown, denied signals, startup errors,
output limits, environment filtering and composition with the observer. They
do not invoke authenticated Codex or prove protected-worker installation. A
descendant that creates another session/group is outside this primitive's
termination guarantee. Protected executable/configuration custody, cross-UID
operation, OS confinement and escape prevention remain deployment gates. This
helper is not a security sandbox; all native acceptance holds above remain.


## Protected supervisor connection

`codex-review-supervised.js` accepts inherited worker stdio plus a separate
root-supervisor control channel. `stop` waits for exactly one bounded confirmation
and complete control-channel EOF; worker output or EOF never proves process death.
The GitHub [finite deployment](../github/deploy/README.md) owns the process and
account boundary. The existing process adapter remains available for its prior
trusted-host contract and is not substituted for the privileged pilot supervisor.
