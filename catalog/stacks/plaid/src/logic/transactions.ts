import {
  createPlaidClient,
  getPlaidErrorCode,
} from "../api/client.js";
import type {
  AccountBase,
  PersonalFinanceCategoryVersion,
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
  redactItem,
  updateTransactionsCursor,
} from "./tokens.js";

const MUTATION_DURING_PAGINATION = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

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
  const item = await getLinkedItem(input.itemId);
  const client = createPlaidClient();
  const accountResponse = await client.accountsGet({
    access_token: item.accessToken,
  });
  const allAccounts = accountResponse.data.accounts;

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
