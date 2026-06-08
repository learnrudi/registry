# Plaid

Personal-first Plaid stack for RUDI.

The implementation is split into:

- `src/schemas.ts`: boundary contracts and validation.
- `src/api/client.ts`: Plaid SDK configuration and error normalization.
- `src/logic/*.ts`: account linking, secure token storage, balances, transaction fetch/sync, and CSV shaping.
- `bin/plaid.ts`: local CLI adapter.
- `src/index.ts`: MCP stdio adapter for RUDI.

## Environment

```bash
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
```

`PLAID_ENV` defaults to `sandbox`. Access tokens are stored in
`~/.plaid/tokens.json` with mode `0600` unless `PLAID_TOKEN_STORE_PATH` is set.

## Personal CLI

```bash
npm run cli -- link
npm run cli -- link --customization default
npm run cli -- items
npm run cli -- accounts
npm run cli -- balances
npm run cli -- sync
npm run cli -- transactions --start 2026-01-01 --end 2026-05-16 --account-name "Operating"
npm run cli -- export-transactions --out ~/.plaid/exports/operating-ytd-2026.csv --account-name "Operating"
npm run cli -- export-transactions --out ~/.plaid/exports/account-ytd-2026.csv --account account_id
```

`link` creates a Plaid Hosted Link URL, opens it in your browser, polls
`/link/token/get` for the public token after completion, exchanges it, and stores
the resulting access token locally.

`sync` is cursor-based and prints a summary by default. Use `--full` only when
you intentionally want the raw Plaid payload in stdout.

`export-transactions` uses `/transactions/get` for an explicit date range and
writes a local CSV with mode `0600`. If no `--start` or `--end` is provided, it
defaults to year-to-date through today. When `--account` is provided without
`--item`, the CLI resolves the linked Item that owns the account ID. If account
IDs span multiple Items, run one export per Item or pass `--item` explicitly.

## MCP Tools

- `plaid_create_link`
- `plaid_complete_hosted_link`
- `plaid_get_link_status`
- `plaid_exchange_public_token`
- `plaid_list_items`
- `plaid_list_accounts`
- `plaid_get_balances`
- `plaid_sync_transactions`
