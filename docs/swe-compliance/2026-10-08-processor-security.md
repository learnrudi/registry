# Processor optional API security remediation — 2026-10-08

## Phase 0: Baseline and manual lookup

Scope: scan findings 4, 5, 18 in `catalog/stacks/rudi-processor`. High risk (authentication and filesystem boundary). Read repository AGENTS.md, SWE checklist, manual index, Appendix F identity/authentication/trust boundaries. Parent owns full repository gates and independent review.

Baseline: optional API trusted uploaded filenames, bound all interfaces, enabled wildcard credentialed CORS, had no authentication, trusted stored paths, and rendered metadata through HTML interpolation. Stdio manifest does not start this server.

## Phase 1: Scope lock

HTTP-only scope: authenticated API/WebSocket, same-origin UI, loopback entrypoint, configured inbox/index containment, opaque upload paths and DOM text rendering. Preserve stdio processors. Allowed changes: API, frontend, focused security tests and optional HTTP setup docs/dependencies. No live services, credentials, commit/push or synchronization authorized in this delegated task.

Invariants: deny API access without valid configured token; never use client filenames as storage paths; never traverse outside configured roots via API paths or metadata; untrusted metadata is text, never code/markup. HTTP configuration is operator-owned. Filesystem roots require local OS protection against hostile concurrent writers; API callers do not receive arbitrary filesystem mutation.

Planned slices (uncommitted): upload/download containment; auth/directory boundaries and UI integration; DOM injection fix. Horizontal scan: batch processor follows child symlinks, so HTTP directory route must validate every immediate child before scheduling. Do not broaden stdio behavior.

## Phases 2–4: Sequential red/green evidence

Completed sequentially; see recorded evidence below.

## Phase 5: Verification

Focused ASGI tests use FastAPI TestClient and mocked processor/provider boundary, real temp filesystem. Dependencies installed in isolated `/tmp/registry-processor-security-venv`. No model requests or live local service touched. Parent owns repo checks and fresh-context review.

## Phase 6: Closure

Scoped implementation complete; independent review and aggregate checks remain with parent. No commits or external publication.

### Recorded sequential proof

1. `/tmp/registry-processor-security-venv/bin/python -m unittest discover -s catalog/stacks/rudi-processor/tests -p test_api_security.py -v`: initial upload traversal regression **red**, real ASGI upload returned 200 and overwrote the temp victim. Filename rejection/exclusive opaque storage fix: same command **green**.
2. Added API/WebSocket authentication regression, same command **red** on unauthenticated stats 200 vs expected 401; mandatory bearer middleware plus authenticated pre-accept WebSocket and fail-closed configuration: **green**.
3. Added metadata/download/directory boundary regression, same command **red** on outside-root download exposing temp private contents; canonical configured-root checks and child symlink validation: **green**.
4. `node --test catalog/stacks/rudi-processor/tests/frontend-security.test.mjs`: hostile metadata regression **red** at the real `innerHTML` sink with filename markup and onclick path injection; DOM text nodes, whitelisted classes, event listener closure: **green**.
5. Same Node command with browser authentication case **red** because initial request occurred before connection; same-origin bearer-header helper, explicit connection, memory-only token, actual auth failures replacing demo fallback: **green**.
6. Refactor moved browser code to a fixed served JS file and moved optional HTTP tests into `tests/http/` (no package initializer, deliberately outside stdio unittest discovery). Browser fixture now initializes nodes from real HTML IDs. Final commands below passed.

### Final focused verification

- `/tmp/registry-processor-security-venv/bin/python -m unittest discover -s catalog/stacks/rudi-processor/tests/http -p test_api_security.py -v`: **5/5 pass**. Coverage includes all sensitive routes denying absent/wrong token; authenticated WebSocket echo; missing-token startup failure and 503 defense; UI public assets; upload traversal/absolute/backslash names; same-name opaque storage; planted file and upload-root symlinks; metadata symlinks; out-of-root original download; valid download; directory child escapes; malformed hash.
- `node --test catalog/stacks/rudi-processor/tests/frontend-security.test.mjs`: **2/2 pass**; shipped-script DOM injection prevention plus browser fetch authentication headers, relative API URLs, cleared input and no initial request.
- From stack directory: `/tmp/registry-processor-security-venv/bin/python /Users/hoff/.codex/worktrees/registry-security-remediation/registry/scripts/verify-python-stack.py`: **pass**, existing stdio error handling test (8 cases) and 4-tool MCP contract verified under isolated temporary HOME.
- `git diff --check -- catalog/stacks/rudi-processor`: **pass**.
- `swe_debt_scan` with `repo` this worktree, graph/scope `catalog/stacks/rudi-processor`, files/entrypoints `frontend/rudi_search.js` and `tests/frontend-security.test.mjs`, warning minimum: **0 errors, 0 warnings**. Initial orphan warning was resolved by declaring the actual HTML-loaded script as scan entrypoint (scanner cannot follow HTML or Python static routes).

### Closure and explicit gaps

Changed API, frontend HTML, new frontend JS, frontend/API security tests, optional HTTP requirements and README_FRONTEND. No stdio manifest or processors changed. README documents token setup, loopback binding, root boundaries, auth contract, programmatic-only WebSocket and optional tests.

High-risk trust boundary remains local single-operator: one bearer token authorizes all API actions. No multi-user authorization/TLS/reverse-proxy deployment was added. Configured directories must not be writable by hostile concurrent local processes; resolved containment is not a filesystem sandbox against symlink races by local writers. No real browser rendering/provider smoke performed; tests execute real ASGI and JS with provider/DOM fixtures. HTTP TestClient reports an upstream httpx deprecation warning; tests pass. Existing static metadata partition and prototype upload/file-click UI remain documented limitations. Packaging of HTML was flagged to parent (root package glob omitted HTML at baseline).

Independent review, full registry gates, worktree closeout and admin-Mac disposition are owned by parent; this scoped slice is ready for that review, not a claim that whole-task Definition of Done is satisfied. All slices remain uncommitted, no push/PR/merge/deploy performed.
