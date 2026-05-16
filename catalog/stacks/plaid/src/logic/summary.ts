import type { AccountBase, Transaction } from "plaid";
import { getLinkedItem, listLinkedItems } from "./tokens.js";
import { getTransactions } from "./transactions.js";
import { CashflowSummaryInputSchema } from "../schemas.js";

export const CASHFLOW_SCHEMA_VERSION = "finance.cashflow.v1";

export type Basis = "cash" | "normalized";

export type Totals = {
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
};

export type AccountTotal = {
  accountId: string;
  itemId: string;
  itemLabel: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  totals: Totals;
};

export type CategoryTotal = {
  category: string;
  count: number;
  expenses: number;
  income: number;
};

export type CashflowSource = { itemId: string; label: string };

export type CashflowSummary = {
  schemaVersion: typeof CASHFLOW_SCHEMA_VERSION;
  generatedAt: string;
  dateRange: { startDate: string; endDate: string };
  basis: Basis;
  sources: CashflowSource[];
  totals: Totals;
  byAccount: AccountTotal[];
  byCategory: CategoryTotal[];
  excludedCategories: { primary: string[]; detailed: string[] };
};

export type ComputeCashflowInput = {
  itemId?: string;
  startDate?: string;
  endDate?: string;
  accountNameIncludes?: string;
  accountIds?: string[];
  basis?: Basis;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearStartDate(): string {
  return `${todayDate().slice(0, 4)}-01-01`;
}

function shouldExclude(tx: Transaction, basis: Basis): boolean {
  const primary = tx.personal_finance_category?.primary ?? null;
  const detailed = tx.personal_finance_category?.detailed ?? null;

  if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") {
    return true;
  }

  if (
    basis === "normalized" &&
    detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"
  ) {
    return true;
  }

  return false;
}

function totalsFromTransactions(txns: Transaction[]): Totals {
  let expenses = 0;
  let income = 0;
  for (const tx of txns) {
    if (tx.amount > 0) {
      expenses += tx.amount;
    } else {
      income += Math.abs(tx.amount);
    }
  }
  return {
    income: round2(income),
    expenses: round2(expenses),
    net: round2(income - expenses),
    transactionCount: txns.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildByAccount(
  filtered: Transaction[],
  accounts: AccountBase[],
  itemId: string,
  itemLabel: string
): AccountTotal[] {
  const accountMap = new Map<string, AccountBase>(
    accounts.map((a) => [a.account_id, a])
  );

  const groups = new Map<string, Transaction[]>();
  for (const tx of filtered) {
    const existing = groups.get(tx.account_id) ?? [];
    existing.push(tx);
    groups.set(tx.account_id, existing);
  }

  const result: AccountTotal[] = [];
  for (const [accountId, txns] of groups) {
    const acct = accountMap.get(accountId);
    result.push({
      accountId,
      itemId,
      itemLabel,
      name: acct?.name ?? accountId,
      mask: acct?.mask ?? null,
      subtype: acct?.subtype ?? null,
      totals: totalsFromTransactions(txns),
    });
  }

  return result;
}

function mergeByCategory(
  filtered: Transaction[],
  acc: Map<string, { count: number; expenses: number; income: number }>
): void {
  for (const tx of filtered) {
    const cat = tx.personal_finance_category?.primary ?? "UNCATEGORIZED";
    const entry = acc.get(cat) ?? { count: 0, expenses: 0, income: 0 };
    entry.count += 1;
    if (tx.amount > 0) {
      entry.expenses += tx.amount;
    } else {
      entry.income += Math.abs(tx.amount);
    }
    acc.set(cat, entry);
  }
}

export async function computeCashflow(
  rawInput: ComputeCashflowInput
): Promise<CashflowSummary> {
  const parsed = CashflowSummaryInputSchema.parse(rawInput);

  const startDate = parsed.startDate ?? yearStartDate();
  const endDate = parsed.endDate ?? todayDate();
  const basis: Basis = (parsed.basis as Basis | undefined) ?? "cash";

  const excludedCategories: { primary: string[]; detailed: string[] } = {
    primary: ["TRANSFER_IN", "TRANSFER_OUT"],
    detailed:
      basis === "normalized" ? ["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"] : [],
  };

  let itemRefs: Array<{ itemId: string; label: string }>;
  if (parsed.itemId) {
    const item = await getLinkedItem(parsed.itemId);
    itemRefs = [
      {
        itemId: item.itemId,
        label: item.label ?? item.institutionName ?? item.itemId,
      },
    ];
  } else {
    const items = await listLinkedItems();
    itemRefs = items.map((item) => ({
      itemId: item.itemId,
      label: item.label ?? item.institutionName ?? item.itemId,
    }));
  }

  const byAccount: AccountTotal[] = [];
  const categoryAcc = new Map<
    string,
    { count: number; expenses: number; income: number }
  >();
  const allFiltered: Transaction[] = [];

  for (const { itemId, label } of itemRefs) {
    const result = await getTransactions({
      itemId,
      startDate,
      endDate,
      accountNameIncludes: parsed.accountNameIncludes,
      accountIds: parsed.accountIds,
    });

    const filtered = result.transactions.filter(
      (tx) => !shouldExclude(tx, basis)
    );

    byAccount.push(...buildByAccount(filtered, result.accounts, itemId, label));
    mergeByCategory(filtered, categoryAcc);
    allFiltered.push(...filtered);
  }

  const byCategory: CategoryTotal[] = Array.from(categoryAcc.entries())
    .map(([category, v]) => ({
      category,
      count: v.count,
      expenses: round2(v.expenses),
      income: round2(v.income),
    }))
    .sort((a, b) => b.expenses + b.income - (a.expenses + a.income));

  const totals = totalsFromTransactions(allFiltered);

  return {
    schemaVersion: CASHFLOW_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    dateRange: { startDate, endDate },
    basis,
    sources: itemRefs.map((r) => ({ itemId: r.itemId, label: r.label })),
    totals,
    byAccount,
    byCategory,
    excludedCategories,
  };
}
