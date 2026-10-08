# State and account security remediation — 2026-10-08

Scope: scan findings #13, #16, #21, #22 only. No provider requests, real tokens, deployment, commits, or remote state were used. Local PostgreSQL instances use temporary directories, Unix sockets, and no TCP listener.

## Changes and invariants

- **#13:** The target's queued → publishing transition is one conditional PostgreSQL UPDATE, scoped by organization, post and target. Only its winner inserts an attempt. Different caller job keys cannot authorize two simultaneous attempts. The worker passes a stable organization/target publication key to adapters across jobs. Failed acquisition or persistence does not blindly overwrite another worker's target state. Already publishing/published targets no longer count as newly publishable work.
- **#22:** Dry-run enqueue does not queue targets or update the post. The worker validates targets without loading tokens, creating attempts, fabricating provider IDs or entering real publication transitions. It stores preview results only in job metadata. Preview and publication job keys have separate post-scoped namespaces, so a preview cannot consume a real request's key. Failed previews likewise only change job state.
- **#21:** All Plaid item and cursor mutations acquire an exclusive interprocess lock before reading the store and hold it through validation and atomic replacement. Temporary paths are UUID-based and exclusively created. The lock's parent directory is canonicalized so directory aliases share the same lock. Lock acquisition times out after 10 seconds and never steals a possibly active writer's lock.
- **#16:** Explicit and current-account overrides use the existing strict email normalizer. Runtime token selection requires a real account directory and regular, non-symlink, single-link file contained under that account. Stored token identity, when present, must match. The runtime inventory uses the same checks; account-local OAuth credentials also reject redirected files. Legacy isolated token files without an identity field remain supported, preserving existing account inventory.

## Red → green evidence

Commands below run from the corresponding stack directory.

1. Plaid: `node --import tsx --test tests/tokens.test.ts` initially failed with ENOENT on competing PID-named temp-file renames. The unchanged test passes after locking: concurrent local saves/cursor updates plus three IPC-coordinated child writers preserve all 37 item records and the cursor; no lock/temp files remain.
2. Google Workspace: `node --import tsx --test account-boundary.test.cjs` initially failed “Missing expected exception” for traversal account overrides. It now passes normalized legitimate addresses and rejects traversal/current-account overrides. Additional coverage verifies inventory membership, directory/file symlinks, stored identity mismatch, credential-file symlinks, and compatibility with existing legacy tokens.
3. Social target race: `PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH node --import tsx --test test/domain/publication-state.test.js` initially failed **2 attempts vs 1** after coordinating both old target reads. It passes against actual PostgreSQL after the atomic claim. An end-to-end worker test runs distinct caller jobs concurrently, substitutes a fake provider adapter, and verifies exactly one provider invocation, one attempt, the immutable target key, and rejection of republishing the successful post.
4. Social preview: the same integration file initially observed a changed post (`draft` → `failed`, after the new attempt guard rejected the old preview path). After separating preview execution, it proves byte-equivalent database post/target rows before and after the complete queued preview, zero attempts, and a successful subsequent real enqueue using the same caller key.

## Verification

- Plaid: `npm test` — 3/3 passed; `npm run build` passed.
- Social publisher: PostgreSQL 17 on PATH, `npm test` — 72/72 passed, none skipped; `npm run build` passed. Focused integration rerun after test-adapter cleanup — 3/3 passed.
- Google Workspace: `npm run build`, `test:auth`, `test:account-boundary`, `test:drive`, `test:calendar`, `test:gmail`, `test:gmail-discovery`, `test:slides`, `test:tasks`, `test:state`, `test:gmail-signature` — all passed.
- Focused `swe_debt_scan` calls: each stack is the repo root; graph_root/scope are `.`, files are precisely the changed implementation/test files, and entrypoints are the stack's MCP/auth/API/worker/CLI entrypoints. All three final scans report 0 errors, 0 warnings, 0 informational findings. A test-to-adapter boundary finding was resolved by providing a self-contained fake provider through the worker's adapter-resolver option. Initial registry-root scans reported zero selected files and were discarded as invalid coverage.

## Operational limits and deferred work

- These are source fixes only. Historical dry-run records already marked published are not rewritten automatically; they require explicit review before any reset that could cause publication.
- Adapter/provider support determines whether a stable key deduplicates an ambiguous remote success across a later explicit retry. The atomic database claim proves concurrent local exclusion; it is not a claim of universal exactly-once provider delivery. A worker interrupted while publishing requires reconciliation; this change does not add automatic lease stealing.
- A crashed Plaid writer leaves its lock file. Recovery deliberately requires stopping all Plaid writers and removing the lock after inspecting the store; automatic age-based removal would permit stale writers to corrupt state.
- Legacy Google tokens lacking an account identity cannot be independently identity-verified without provider access; they remain supported only inside isolated account storage. Concurrent hostile filesystem mutation and account-root compromise are outside this local account-selector fix.
- Social integration tests need PostgreSQL >=15 binaries (`initdb`, `pg_ctl`) on PATH and a non-root user. They explicitly skip when a compatible initdb is unavailable. This workstation's default PostgreSQL 14 cannot parse the existing migration's column-specific SET NULL syntax; PostgreSQL 17 was used for all recorded green integration runs.
- Parent task owns repository-wide gates, generated indexes, publication, admin-Mac coordination and remaining findings.
