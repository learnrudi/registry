import type { AccountBase, Transaction } from "plaid";

export interface TransactionTotals {
  transactionCount: number;
  outflow: number;
  inflow: number;
  netCashflow: number;
}

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function sanitizeCsvText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (!text) {
    return "";
  }
  return FORMULA_PREFIXES.has(text[0]) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  const text = sanitizeCsvText(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function transactionDirection(amount: number): "inflow" | "outflow" | "zero" {
  if (amount < 0) return "inflow";
  if (amount > 0) return "outflow";
  return "zero";
}

function categoryPath(category?: string[] | null): string {
  return category?.join(" > ") || "";
}

export function summarizeTransactions(
  transactions: Transaction[]
): TransactionTotals {
  let outflow = 0;
  let inflow = 0;

  for (const transaction of transactions) {
    if (transaction.amount > 0) {
      outflow += transaction.amount;
    } else if (transaction.amount < 0) {
      inflow += Math.abs(transaction.amount);
    }
  }

  return {
    transactionCount: transactions.length,
    outflow: Number(outflow.toFixed(2)),
    inflow: Number(inflow.toFixed(2)),
    netCashflow: Number((inflow - outflow).toFixed(2)),
  };
}

export function transactionsToCsv(
  transactions: Transaction[],
  accounts: AccountBase[]
): string {
  const accountById = new Map(
    accounts.map((account) => [account.account_id, account])
  );
  const header = [
    "date",
    "authorized_date",
    "pending",
    "account_name",
    "account_mask",
    "account_type",
    "account_subtype",
    "transaction_id",
    "name",
    "merchant_name",
    "plaid_amount",
    "cashflow_amount",
    "direction",
    "currency",
    "personal_category_primary",
    "personal_category_detailed",
    "personal_category_confidence",
    "business_category_primary",
    "business_category_detailed",
    "business_category_confidence",
    "legacy_category",
    "payment_channel",
    "check_number",
    "original_description",
  ];

  const rows = transactions.map((transaction) => {
    const account = accountById.get(transaction.account_id);
    return csvRow([
      transaction.date,
      transaction.authorized_date,
      transaction.pending,
      account?.official_name || account?.name || "",
      account?.mask,
      account?.type,
      account?.subtype,
      transaction.transaction_id,
      transaction.name,
      transaction.merchant_name,
      formatMoney(transaction.amount),
      formatMoney(-transaction.amount),
      transactionDirection(transaction.amount),
      transaction.iso_currency_code || transaction.unofficial_currency_code,
      transaction.personal_finance_category?.primary,
      transaction.personal_finance_category?.detailed,
      transaction.personal_finance_category?.confidence_level,
      transaction.business_finance_category?.primary,
      transaction.business_finance_category?.detailed,
      transaction.business_finance_category?.confidence_level,
      categoryPath(transaction.category),
      transaction.payment_channel,
      transaction.check_number,
      transaction.original_description,
    ]);
  });

  return `${csvRow(header)}\n${rows.join("\n")}\n`;
}
