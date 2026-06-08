#!/usr/bin/env node
import { spawn } from "node:child_process";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { listAccounts, getBalances } from "../src/logic/accounts.js";
import {
  summarizeTransactions,
  transactionsToCsv,
} from "../src/logic/csv.js";
import {
  completeHostedLink,
  createHostedLinkToken,
  exchangePublicToken,
  getHostedLinkStatus,
} from "../src/logic/link.js";
import {
  getLinkSession,
  listLinkSessions,
  saveLinkSession,
} from "../src/logic/linkSessions.js";
import { getTokenStorePath, listLinkedItems } from "../src/logic/tokens.js";
import {
  getTransactions,
  syncTransactions,
} from "../src/logic/transactions.js";
import { computeCashflow, type CashflowSummary } from "../src/logic/summary.js";
import { PlaidEnvironmentSchema } from "../src/schemas.js";

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const part = rest[i];
    if (!part.startsWith("--")) {
      positionals.push(part);
      continue;
    }

    const key = part.slice(2);
    if (key.startsWith("no-")) {
      flags[key.slice(3)] = false;
      continue;
    }

    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    i += 1;
  }

  return { command, positionals, flags };
}

function flagString(
  flags: Record<string, string | boolean>,
  key: string
): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function flagNumber(
  flags: Record<string, string | boolean>,
  key: string
): number | undefined {
  const value = flagString(flags, key);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be a number.`);
  }
  return parsed;
}

function accountIdsFromFlags(
  flags: Record<string, string | boolean>
): string[] | undefined {
  const accountId = flagString(flags, "account");
  return accountId ? [accountId] : undefined;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function expandHome(pathValue: string): string {
  if (pathValue === "~") {
    return homedir();
  }
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearStartDate(date = todayDate()): string {
  return `${date.slice(0, 4)}-01-01`;
}

async function writePrivateTextFile(
  pathValue: string,
  content: string
): Promise<string> {
  const outputPath = resolve(expandHome(pathValue));
  const outputDir = dirname(outputPath);
  const tmpPath = `${outputPath}.${process.pid}.tmp`;

  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await writeFile(tmpPath, content, { mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, outputPath);
  await chmod(outputPath, 0o600);
  return outputPath;
}

function publicAccountFilter(
  accountFilter: Awaited<ReturnType<typeof getTransactions>>["accountFilter"]
) {
  return {
    accountNameIncludes: accountFilter.accountNameIncludes,
    matchedAccounts: accountFilter.matchedAccounts.map((account) => ({
      name: account.name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
    })),
  };
}

function usage(): void {
  console.log(`Plaid CLI

Usage:
  plaid link [--label name] [--client-user-id id] [--client-name name] [--customization default] [--phone +15135550123] [--email name@example.com] [--days 730] [--browser default|chrome|chrome-clean] [--no-open] [--no-wait]
  plaid sessions
  plaid status [link_token|request_id|--latest]
  plaid complete [link_token|request_id|--latest] [--label name]
  plaid exchange <public_token> [--label name]
  plaid items
  plaid accounts [--item item_id]
  plaid balances [--item item_id]
  plaid sync [--item item_id] [--count 500] [--no-persist] [--full]
  plaid transactions --start YYYY-MM-DD --end YYYY-MM-DD [--item item_id] [--account account_id] [--account-name text] [--full]
  plaid export-transactions --out path.csv [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--item item_id] [--account account_id] [--account-name text]
  plaid summary [--item item_id] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--account-name text] [--basis cash|normalized] [--out path.json] [--no-write] [--no-print]
  plaid config

Environment:
  PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV=sandbox|development|production
