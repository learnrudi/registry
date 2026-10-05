# Native reviewer process connection

## Phase 0: Baseline and manual lookup

- Outcome: replace the native review RPC's host-termination placeholder with an internal, finite, tested POSIX process/stdio connection. Real native execution and publisher activation remain separate integration gates.
- Risk: high; native process lifetime, inherited environment, private output, cancellation and shutdown cross trust boundaries.
- Baseline: existing reviewer work is uncommitted in its attributable worktree. Preserve it. No source publication, credential creation, deployment, service activation or acceptance-policy change authorized by this slice.
- Relevant standards: SWE manual index; Appendix F trust/identity boundaries; Appendix G9 lifecycle and G11 resources; Agent Co-Pilot red-green requirements. Existing package instructions require root verification and scoped debt scan.
- Inspected consumers: `src/codex-review.js`, `src/codex-review-rpc.js`; existing `src/process-executor.js`; native review and process executor tests.

## Phase 1: Scope lock and impact map

All paths below are relative to `catalog/stacks/agent-hosts/` unless stated otherwise.

| Path | Action / evidence | Purpose |
|---|---|---|
| `src/codex-review-process.js` | Add / confirmed | Internal bounded POSIX child connection composing existing RPC |
| `test/codex-review-process.test.js` | Add / confirmed | Real synthetic child/group, stop, bounds, cancellation and failure tests |
| `NATIVE-REVIEW.md` | Modify / confirmed | Host primitive contract and limits |
| `src/codex-review-rpc.js` | Inspect / conditional narrow correction only | Existing protocol adapter, termination consumer |
| `src/process-executor.js` | Inspect only | Reuse minimal environment function; existing V0 remains unchanged |
| repository `index.json` | Regenerate / confirmed | `npm run indexes:sync` |

- Only trusted host bootstrap supplies executable, argv, cwd and child environment. None of these comes from a review packet/model. No new MCP method, public tool, scheduler, privileged launcher, service or network listener.
- Native hosts still own agent execution. This primitive only owns one child launched for one connection and its POSIX process group, with a finite deadline and no retries/restarts.
- Config must be validated and snapshotted before spawn; absolute command/cwd, bounded argv, bounded output and timeout, minimal environment. An already-aborted signal launches nothing.
- Compose the existing RPC. Keep selected-model observation and all controller acceptance holds unchanged. This primitive cannot certify source origin, model identity, OS custody or publisher authorization.
- Stop must be idempotent and bounded, signal the owned group even when the leader exited, escalate to KILL after a bounded grace, and return confirmed only when the child has closed and the process group is demonstrably absent. Permission/unexpected signal errors are uncertainty, never absence.
- Handle startup failure, EOF/leader exit, hung descendants/inherited pipes, stdout/stderr overflow, timeout, cancellation and late stream errors. Sanitize errors and never log private output.
- Group absence does not establish absence of descendants that created a new session/group. Actual host confinement, protected runtime, cross-UID lifecycle, endpoint restrictions and OS process-escape controls remain deployment gates. Do not present this helper as a security sandbox.
- Horizontal disposition: minimal-environment responsibility is reused. Existing V0 one-shot executor and new streaming native connection have different completion contracts. Preserve V0; record a bounded follow-up to investigate consolidation before extending lifecycle semantics to another consumer. No third implementation added.
- Commit slice: one coherent process-connection + proof/docs + generated index slice after review. Committing/pushing/deploying remain unauthorized; preserve local work.

## Phase 2: Red tests

- First reproduce the current leader-only termination behavior with a real synthetic descendant that continues after the leader closes. A reported true shutdown must not permit its delayed marker write.
- Add subsequent behavior tests one at a time for leader-exit inherited pipes, deadline, bounds, cancellation, start failure and uncertainty as implementation proceeds.
- Tests never invoke authenticated Codex, inference, GitHub or publisher credentials. Test processes and temporary paths belong exclusively to this run.

## Phases 3–4: Implementation and green/refactor

- Implement only the bounded connection contract. Reuse RPC and environment helper; no dependency changes.
- Rerun each red unchanged; then affected native-host tests. Keep failure causes and recorded output outside Git in the private task evidence directory.

## Phase 5: Verification

- Focused real-process tests and full agent-hosts suite; existing GitHub/controller source unchanged.
- Registry test, validate, indexes sync/check, catalog hygiene, build, package dry run.
- Scoped JS debt scan on new code and tests; resolve errors/new in-scope warnings.
- Fresh read-only GPT-6 Astra/xhigh formal review with no history fork; separate Standards/Spec/Proof verdicts. Correct findings with targeted red/green evidence.
- Actual protected worker invocation and remote deployment are not proven by local same-UID synthetic processes.

## Phase 6: Closure

- Preserve baseline fingerprints and final proof inventory, exact revisions, review receipt and Repo Steward retained closeout.
- Report local library acceptance separately from protected worker installation, publisher connection, model-execution assurance, server policies/canaries and full goal completion.
- Do not rerun the completed one-time admin folder setup.

## Verification checkpoint

- Behavioral red artifacts cover descendant leakage, leader-exit inherited pipes,
  deadline, configuration/start failures, cancellation, output overflow, graceful
  shutdown, uncertain-stop handle leakage, and live-child EOF. Each closing
  assertion passes in the final process suite.
- Initial checkpoint: 16 process tests and 78 agent-hosts tests passed. Registry:
  356 tests in 33 files passing. All required validation, generated-index,
  catalog hygiene, build and package dry-run commands pass.
- Scoped debt scan includes both new JS files: zero errors/warnings/info. An
  earlier root-profile invocation reported zero selected files and is excluded
  from proof; the package-root scan is the applicable result.
- Synthetic subprocesses exercise the real OS process/stdio boundary. Denied
  signals are fault-injected only for the exact fixture-owned process group.
  The denied-stop caller exits within its bound while reporting false; test
  cleanup separately kills its known fixture child.
- Environment proof permits the macOS runtime's encoding metadata and the
  established helper's NO_COLOR default, while rejecting API keys and Node
  runtime injection. No provider credentials or authenticated inference used.
- Horizontal follow-up owner: agent-hosts maintainer; trigger: any proposed
  third lifecycle consumer or change to the V0 executor's completion semantics.
  Closing proof: contract comparison plus the existing V0 and native lifecycle
  suites showing equivalent applicable behaviors before shared code extraction.

## Independent review repair

- The first independent formal review returned revise: P1 automatic uncertain
  drain cleared the connection deadline without settling pending RPCs; P2 live
  getters could substitute values between validation and snapshot creation.
- Both were reproduced as failing behavioral regression tests. The connection
  deadline now remains active during automatic cleanup; uncertain drain fails
  the RPC explicitly. Configuration and nested containers reject accessors and
  validate a stable data snapshot. Two nested-accessor tests extend that proof.
- Final targeted/full verification and a fresh independent review are required
  for the corrected snapshot; the first review does not authorize acceptance.

Status: corrections implemented; final verification and fresh formal review
pending. No activation, source publication or runtime acceptance.
