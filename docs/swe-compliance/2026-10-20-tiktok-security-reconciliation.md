# TikTok recovery and public-network security reconciliation

## Scope and invariants

Reconcile the unpublished caption recovery work from `bb257de` with accepted
Registry `e00ed1e`, in an isolated checkout. The October 10 compliance note is
historical evidence; its installation and live-provider results do not describe
this candidate. This task authorizes local preparation and tests only.

- Preserve the original dirty checkout and its staged, unstaged, untracked and
  ignored state. Do not install, publish, deploy, restart services or change data.
- Keep one TikTok parser shared by API, MCP, CLI and batch. Preserve supplied
  caption provenance, raw VTT, timed segments, coverage and truthful absence.
- Route every TikTok request through the accepted public-network transport.
  Retain public-address validation, DNS pinning, encoding rejection and bounded
  response reads. Raw global fetch is not an alternative transport.
- Validate HTTPS, approved TikTok/CDN hosts, credentials and ports before every
  hop; allow at most three redirects. A page or caption resource has one
  15-second deadline across redirects, with 5 MiB and 2 MiB limits respectively.
- Preserve accepted browser-fallback restrictions and all other accepted
  Registry changes. Generate the catalog index from manifests.

## Reconciliation

Recovered the preserved files and clean three-way merges, resolved the README
and index implementation conflicts, and retained the independent TikTok module
instead of restoring the accepted inline parser. Existing protected YouTube and
article calls remain in place.

The shared transport now supports explicit `redirect: "manual"`; its default
follow behavior is unchanged. Manual mode returns a response only after the
existing public-network checks and bounded read. TikTok then validates the next
location before the next protected request. Unknown redirect modes fail before
DNS. All four packaged copies remain byte-identical, with matching declarations
where present. This small shared change is required for package parity; it does
not enable browser execution or add dependencies.

Transport byte-limit errors retain the specific TikTok size-limit message.
Other transport errors remain sanitized so signed caption URLs are not exposed.

## Behavioral red-green evidence

Commands below run from `catalog/stacks/content-extractor`. Each failure was
observed before the corresponding implementation; assertions were retained.

| Behavior | Command | Red result | Green result |
| --- | --- | --- | --- |
| Reject a TikTok hostname resolving privately before connection | `./node_modules/.bin/tsx --test tests/tiktok-security.test.mjs` | Missing expected rejection; raw fetch succeeded | Protected resolver rejects before request |
| Return a manual redirect without following its target | `./node_modules/.bin/tsx --test tests/public-http.test.mjs` | Returned 200 instead of 302 | Returns 302 without resolving the target |
| Spend one deadline across redirects | `./node_modules/.bin/tsx --test tests/tiktok-security.test.mjs` | Second hop received 15000 ms instead of 5000 ms | Remaining budget passed to transport |
| Preserve size-limit diagnostics | `./node_modules/.bin/tsx --test tests/tiktok-security.test.mjs` | Generic network failure instead of caption size error | Specific size-limit error retained |

The fake clock's second hop was corrected to finish within the remaining
budget; the deadline assertions were unchanged. MCP mocks now intercept the
protected transport and explicitly reject raw global fetch. Supplemental tests
exercise off-domain redirects, mixed private DNS, dishonest content lengths,
compressed responses, expired deadlines, pinned addresses and actual timer
cancellation of a stalled response body.

Final package `npm test`: **67 passed, no failures or skips**.
Package `npm run build`: passed. The full suite also verifies MCP stdio evidence,
raw VTT and output replacement, batch metadata, accepted security behavior and
shared transport parity. These are fixture tests, not live TikTok verification.

## Debt and review

Scoped six-check debt scans cover every changed/new JS/TS file, with separate
scopes for shared transport copies. No errors. One existing large-file warning
remains in `tests/core.test.mjs` (accepted baseline 1038 newline-terminated lines;
candidate 1039; scanner reports 1040). This task adds a response-body fixture and
corrects one observed URL there; splitting unrelated platform tests is deferred.

The scanner uses TypeScript module resolution, which resolves the `.js` import
to the companion declaration rather than the runtime implementation. Explicit
runtime/declaration entrypoints account for that boundary; no source or scan
policy was changed to suppress it. Integration tests execute the real module.
The other three transport scopes have no findings.

## Registry verification and preservation

All required Registry gates passed: `npm run indexes:sync`, `npm run validate`,
`npm run indexes:check`, `npm run catalog:clean:check`, `npm run build` and
`npm pack --dry-run --json`.

