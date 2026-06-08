import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import type { AccountBase, PlaidApi } from "plaid";

import { GetTransactionsInputSchema } from "../src/schemas.js";
import { resolveTransactionItemContext } from "../src/logic/transactions.js";

const linkedAt = "2026-05-16T00:00:00.000Z";

function account(accountId: string, name: string): AccountBase {
  return {
    account_id: accountId,
    balances: {
      available: null,
      current: null,
      iso_currency_code: "USD",
      limit: null,
      unofficial_currency_code: null,
    },
    mask: accountId.slice(-4),
    name,
    official_name: name,
    subtype: "checking",
    type: "depository",
    verification_status: null,
  } as AccountBase;
}

function fakeClient(accountsByAccessToken: Record<string, AccountBase[]>): PlaidApi {
  return {
    accountsGet: async ({ access_token }: { access_token: string }) => ({
      data: {
        accounts: accountsByAccessToken[access_token] || [],
        item: {},
        request_id: `req-${access_token}`,
      },
    }),
  } as unknown as PlaidApi;
}

async function withTokenStore(
  tokenStore: unknown,
  run: () => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "plaid-test-"));
  const path = join(dir, "tokens.json");
  const previousPath = process.env.PLAID_TOKEN_STORE_PATH;
  process.env.PLAID_TOKEN_STORE_PATH = path;

  try {
    await writeFile(path, `${JSON.stringify(tokenStore, null, 2)}\n`, {
      mode: 0o600,
    });
    await run();
  } finally {
    if (previousPath === undefined) {
      delete process.env.PLAID_TOKEN_STORE_PATH;
    } else {
      process.env.PLAID_TOKEN_STORE_PATH = previousPath;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function tokenStore() {
  return {
    version: 1,
    defaultItemId: "item-primary",
    items: {
      "item-primary": {
        itemId: "item-primary",
        accessToken: "access-primary",
        environment: "production",
        label: "Primary Bank",
        products: ["transactions"],
        linkedAt,
        updatedAt: linkedAt,
      },
      "item-card": {
        itemId: "item-card",
        accessToken: "access-card",
        environment: "production",
        label: "Card Account",
        products: ["transactions"],
        linkedAt,
        updatedAt: linkedAt,
      },
    },
  };
}

test("account id filters resolve the owning item when no item is provided", async () => {
  await withTokenStore(tokenStore(), async () => {
    const client = fakeClient({
      "access-primary": [account("acct-primary-1558", "Operating Account")],
      "access-card": [account("acct-card-2001", "Rewards Card")],
    });
    const input = GetTransactionsInputSchema.parse({
      startDate: "2026-01-01",
      endDate: "2026-05-28",
      accountIds: ["acct-card-2001"],
    });

    const result = await resolveTransactionItemContext(input, client);

    assert.equal(result.item.itemId, "item-card");
    assert.equal(result.accountResponse.data.request_id, "req-access-card");
    assert.deepEqual(
      result.accounts.map((entry) => entry.account_id),
      ["acct-card-2001"]
    );
  });
});

test("explicit item filters fail before sending account ids to the wrong access token", async () => {
  await withTokenStore(tokenStore(), async () => {
    const client = fakeClient({
      "access-primary": [account("acct-primary-1558", "Operating Account")],
      "access-card": [account("acct-card-2001", "Rewards Card")],
    });
    const input = GetTransactionsInputSchema.parse({
      itemId: "item-primary",
      startDate: "2026-01-01",
      endDate: "2026-05-28",
      accountIds: ["acct-card-2001"],
    });

    await assert.rejects(
      () => resolveTransactionItemContext(input, client),
      /not linked to Plaid Item "item-primary"/
    );
  });
});
