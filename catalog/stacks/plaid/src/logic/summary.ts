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
type CashflowEntry = { tx: Transaction; account?: AccountBase };

export type CashflowSummary = {
  schemaVersion: typeof CASHFLOW_SCHEMA_VERSION;
  generatedAt: string;
  dateRange: { startDate: string; endDate: string };
  basis: Basis;
  sources: CashflowSource[];
  totals: Totals;
  byAccount: AccountTotal[];
  byCategory: CategoryTotal[];
  excludedCategories: {
    primary: string[];
    detailed: string[];
    accountRules: string[];
  };
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

function isCreditCardAccount(account?: AccountBase): boolean {
  return account?.type === "credit" || account?.subtype === "credit card";
}

function isCreditCardPaymentCredit(entry: CashflowEntry): boolean {
  if (!isCreditCardAccount(entry.account) || entry.tx.amount >= 0) {
    return false;
  }

  const primary = entry.tx.personal_finance_category?.primary ?? "";
  const detailed = entry.tx.personal_finance_category?.detailed ?? "";
  const description = [
    entry.tx.name,
    entry.tx.merchant_name,
    entry.tx.original_description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    primary === "LOAN_DISBURSEMENTS" ||
    detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" ||
    /\b(auto\s*pay|autopay|payment|pmt|pymt|thank you|thankyou)\b/.test(
      description
    )
  );
}

function shouldExclude(entry: CashflowEntry, basis: Basis): boolean {
  const tx = entry.tx;
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

  if (basis === "normalized" && isCreditCardPaymentCredit(entry)) {
    return true;
  }

  return false;
}

function contribution(
  entry: CashflowEntry,
  basis: Basis
): { expenses: number; income: number } {
  const { tx, account } = entry;

  if (basis === "normalized" && isCreditCardAccount(account) && tx.amount < 0) {
    return { expenses: tx.amount, income: 0 };
  }

  if (tx.amount > 0) {
    return { expenses: tx.amount, income: 0 };
  }

  return { expenses: 0, income: Math.abs(tx.amount) };
}

function totalsFromEntries(entries: CashflowEntry[], basis: Basis): Totals {
  let expenses = 0;
  let income = 0;
  for (const entry of entries) {
    const value = contribution(entry, basis);
    expenses += value.expenses;
    income += value.income;
  }
  return {
    income: round2(income),
    expenses: round2(expenses),
    net: round2(income - expenses),
    transactionCount: entries.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildByAccount(
  filtered: CashflowEntry[],
  itemId: string,
  itemLabel: string,
  basis: Basis
): AccountTotal[] {
  const groups = new Map<string, CashflowEntry[]>();
  for (const entry of filtered) {
    const existing = groups.get(entry.tx.account_id) ?? [];
    existing.push(entry);
    groups.set(entry.tx.account_id, existing);
  }

  const result: AccountTotal[] = [];
  for (const [accountId, entries] of groups) {
    const acct = entries[0].account;
    result.push({
      accountId,
      itemId,
      itemLabel,
      name: acct?.name ?? accountId,
      mask: acct?.mask ?? null,
      subtype: acct?.subtype ?? null,
      totals: totalsFromEntries(entries, basis),
    });
  }

  return result;
}

function mergeByCategory(
  filtered: CashflowEntry[],
  acc: Map<string, { count: number; expenses: number; income: number }>,
  basis: Basis
): void {
  for (const entry of filtered) {
    const cat = entry.tx.personal_finance_category?.primary ?? "UNCATEGORIZED";
    const total = acc.get(cat) ?? { count: 0, expenses: 0, income: 0 };
    const value = contribution(entry, basis);
    total.count += 1;
    total.expenses += value.expenses;
    total.income += value.income;
    acc.set(cat, total);
  }
}

export async function computeCashflow(
  rawInput: ComputeCashflowInput
): Promise<CashflowSummary> {
  const parsed = CashflowSummaryInputSchema.parse(rawInput);

  const startDate = parsed.startDate ?? yearStartDate();
  const endDate = parsed.endDate ?? todayDate();
  const basis: Basis = (parsed.basis as Basis | undefined) ?? "cash";

  const excludedCategories: {
    primary: string[];
    detailed: string[];
    accountRules: string[];
  } = {
    primary: ["TRANSFER_IN", "TRANSFER_OUT"],
    detailed:
      basis === "normalized" ? ["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"] : [],
    accountRules:
      basis === "normalized" ? ["credit_card_payment_credits"] : [],
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
  const allFiltered: CashflowEntry[] = [];

  for (const { itemId, label } of itemRefs) {
    const result = await getTransactions({
      itemId,
      startDate,
      endDate,
      accountNameIncludes: parsed.accountNameIncludes,
      accountIds: parsed.accountIds,
    });

    const accountById = new Map(
      result.accounts.map((account) => [account.account_id, account])
    );
    const entries = result.transactions.map((tx) => ({
      tx,
      account: accountById.get(tx.account_id),
    }));
    const filtered = entries.filter(
      (entry) => !shouldExclude(entry, basis)
    );

    byAccount.push(...buildByAccount(filtered, itemId, label, basis));
    mergeByCategory(filtered, categoryAcc, basis);
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

  const totals = totalsFromEntries(allFiltered, basis);

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
