# Microsoft 365 Outlook v1 implementation evidence

Date: 2026-10-21. Source baseline: registry `32f58f6`. This is a generic
engineering record; account configuration, credentials, live mailbox content
and private acceptance artifacts remain outside this package.

Scope: new `stack:microsoft-365` and its operator skill, delegated Outlook
read-only v1. Account selection is explicit. Power Automate and existing stacks
are outside this change. Implementation is intentionally uncommitted pending
the owner's review/publication workflow.

## Incremental behavior proof

Commands below were run from the registry root. Each RED was an observed
behavior assertion failure, followed by a focused implementation and the same
unchanged assertion passing. Tests were added one behavior slice at a time.
Initial module scaffolds existed before RED; import/setup failures were not
accepted as behavior evidence.

| Slice | Exact RED and GREEN command | Observed RED | Observed GREEN |
| --- | --- | --- | --- |
| Explicit account configuration | `node --test catalog/stacks/microsoft-365/test/contracts.test.mjs` | Missing expected exception for absent tenant/identity | Configuration rejects missing tenant/identity |
| Identity and scope gate | `node --test catalog/stacks/microsoft-365/test/contracts.test.mjs` | Missing expected exception for wrong tenant | Wrong tenant, mailbox, user ID and broad permission rejected |
| Linked state files | `node --test catalog/stacks/microsoft-365/test/storage.test.mjs` | Missing expected rejection for symlinked config | Linked configuration rejected |
| Pagination origin/mailbox/endpoint | `node --test catalog/stacks/microsoft-365/test/graph.test.mjs` | External next URL accepted | All unsafe next URLs rejected before fetch |
| Bounded, sanitized Graph response | `node --test catalog/stacks/microsoft-365/test/graph.test.mjs` | Raw provider body caused JSON error | Safe HTTP error and oversized-body rejection |
| Authenticate before persistence | `node --test catalog/stacks/microsoft-365/test/auth.test.mjs` | Wrong Graph identity accepted and credentials written | Wrong identity rejected with zero writes |
| Account/query-bound pages | `node --test catalog/stacks/microsoft-365/test/outlook.test.mjs` | Missing `has_more`/bounded page contract | Page limit, cursor and changed-context rejection pass |
| Source-state exclusion | `node --test catalog/stacks/microsoft-365/test/storage.test.mjs` | State accepted under source due trailing-slash boundary | Source rejected before directory creation; installed sibling state stays allowed |
| Safe attachment output | `node --test catalog/stacks/microsoft-365/test/attachments.test.mjs` | Existing file overwritten | Existing/linked files and traversal rejected |
| MCP tool contract | `node --test catalog/stacks/microsoft-365/test/mcp.test.mjs` | Initialized server advertised no tools | Exact eight tools, closed schemas and correct local-write annotation |
| Closed configuration fields | `node --test catalog/stacks/microsoft-365/test/contracts.test.mjs` | Unknown scopes/endpoint fields accepted | Extra fields rejected |
| Private account parent | `node --test catalog/stacks/microsoft-365/test/storage.test.mjs` | Writable accounts parent accepted | Parent requires private ownership/permissions |
| Current Microsoft device URL | `node --test catalog/stacks/microsoft-365/test/auth.test.mjs` | Official `login.microsoft.com/device` URI rejected | Exact official origin/path allowed; callback still hides internal device code |
| Maximum supported attachment | `node --test catalog/stacks/microsoft-365/test/attachments.test.mjs` | Valid 5 MiB Base64 caused regex stack overflow | Linear validation accepts 5 MiB and rejects oversized metadata before output |
| Equivalent provider ID encoding | `node --test catalog/stacks/microsoft-365/test/graph.test.mjs` | Safe same-endpoint pagination with raw `=` rejected | Equivalent segment encoding accepted; unsafe endpoint tests remain green |

The parent-permission test initially encountered macOS's system temporary-path
symlink before reaching its intended boundary. Its fixture was corrected to a
canonical temporary path, then the missing parent check was independently
verified RED and GREEN. The linked-config fixture was also made canonical so
the final test proves the intended file-link boundary.

Additional green regression checks cover silent-cache binding to client,
tenant and username; refreshed-token permission revalidation; per-account
isolation, hardlinks and exclusive credential locks; bounded retry and
Retry-After behavior; stream limits without Content-Length; explicit body
truncation; unknown/missing tool inputs; and MCP provider-error redaction.

## Final focused verification

From `catalog/stacks/microsoft-365`:

```sh
npm run verify
```

Observed: all **23 tests pass**, zero failures/skips. The bundled verifier
launches the actual stdio MCP process under isolated temporary HOME/RUDI_HOME,
initializes it, compares all eight advertised names with the manifest, and
checks an empty account listing. It does not access live credentials. The
portable bundled verifier replaced a registry-relative script dependency;
the same full suite plus actual process verification remained green.

Dependency install used the committed lockfile versions:
`@azure/msal-node` 7.1.0 and `@modelcontextprotocol/sdk` 1.32.1. The manager
separately reported zero stack runtime dependency vulnerabilities from
`npm audit --omit=dev`.

## Acceptance boundaries and known gaps

The manager performed authorized provider setup and reports successful live
profile/list/search/message-read/attachment-list, attachment download and
pagination checks against the approved test account, including unchanged
read status. Private IDs, filenames, cache state and content are intentionally
absent here. These reports are separate from the offline author's proof.

The manager owns registry index generation, complete repository gates, debt
scan, independent review and any accepted publication/installation/adoption.
This record does not assert those later steps have completed.

The cache is plaintext behind OS ownership/permissions, not an encrypted OS
credential vault. Search remains provider-limited to 1,000 matches and mailbox
pagination is not snapshot-isolated. Only global-cloud signed-in-user mail is
supported; guest/alias resolution, shared mailboxes, item/reference downloads,
large attachments, raw MIME and Microsoft 365 writes are unsupported.
Conditional Access, revocation, service throttling and network timeout failures
are modeled offline but not destructively induced in a live tenant. A hostile
process running as the same OS user is outside filesystem isolation guarantees.