`);
}

async function openUrl(url: string, browser = "default"): Promise<void> {
  if (browser === "chrome" || browser === "chrome-clean") {
    const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const args =
      browser === "chrome-clean"
        ? [
            "--new-window",
            "--disable-extensions",
            "--disable-plugins",
            "--user-data-dir=/tmp/rudi-plaid-chrome-profile",
            url,
          ]
        : ["--new-window", url];

    if (process.platform === "darwin") {
      await new Promise<void>((resolve) => {
        const child = spawn(chromePath, args, {
          detached: true,
          stdio: "ignore",
        });
        child.once("error", () => resolve());
        child.unref();
        resolve();
      });
      return;
    }
  }

  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args =
    platform === "win32" ? ["/c", "start", "", url] : [url];

  await new Promise<void>((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", () => resolve());
    child.unref();
    resolve();
  });
}

function formatCashflowTable(summary: CashflowSummary): string {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const lines: string[] = [];

  const basisLabel = summary.basis === "normalized" ? "normalized basis" : "cash basis";
  const headerLabel =
    summary.sources.length === 1
      ? summary.sources[0].label
      : `All linked institutions (${summary.sources.length})`;

  lines.push(
    `YTD Cashflow — ${basisLabel} (${summary.dateRange.startDate} to ${summary.dateRange.endDate})`
  );
  lines.push("");
  lines.push(headerLabel);
  lines.push(
    `  Income:    ${fmt.format(summary.totals.income).padStart(12)}`
  );
  lines.push(
    `  Expenses:  ${fmt.format(summary.totals.expenses).padStart(12)}`
  );
  lines.push(
    `  Net:       ${fmt.format(summary.totals.net).padStart(12)}    (${summary.totals.transactionCount} txns)`
  );

  if (summary.byAccount.length > 0) {
    lines.push("");
    lines.push("  By account:");
    for (const acct of summary.byAccount) {
      const maskStr = acct.mask ? ` (${acct.mask})` : "";
      const acctLabel = `${acct.name}${maskStr}`;
      lines.push(
        `    ${acctLabel.padEnd(30)} Income ${fmt.format(acct.totals.income).padStart(12)}    Expenses ${fmt.format(acct.totals.expenses).padStart(12)}    Net ${fmt.format(acct.totals.net).padStart(12)}`
      );
    }
  }

  const expenseCats = summary.byCategory
    .filter((c) => c.expenses > 0)
    .slice()
    .sort((a, b) => b.expenses - a.expenses)
    .slice(0, 8);
  if (expenseCats.length > 0) {
    lines.push("");
    lines.push("  Top expense categories:");
    for (const cat of expenseCats) {
      lines.push(
        `    ${cat.category.padEnd(36)} ${fmt.format(cat.expenses).padStart(12)}    (${cat.count} txns)`
      );
    }
  }

  const incomeCats = summary.byCategory
    .filter((c) => c.income > 0)
    .slice()
    .sort((a, b) => b.income - a.income)
    .slice(0, 5);
  if (incomeCats.length > 0) {
    lines.push("");
    lines.push("  Top income categories:");
    for (const cat of incomeCats) {
      lines.push(
        `    ${cat.category.padEnd(36)} ${fmt.format(cat.income).padStart(12)}    (${cat.count} txns)`
      );
    }
  }

  lines.push("");
  const excludedPrimary = summary.excludedCategories.primary.join(", ");
  const excludedDetailed = summary.excludedCategories.detailed.join(", ");
  const excludedAccountRules =
    summary.excludedCategories.accountRules?.join(", ");
  const excludedAll = [excludedPrimary, excludedDetailed, excludedAccountRules]
    .filter(Boolean)
    .join(", ");
  lines.push(`Excluded: ${excludedAll || "(none)"}`);

  return lines.join("\n");
}

async function run(): Promise<void> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      usage();
      return;

    case "config": {
      const environment = PlaidEnvironmentSchema.parse(
        process.env.PLAID_ENV || "sandbox"
      );
      print({
        environment,
        tokenStorePath: getTokenStorePath(),
        hasClientId: Boolean(process.env.PLAID_CLIENT_ID),
        hasSecret: Boolean(process.env.PLAID_SECRET),
      });
      return;
    }

    case "link": {
      const link = await createHostedLinkToken({
        clientUserId: flagString(flags, "client-user-id") || "rudi-cli",
        clientName: flagString(flags, "client-name") || "Personal Plaid",
        linkCustomizationName: flagString(flags, "customization"),
        userPhoneNumber: flagString(flags, "phone"),
        userEmailAddress: flagString(flags, "email"),
        daysRequested: flagNumber(flags, "days") || 730,
        hostedLinkUrlLifetimeSeconds: flagNumber(flags, "lifetime-seconds"),
        webhook: flagString(flags, "webhook"),
        redirectUri: flagString(flags, "redirect-uri"),
        completionRedirectUri: flagString(flags, "completion-redirect-uri"),
      });

      console.log(`Hosted Link URL: ${link.hostedLinkUrl}`);
      console.log(`Expires: ${link.expiration}`);
      if (link.requestId) {
        console.log(`Plaid request ID: ${link.requestId}`);
      }
      await saveLinkSession(link);

      if (flags.open !== false) {
        await openUrl(link.hostedLinkUrl, flagString(flags, "browser"));
      }

      if (flags.wait === false) {
        print(link);
        return;
      }

      console.log("Waiting for Hosted Link completion...");
      print(
        await completeHostedLink({
          linkToken: link.linkToken,
          label: flagString(flags, "label"),
          timeoutSeconds: flagNumber(flags, "timeout") || 300,
        })
      );
      return;
    }

    case "sessions":
      print(await listLinkSessions());
      return;

    case "status": {
      const selector = flags.latest === true ? undefined : positionals[0];
      const session = await getLinkSession(selector);
      print(await getHostedLinkStatus(session.linkToken));
      return;
    }

    case "complete": {
      const selector = flags.latest === true ? undefined : positionals[0];
      const session = await getLinkSession(selector);
      print(
        await completeHostedLink({
          linkToken: session.linkToken,
          label: flagString(flags, "label"),
          timeoutSeconds: flagNumber(flags, "timeout") || 30,
          pollIntervalSeconds: flagNumber(flags, "interval") || 3,
        })
      );
      return;
    }

    case "exchange": {
      const publicToken = positionals[0];
      if (!publicToken) {
        throw new Error("Usage: plaid exchange <public_token> [--label name]");
      }
      print(
        await exchangePublicToken({
          publicToken,
          label: flagString(flags, "label"),
        })
      );
      return;
    }

    case "items":
      print(await listLinkedItems());
      return;

    case "accounts":
      print(await listAccounts({ itemId: flagString(flags, "item") }));
      return;

    case "balances":
      print(await getBalances({ itemId: flagString(flags, "item") }));
      return;

    case "sync":
      {
        const result = await syncTransactions({
          itemId: flagString(flags, "item"),
          count: flagNumber(flags, "count") || 500,
          persistCursor: flags.persist !== false,
        });
        if (flags.full === true) {
          print(result);
          return;
        }
        print({
          item: result.item,
          summary: result.summary,
          cursor: {
            persisted: result.cursor.persisted,
            advanced: result.cursor.next !== result.cursor.previous,
          },
        });
      }
      return;

    case "transactions": {
      const startDate = flagString(flags, "start");
      const endDate = flagString(flags, "end");
      if (!startDate || !endDate) {
        throw new Error(
          "Usage: plaid transactions --start YYYY-MM-DD --end YYYY-MM-DD [--item item_id] [--account account_id] [--account-name text] [--full]"
        );
      }

      const result = await getTransactions({
        itemId: flagString(flags, "item"),
        startDate,
        endDate,
        accountIds: accountIdsFromFlags(flags),
        accountNameIncludes: flagString(flags, "account-name"),
        count: flagNumber(flags, "count") || 500,
        includeOriginalDescription: flags["original-description"] === true,
      });
      const totals = summarizeTransactions(result.transactions);

      if (flags.full === true) {
        print({ ...result, totals });
        return;
      }
        print({
          item: result.item,
          dateRange: result.dateRange,
          accountFilter: publicAccountFilter(result.accountFilter),
          summary: {
            ...result.summary,
            requestIds: undefined,
        },
        totals,
      });
      return;
    }

    case "export-transactions": {
      const outputPath = flagString(flags, "out");
      if (!outputPath) {
        throw new Error(
          "Usage: plaid export-transactions --out path.csv [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--item item_id] [--account account_id] [--account-name text]"
        );
      }

      const endDate = flagString(flags, "end") || todayDate();
      const startDate = flagString(flags, "start") || yearStartDate(endDate);
      const result = await getTransactions({
        itemId: flagString(flags, "item"),
        startDate,
        endDate,
        accountIds: accountIdsFromFlags(flags),
        accountNameIncludes: flagString(flags, "account-name"),
        count: flagNumber(flags, "count") || 500,
        includeOriginalDescription: true,
      });
      const csv = transactionsToCsv(result.transactions, result.accounts);
      const writtenPath = await writePrivateTextFile(outputPath, csv);

      print({
        outputPath: writtenPath,
        dateRange: result.dateRange,
        accountFilter: publicAccountFilter(result.accountFilter),
        summary: {
          transactions: result.summary.transactions,
          pages: result.summary.pages,
        },
        totals: summarizeTransactions(result.transactions),
      });
      return;
    }

    case "summary": {
      const basisRaw = flagString(flags, "basis") ?? "cash";
      if (basisRaw !== "cash" && basisRaw !== "normalized") {
        throw new Error(`--basis must be "cash" or "normalized", got: ${basisRaw}`);
      }
      const basis = basisRaw as "cash" | "normalized";

      const startDate = flagString(flags, "start") ?? yearStartDate();
      const endDate = flagString(flags, "end") ?? todayDate();

      const summaryResult = await computeCashflow({
        itemId: flagString(flags, "item"),
        startDate,
        endDate,
        accountNameIncludes: flagString(flags, "account-name"),
        basis,
      });

      const shouldWrite = flags.write !== false;
      const shouldPrint = flags.print !== false;

      let writtenPath: string | undefined;

      if (shouldWrite) {
        let outPath = flagString(flags, "out");
        if (!outPath) {
          const reportDir = join(homedir(), ".rudi", "outputs", "plaid", "reports");
          await mkdir(reportDir, { recursive: true });

          const basisSlug = basis;
          let filename: string;
          if (summaryResult.sources.length === 1) {
            const itemLabel = summaryResult.sources[0].label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            filename = `cashflow-${itemLabel}-${basisSlug}-${startDate}-to-${endDate}.json`;
          } else {
            filename = `cashflow-${basisSlug}-${startDate}-to-${endDate}.json`;
          }
          outPath = join(reportDir, filename);
        }
        writtenPath = await writePrivateTextFile(
          outPath,
          JSON.stringify(summaryResult, null, 2)
        );
      }

      if (shouldPrint) {
        const table = formatCashflowTable(summaryResult);
        console.log(table);
        console.log(
          `Report: ${writtenPath ?? "(not written)"}`
        );
      }

      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
