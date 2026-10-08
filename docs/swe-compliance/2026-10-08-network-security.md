# Network boundary remediation — 2026-10-08

## Phase 0: Baseline and manual lookup

Scope: findings 6 (social stored media SSRF), 8 (generic remote/base64 buffering),
17 (private-network content extraction); narrow content GitHub bearer-origin guard
added with parent authorization. Read root AGENTS, SWE compliance checklist and
manual index/Appendix F in preceding processor batch; trust-boundary rules apply.
High risk: network egress and credentials. Baseline fetch/axios followed arbitrary
redirects, did not pin DNS and buffered bodies before meaningful limits.

## Phase 1: Scope lock

Allowed: content-extractor, audio-tools, newsletter-extractor, social adapter
media downloads and new local security helpers, tests/docs. Do not alter social
job/domain/worker state owned by another agent. No commits, pushes, deployments,
live provider calls, credential reads or remote synchronization authorized.

Public transport invariants: HTTP(S) only; no URL/header credentials; no nonpublic
IP literals or any nonpublic DNS answer; vetted IP pinned to connection; Host/SNI
retained; no pooled unvetted socket; each redirect revalidated; five redirects;
total DNS/request/body deadline; byte cap enforced before accumulating each chunk;
encoded responses rejected. Provider-bearing requests remain a separate trust
boundary with explicitly scoped residuals. Configurable buffered-media budget
bounds each download but does not claim streaming uploads or concurrent quotas.

Horizontal disposition: **standardize contract**, portable duplicate helper copies
are necessary because independent stack installations cannot import sibling/root
sources. All four `public-http.js` files must remain byte-identical. Content's
repository parity test checks this; standalone package tests skip sibling comparison.
Owner: registry maintainers. Trigger: any change to one copy. Closing proof: update
all copies and run parity/transport tests. Do not extract a new runtime dependency
in this security change.

## Phases 2–4: Sequential red/green evidence

Commands below use the repository root unless noted.

- `./node_modules/.bin/tsx --test catalog/stacks/content-extractor/tests/public-http.test.mjs`:
  first URL literal/credential regression **red** (127.0.0.1 accepted), then URL
  boundary **green**. Next DNS/pin test **red** (new fetch factory absent), then
  checked DNS/native lookup implementation **green**. Next redirect test **red**
  (private redirect not rejected), manual per-hop vetting **green**. Next streamed
  cap case **red** (unbounded successful read), bounded streaming **green**.
- Timeout case initially stayed pending instead of honoring 10 ms and was stopped
  after 14 seconds; total deadline implementation then **green**, with a 1-second
  test harness guard. Timeout includes DNS and prevents a late DNS result from
  starting a request. Additional address-class/no-request and advertised-size/
  encoding cases expanded regression coverage.
- `./node_modules/.bin/tsx --test --test-name-pattern='never spawns' catalog/stacks/content-extractor/tests/core.test.mjs`:
  **red**, executable browser fixture ran and changed status to browser_unclassified;
  **green**, disabled unguarded browser process path, preserved original blocked
  status and recorded explicit unavailable reason. Existing old screenshot tests
  were replaced by the new explicitly authorized compatibility contract, not
  loosened to accept failure.
- `npm run build --prefix catalog/stacks/audio-tools` then
  `node --test catalog/stacks/audio-tools/tests/network-security.test.mjs`:
  base64 test **red** (oversized value decoded), then **green** with trusted byte
  budget checked before Buffer.from; spy proves no oversized decode allocation.
- `node --test catalog/stacks/social-media-publisher/test/adapters/media-download-security.test.js`:
  **red**, real adapter download function accepted private URL through mocked axios;
  **green**, all three adapters use the public helper. Expanded test proves private
  DNS causes zero transport calls in each adapter and verifies individual budgets.
- `./node_modules/.bin/tsx --test catalog/stacks/content-extractor/tests/github-security.test.mjs`:
  fake-token gist test **red**, provider-returned arbitrary raw URL fetched with
  bearer; **green**, API token limited to exact api.github.com with redirects refused,
  raw text restricted to GitHub raw/gist origins through credential-free public HTTP.

