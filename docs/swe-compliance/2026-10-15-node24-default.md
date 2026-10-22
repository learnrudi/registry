# Default Node 24 and paired fresh-install verification

## Phase 0: Baseline and standards

- User authorized the default runtime update, fresh-install checks on both Macs,
  and local commits for this change plus the preceding CLI cleanup/fixes.
- Registry baseline: bb257decedf7f2313ccbc9ab6c9daad43ac12c1a. Canonical checkout
  contains unrelated content-extractor edits and a mixed generated index on both
  peers. They remain untouched; use an isolated branch from the accepted base.
- An earlier runtime draft (04deb1a / bcab7af) already prepares Node 24.21.0 plus
  separate Wrangler binding/schema/CI work. Reuse only its default Node metadata;
  preserve that draft and its dependencies. This change does not accept Wrangler
  policy or supersede that draft's other work.
- Standards: Master Doctrine, Agent Co-Pilot, Horizontal Engineering,
  SWE checklist, independent RUDI code review, task-scoped commit workflow.
- Risk: high shared runtime default; user has authorized source/commit work,
  but no public release, merge, service restart or installed user upgrade.

## Phase 1: Scope and invariants

- Update runtime:node to pinned 24.21.0 for existing Darwin/Linux arm64/x64
  targets, using official URLs and SHA-256 checksums. Preserve mapped bins,
  extraction layout, runtime identity and versioned Node 20 package.
- Update the focused runtime contract test; regenerate index via indexes:sync.
  No handwritten index edits, new runtime ID, dependency migration or schema
  changes. Existing users must explicitly update; fresh users get the new
  default only after registry publication.
- Candidate index is served from host-local HTTP with RUDI_REGISTRY_URL; no
  local-catalog bypass. Public archive/npm downloads, actual packaged CLI,
  isolated HOME/RUDI_HOME/prefix/cache/PATH, Node runtime/shim/version assertions,
  TypeScript install/list/run/remove, native SQLite and disposable daemon proof.
- Commit slices: CLI cleanup/docs, CLI behavior/tests, CLI generated dist;
  registry catalog/test/docs, registry generated index. Local commits authorized;
  push, PR, merge, npm/registry publication remain separate.
- Peer reconciliation: transfer accepted Git history, preserve remote dirty work,
  and check out exact commits in isolated peer checkouts for verification.
- Horizontal disposition: standardize the existing default descriptor only;
  keep installer behavior in the previously reviewed shared CLI paths.

## Phase 2: Red test

- Change the existing shared-default expectation and add all four official
  URL/checksum/layout assertions while retaining the versioned Node 20 contract.
- Run npm test -- src/runtime-catalog-contract.test.ts before metadata changes;
  expected failure is 20.10.0 versus required 24.21.0.

## Phase 3: Implementation

- Updated the existing default descriptor to 24.21.0; all four hashes match
  https://nodejs.org/dist/v24.21.0/SHASUMS256.txt. Versioned Node 20 is unchanged.
  Regenerated the index with npm run indexes:sync; its sole package change is
  runtime:node (plus the normal deterministic generatedAt timestamp).

## Phase 4: Green

- The same focused command passed after the descriptor update (2 tests).
  Red failed specifically on 20.10.0 vs 24.21.0. No assertions were weakened; no
  runtime implementation refactor or new installation code was introduced.

## Phase 5: Verification

- Registry prescribed test/validate/index sync/check/hygiene/build/pack gates;
  focused SWE scan for changed test, independent review and both-host acceptance.
- Verify archive hashes against official Node SHASUMS; execute both Darwin
  downloads on their matching host. Linux descriptors are checksum-tested;
  no Linux/Windows execution claim.
- CLI's reviewed 878-test suites and unchanged bundle remain evidence for prior
  fixes; rerun only checks affected by new source/docs or discovered failures.

## Phase 6: Closure

- Registry npm test: 356/356 passed on each host; validate, indexes:check,
  catalog:clean:check, build, debt scan and pack dry run pass on each host.
  Focused SWE scan: 0 findings in the changed contract test.
- Fresh installs:52/52 assertions per host. Downloaded 24.21.0, managed PATH,
  npm/npx shims, native SQLite in-memory writes, daemon health/authenticated
  readiness/clean shutdown, idempotent init and npm inventory/remove all pass.
- Both independently generated indexes have SHA-256
  f6c60cb471294e2f430107d33aabbdfb20f18e32a9db7376c0f525ef9160e08f.
  CLI bundles match 8f7753e9ca2ed1f68359a91cc084bbd9a225c1394bed05480d01978e035ad702;
  tarballs match c8d372d2d6b031b6d68f1af95309096d17b35e6e361415af35871b26d3dde7c6.
- Evidence on each peer: `.rudi/outputs/node24-default-20261015/`; final reports
  fresh-primary-verified/report.json and fresh-admin-verified/report.json.
  Harness SHA-256 10919ef8bdc81730d25c18c294df09cfb52f9cfed21ecd5d6b6736bd81e9af39.
- Initial smoke assertions compared /var with /private/var as raw strings.
  Corrected the harness to compare real paths; the original failed reports are
  retained. This was not a runtime failure. Admin compiler determinism hit its
  existing 5000ms timeout during concurrent installation; unchanged isolated
  compiler tests and unchanged full 356-test rerun passed. No timeout increased.
- Four disposable test homes removed after verification; daemon children exited
  cleanly. No existing user runtime, service, auth or database was modified.
- Independent review and local commit IDs recorded in the final evidence/report.
  Commit slices are catalog/test/ledger, then generated index. CI-style index
  reproducibility uses SOURCE_DATE_EPOCH from committed index.generatedAt, so a
  later commit timestamp does not spuriously rewrite the generated artifact.
- Public registry/npm remain unchanged until separately authorized publication.
  An overlap with the earlier runtime draft must be reconciled before merging
  both branches. Owner: registry maintainer; trigger: publication; closing proof:
  one accepted default descriptor/index plus reviewed Wrangler policy.
- Linux/Windows execution, every installed stack, authenticated provider flows
  and production daemon activation remain outside this bounded acceptance.
- Worktree closeout receipts and peer commit reconciliation follow verification;
  preserve accepted source branches and all unrelated canonical changes.