The first `npm test` run had 372 passes, one skip and a compiler determinism
test timeout at the unchanged 5000 ms limit. `npm test -- --maxWorkers=2`
then passed all 373 enabled tests, with the one existing browser test skipped.
No test assertion, timeout, source configuration or dependency was changed for
that rerun. Package dependencies and build output created during this task were
moved outside the catalog before the hygiene and packaging checks.

The generated index changes only its generated timestamp and the content
extractor stack/skill versions. Original checkout HEAD, branch, Git index,
porcelain status, all 13 preserved file hashes/modes and the 1599-path ignored
inventory match the preservation snapshot. Ignored file contents were not
hashed by that snapshot. The five recorded installed package bindings also
match their previous hashes. All candidate changes remain unstaged/uncommitted
in the isolated checkout.

## Remaining boundaries

Supplied caption/video association still requires operator observation; neither
caption accuracy nor full-video coverage is proven. No live provider test,
installed-package test or service activation is claimed for this candidate.
Publication, peer adoption, installation and deployment remain separate work.

## Current-main integration verification

The isolated candidate was fast-forwarded to accepted Registry
`8fe7c01bc0386cb6b2a6663b592b2a88e2cd9fd7` after snapshotting all 23 candidate
files. The six upstream documentation files had no overlap with those files.
The current TikTok README now consistently describes one 15-second deadline
per page/caption acquisition across redirects; no runtime behavior was changed
in this integration step. Earlier behavior-level red/green evidence above
remains applicable, so no artificial failing test was added for this wording
correction.

On the combined tree, package `npm test` passed all 67 tests and package build
passed. Registry `npm test -- --maxWorkers=2` passed 373 tests with the existing
browser test skipped. All required validate, indexes:sync/check, hygiene, build
and pack dry-run gates passed. Shared transport copies remain byte-identical;
scoped documentation links and whitespace checks passed. The scoped debt scan
has no errors and the same pre-existing large core-test-file warning.

Both original primary checkouts were verified against their preserved HEAD,
branch, index, status, 13 source-file hashes/modes and ignored-path inventories
before this integration. They are not the integration targets. Independent
review of the exact combined candidate is recorded separately from this
implementation evidence; this record does not self-approve the candidate.

## PR preparation and coordination

The subsequent user instruction authorizes reconciliation, checks, commits,
branch push and a PR. Merge, installation and deployment remain separate.
The Admin chat had already prepared and independently reviewed the combined
candidate. PR preparation therefore continued from that exact 23-file snapshot
on accepted main `8fe7c01`, using a separate local feature worktree. All 23
SHA-256 hashes matched before this publication record was appended. No new
behavior was introduced during this handoff; the behavioral red/green evidence
above remains applicable.

The independent review returned Standards, Spec and Proof pass, with no
actionable candidate findings. Its own 28 focused checks passed, including the
real MCP stdio and saved-evidence boundary. It verified the complete candidate
and all 13 original Admin files in the preserved snapshot and pinned Git stash.
Admin's primary checkout was separately authorized to advance to clean main;
this supersedes earlier unchanged-primary observations. The unpublished Admin
candidate and RUDI Mac's dirty primary remain separate from this PR worktree.

Commit plan: (1) manual-redirect support, matching packaged copies and transport
tests; (2) the TikTok feature, caller tests, current documentation, version
metadata, generated index and compliance records. Both require passing affected
tests and a staged-diff audit. The shared transport copies are retained to honor
the existing independently packaged stack contract, with byte-parity tests as
the closing proof; changing the package distribution design is out of scope.

The reviewer also observed a pre-existing batch output-path limitation when an
ancestor directory contains a dot. It is unchanged from accepted main and is
outside this reconciliation. A separate fix should test explicit directory
creation beneath a dotted ancestor. No live TikTok/CDN or installed-package
acceptance is claimed. Existing local version 1.1.0 installs must be identified
by source hashes/provenance when a later installation is authorized.

Publication verification on Node 24.21.0 passed package `npm test` (67 tests),
package `npm run build`, Registry `npm test -- --maxWorkers=1` (373 passed,
one existing skip), `npm run validate`, `npm run indexes:sync`,
`npm run indexes:check`, `npm run catalog:clean:check`, `npm run build`,
`npm run release:verify` and `npm pack --dry-run --ignore-scripts --json`.
The generated index remained identical to the reviewed candidate. Four scoped
debt scans reported zero errors and only the documented existing core-test-file
size warning. Package verification dependencies/build output were retained
outside the publishable catalog. Implementation, tests, current guides and
metadata still match the reviewed hashes; only this publication record changed.

Final source verdict: ready for PR review within the stated limits. GitHub CI
is checked separately after publication. No installation or deployment
acceptance is inferred from these source checks.