## Phase 5: Verification

In progress. Fixtures isolate DNS/HTTP/provider calls. Initial build attempts lacked
stack dependencies; `npm ci --ignore-scripts --no-audit --no-fund` installed declared
lockfiles for content/audio/newsletter (no dependency or lockfile changes).

One preexisting social thumbnail test mocked axios only, so after transport migration
it unexpectedly requested public `https://example.com/thumbnail.jpg` and got 404.
No live credential/provider call occurred; provider methods remained mocked. The
fixture now mocks the public HTTP boundary and asserts URL plus thumbnail budget.
This accidental fixture request is disclosed rather than counted as an approved
live smoke. Focused corrected adapter tests pass.

## Phase 6: Closure

Pending independent review and final checks. No commits/publication. Known residuals:
fixed-origin provider response readers and `youtube-transcript` library remain
outside public helper bounds; yt-dlp's allowlisted platform path is not a full
egress sandbox; upstream MCP parser may allocate incoming base64 text before the
new predecode check; byte caps are per download, not process-wide concurrency
quotas. Browser generic screenshot fallback is explicitly disabled. Social video
limits are now lower by default (64 MiB, operator-configurable through 512 MiB).

### Final focused results

- Content: `npm test && npm run build` in `catalog/stacks/content-extractor` —
  **46/46 tests pass**, TypeScript build passes, helper parity actually compared all
  four copies (no skip). Includes two fake-token content GitHub tests.
- Audio: `npm test` in `catalog/stacks/audio-tools` — build and **10/10 tests pass**.
- Newsletter: `npm test && npm run verify` in `catalog/stacks/newsletter-extractor` —
  **2/2 tests pass**, build passes and **3-tool MCP surface verified** in isolated
  generic verifier. Importing the module no longer automatically starts stdio;
  executing the entrypoint still does, proven by that verifier.
- Social: `npm test && npm run build` in `catalog/stacks/social-media-publisher` —
  **72 passed, 0 failed, 3 skipped** (database publication-state integration tests
  belong to the parallel social-state slice); TypeScript build passes. Includes
  three adapter download-security tests and corrected thumbnail-provider mock.
- `git diff --check` on all task-owned network paths — passes.
- Four `swe_debt_scan` runs, scoped separately to edited files in each stack —
  **0 errors, 0 warnings**. Runtime `src/public-http.js` supplied as an explicit
  entrypoint in TS packages because the scan resolves its adjacent `.d.ts` and
  otherwise falsely flags the executed JS as orphaned. Social adapter tests live
  under the existing `test/adapters` layer, resolving the initial test/security
  import-boundary violations without weakening policy.

### Review handoff and changed contracts

Implementation and scoped tests are complete, ready for independent review. Root
agent owns full registry gates/index generation, aggregate review, high-risk
acceptance, worktree receipt and admin-Mac synchronization disposition. No whole-task
completion claim is made here. Planned slices remain uncommitted; no push/PR/merge,
deployment or service restart occurred.

Changed source: each stack's local HTTP helper; content URL policy, index/link/GitHub
fetching and batch fallback; audio direct download/base64 boundary; RSS fetch function
and import-safe entrypoint; Twitter/LinkedIn/YouTube media-download calls. Added
focused network/provider/adapter tests, per-stack JS declarations and JS emit config
where needed. No additional runtime dependency was introduced. README updates name
public-only behavior, streamed budgets/timeouts, trusted process cap configuration,
browser fallback disable and explicitly excluded provider/library transports.

Remaining policy obligations: owner registry maintainers; triggers are any future
provider transport rewrite, yt-dlp upgrade/integration, public screenshot re-enable,
or larger-video support request. Closing proof requires bounded/pinned provider
transport tests, isolated browser egress proof, or file-streaming provider uploads
rather than silently broadening these guarantees. Root agent must keep findings
8/17 qualified for the stated residual surfaces instead of calling all outbound
networking fully sandboxed.
