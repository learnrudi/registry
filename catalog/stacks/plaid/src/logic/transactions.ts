import {
  createPlaidClient,
  getPlaidErrorCode,
} from "../api/client.js";
import type {
  AccountBase,
  PersonalFinanceCategoryVersion,
  PlaidApi,
  Transaction,
  TransactionsGetRequest,
  TransactionsGetRequestOptions,
  TransactionsSyncRequest,
  TransactionsSyncRequestOptions,
} from "plaid";
import {
  GetTransactionsInputSchema,
  SyncTransactionsInputSchema,
  type GetTransactionsInput,
  type SyncTransactionsInput,
} from "../schemas.js";
import {
  getLinkedItem,
  listLinkedTokenRecords,
  redactItem,
  updateTransactionsCursor,
} from "./tokens.js";
import type { TokenRecord } from "../schemas.js";

const MUTATION_DURING_PAGINATION = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
type ParsedGetTransactionsInput = ReturnType<
  (typeof GetTransactionsInputSchema)["parse"]
>;
type AccountsGetResponse = Awaited<ReturnType<PlaidApi["accountsGet"]>>;

export interface TransactionItemContext {
  item: TokenRecord;
  accountResponse: AccountsGetResponse;
  accounts: AccountBase[];
}

function accountMatchesName(account: AccountBase, nameIncludes: string): boolean {
  const needle = nameIncludes.toLowerCase();
  return [account.name, account.official_name, account.mask]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function getAccountLabel(account: AccountBase): string {
  return account.official_name || account.name;
}

function toPersonalFinanceCategoryVersion(
  version: "v1" | "v2" | undefined
): PersonalFinanceCategoryVersion | undefined {
  return version as PersonalFinanceCategoryVersion | undefined;
}

function accountIdsMissingFromItem(
  accountIds: string[] | undefined,
  accounts: AccountBase[]
): string[] {
  if (!accountIds) {
    return [];
  }

  const linkedAccountIds = new Set(
    accounts.map((account) => account.account_id)
  );
  return accountIds.filter((accountId) => !linkedAccountIds.has(accountId));
}

function formatAccountIds(accountIds: string[]): string {
  return accountIds.map((accountId) => `"${accountId}"`).join(", ");
}

async function getAccountsForItem(
  client: PlaidApi,
  item: TokenRecord
): Promise<TransactionItemContext> {
  const accountResponse = await client.accountsGet({
    access_token: item.accessToken,
  });

  return {
    item,
    accountResponse,
    accounts: accountResponse.data.accounts,
  };
}

function noLinkedItemsError(): Error {
  return new Error(
    "No Plaid Items are linked. Run `plaid link` or call plaid_create_link first."
  );
}

export async function resolveTransactionItemContext(
  input: ParsedGetTransactionsInput,
  client: PlaidApi
): Promise<TransactionItemContext> {
  const requestedAccountIds = input.accountIds;

  if (input.itemId || !requestedAccountIds) {
    const item = await getLinkedItem(input.itemId);
    const context = await getAccountsForItem(client, item);
    const missingAccountIds = accountIdsMissingFromItem(
      requestedAccountIds,
      context.accounts
    );

    if (missingAccountIds.length > 0) {
      throw new Error(
        `Requested Plaid account_id(s) ${formatAccountIds(
          missingAccountIds
        )} are not linked to Plaid Item "${item.itemId}". Pass the matching --item, or omit --item so account IDs can be resolved across linked Items.`
      );
    }

    return context;
  }

  const items = await listLinkedTokenRecords();
  if (items.length === 0) {
    throw noLinkedItemsError();
  }

  const fullMatches: TransactionItemContext[] = [];
  const partialMatches: Array<{
    item: TokenRecord;
    matchedAccountIds: string[];
  }> = [];

  for (const item of items) {
    const context = await getAccountsForItem(client, item);
    const linkedAccountIds = new Set(
      context.accounts.map((account) => account.account_id)
    );
    const matchedAccountIds = requestedAccountIds.filter((accountId) =>
      linkedAccountIds.has(accountId)
    );

    if (matchedAccountIds.length === requestedAccountIds.length) {
      fullMatches.push(context);
    } else if (matchedAccountIds.length > 0) {
      partialMatches.push({ item, matchedAccountIds });
    }
  }

  if (fullMatches.length === 1) {
    return fullMatches[0];
  }

  if (fullMatches.length > 1) {
    throw new Error(
      `Requested Plaid account_id(s) ${formatAccountIds(
        requestedAccountIds
      )} matched multiple linked Items. Pass --item to choose one explicitly.`
    );
  }

  if (partialMatches.length > 0) {
    const matches = partialMatches
      .map(
        (match) =>
          `"${match.item.itemId}" has ${formatAccountIds(match.matchedAccountIds)}`
      )
      .join("; ");
    throw new Error(
      `Requested Plaid account_id(s) ${formatAccountIds(
        requestedAccountIds
      )} span multiple linked Items and cannot be fetched in one /transactions/get request. Run separate exports per Item. Matches: ${matches}.`
    );
  }

  throw new Error(
    `No linked Plaid Item contains account_id(s): ${formatAccountIds(
      requestedAccountIds
    )}. Run \`plaid accounts\` to verify account IDs.`
  );
}

export async function syncTransactions(rawInput: SyncTransactionsInput = {}) {
  const input = SyncTransactionsInputSchema.parse(rawInput);
  const item = await getLinkedItem(input.itemId);
  const client = createPlaidClient();
  const startingCursor = item.transactionsCursor || null;
  let restartCount = 0;

  for (;;) {
    let cursor = startingCursor;
    let nextCursor = startingCursor;
    let hasMore = true;
    let pages = 0;
    const added: unknown[] = [];
    const modified: unknown[] = [];
    const removed: unknown[] = [];
    let accounts: unknown[] = [];
    let transactionsUpdateStatus: string | undefined;

    try {
      while (hasMore) {
        const request: TransactionsSyncRequest = {
          access_token: item.accessToken,
          count: input.count,
        };

        if (cursor) {
          request.cursor = cursor;
        }

        const options: TransactionsSyncRequestOptions = {};
        if (input.includeOriginalDescription) {
          options.include_original_description = true;
        }
        if (input.personalFinanceCategoryVersion) {
          options.personal_finance_category_version =
            toPersonalFinanceCategoryVersion(input.personalFinanceCategoryVersion);
        }
        if (input.daysRequested && !cursor) {
          options.days_requested = input.daysRequested;
        }
        if (Object.keys(options).length > 0) {
          request.options = options;
        }

        const response = await client.transactionsSync(request);
        const data = response.data;

        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        accounts = data.accounts;
        transactionsUpdateStatus = data.transactions_update_status;
        hasMore = data.has_more;
        nextCursor = data.next_cursor;
        cursor = data.next_cursor;
        pages += 1;
      }

      let persistedItem = redactItem(item);
      if (input.persistCursor) {
        persistedItem = await updateTransactionsCursor(item.itemId, nextCursor);
      }

      return {
        item: persistedItem,
        summary: {
          added: added.length,
          modified: modified.length,
          removed: removed.length,
          pages,
          cursorAdvanced: nextCursor !== startingCursor,
          transactionsUpdateStatus,
        },
        cursor: {
          previous: startingCursor,
          next: nextCursor,
          persisted: input.persistCursor,
        },
        accounts,
        added,
        modified,
        removed,
      };
    } catch (error) {
      if (
        getPlaidErrorCode(error) === MUTATION_DURING_PAGINATION &&
        restartCount < 2
      ) {
        restartCount += 1;
        continue;
      }
      throw error;
    }
  }
}

export async function getTransactions(rawInput: GetTransactionsInput) {
  const input = GetTransactionsInputSchema.parse(rawInput);
  const client = createPlaidClient();
  const { item, accountResponse, accounts: allAccounts } =
    await resolveTransactionItemContext(input, client);

  let accountIds = input.accountIds;
  if (!accountIds && input.accountNameIncludes) {
    accountIds = allAccounts
      .filter((account) =>
        accountMatchesName(account, input.accountNameIncludes as string)
      )
      .map((account) => account.account_id);

    if (accountIds.length === 0) {
      throw new Error(
        `No Plaid accounts matched --account-name "${input.accountNameIncludes}".`
      );
    }
  }

  const selectedAccountIds = accountIds ? new Set(accountIds) : undefined;
  const selectedAccounts = selectedAccountIds
    ? allAccounts.filter((account) => selectedAccountIds.has(account.account_id))
    : allAccounts;

  const options: TransactionsGetRequestOptions = {
    count: input.count,
    offset: 0,
  };
  if (accountIds) {
    options.account_ids = accountIds;
  }
  if (input.includeOriginalDescription) {
    options.include_original_description = true;
  }
  if (input.personalFinanceCategoryVersion) {
    options.personal_finance_category_version =
      toPersonalFinanceCategoryVersion(input.personalFinanceCategoryVersion);
  }

  const transactions: Transaction[] = [];
  const requestIds: string[] = [accountResponse.data.request_id];
  let totalTransactions = 0;
  let pages = 0;

  do {
    const request: TransactionsGetRequest = {
      access_token: item.accessToken,
      start_date: input.startDate,
      end_date: input.endDate,
      options,
    };
    const response = await client.transactionsGet(request);
    requestIds.push(response.data.request_id);
    transactions.push(...response.data.transactions);
    totalTransactions = response.data.total_transactions;
    pages += 1;
    options.offset = transactions.length;
  } while (transactions.length < totalTransactions);

  return {
    item: redactItem(item),
    dateRange: {
      startDate: input.startDate,
      endDate: input.endDate,
    },
    accountFilter: {
      accountNameIncludes: input.accountNameIncludes,
      accountIds,
      matchedAccounts: selectedAccounts.map((account) => ({
        accountId: account.account_id,
        name: getAccountLabel(account),
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
      })),
    },
    summary: {
      transactions: transactions.length,
      totalTransactions,
      pages,
      requestIds,
    },
    accounts: selectedAccounts,
    transactions,
  };
}
