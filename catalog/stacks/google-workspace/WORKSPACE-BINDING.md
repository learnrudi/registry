# Client workspace binding v1

Google Workspace 1.2.0 supports the RUDI CLI workspace activation contract. Without a binding it preserves the existing global account behavior. With `RUDI_WORKSPACE_BINDING`, it uses exactly one account and an explicit tool allowlist for the life of the server process.

```json
{"version":1,"workspaceId":"wsp_example","runId":"example-run","account":"user@example.com","tools":["gmail_profile"]}
```

The CLI supplies the state directory explicitly, omits dotenv/legacy migration in bound mode, and expects the same binding in MCP initialize capabilities at `experimental["rudi.workspaceBinding"]`. Unknown fields, invalid identities, account-management tools, and conflicting call arguments are rejected. Tool discovery filters the full catalog. Every direct call checks the allowlist before dispatch.

The first authorized call verifies the pinned OAuth client's actual Gmail identity. That OAuth client remains pinned for the process, including refreshes. Identity verification failure is sticky until a new server is started. Bound token files must be regular, unlinked files with matching account metadata. The global current-account state is neither read for fallback nor changed.

`connection-capabilities.json` defines the four initial selectable capabilities: email reading, email sending, calendar reading, calendar changes. The CLI saves exact tools and a digest of this catalog and installed package metadata. A changed installation requires explicit client reconfiguration. Provider OAuth scopes may be broader than the activated tool set; the activation does not rewrite OAuth grants.

Proof: `npm run test:workspace` launches real MCP servers against a synthetic Google API adapter, including concurrent accounts, a conflicting global default, direct-call denial and an incorrectly labeled credential. `npm run test:auth` covers OAuth setup identity validation. No production credentials or provider calls are used.
