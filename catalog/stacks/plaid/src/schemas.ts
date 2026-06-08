import { z } from "zod";

export const PlaidEnvironmentSchema = z.enum([
  "sandbox",
  "development",
  "production",
]);

export const PlaidProductSchema = z.enum([
  "transactions",
  "auth",
  "identity",
  "liabilities",
  "investments",
]);

const NonEmptyStringSchema = z.string().trim().min(1);
const UrlSchema = z.string().trim().url();
const DateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && value === parsed.toISOString().slice(0, 10);
  }, "Date must be a valid YYYY-MM-DD value.");

export const CountryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Z]{2}$/);

export const CreateHostedLinkInputSchema = z.object({
  clientUserId: NonEmptyStringSchema.max(128).default("rudi-cli"),
  clientName: NonEmptyStringSchema.max(128).default("Personal Plaid"),
  linkCustomizationName: NonEmptyStringSchema.max(128).optional(),
  userPhoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/)
    .optional(),
  userEmailAddress: z.string().trim().email().optional(),
  products: z.array(PlaidProductSchema).min(1).default(["transactions"]),
  countryCodes: z.array(CountryCodeSchema).min(1).default(["US"]),
  language: z
    .string()
    .trim()
    .length(2)
    .regex(/^[a-z]{2}$/)
    .default("en"),
  daysRequested: z.number().int().min(1).max(730).default(730),
  hostedLinkUrlLifetimeSeconds: z
    .number()
    .int()
    .min(60)
    .max(21 * 24 * 60 * 60)
    .optional(),
  webhook: UrlSchema.optional(),
  redirectUri: UrlSchema.optional(),
  completionRedirectUri: UrlSchema.optional(),
});

export const CompleteHostedLinkInputSchema = z.object({
  linkToken: NonEmptyStringSchema,
  label: NonEmptyStringSchema.max(128).optional(),
  timeoutSeconds: z.number().int().min(5).max(60 * 30).default(300),
  pollIntervalSeconds: z.number().int().min(1).max(30).default(3),
});

export const ExchangePublicTokenInputSchema = z.object({
  publicToken: NonEmptyStringSchema,
  label: NonEmptyStringSchema.max(128).optional(),
});

export const ItemSelectorSchema = z.object({
  itemId: NonEmptyStringSchema.optional(),
});

export const SyncTransactionsInputSchema = ItemSelectorSchema.extend({
  count: z.number().int().min(1).max(500).default(500),
  persistCursor: z.boolean().default(true),
  includeOriginalDescription: z.boolean().default(false),
  personalFinanceCategoryVersion: z.enum(["v1", "v2"]).optional(),
  daysRequested: z.number().int().min(1).max(730).optional(),
});

export const GetTransactionsInputSchema = ItemSelectorSchema.extend({
  startDate: DateStringSchema,
  endDate: DateStringSchema,
  accountIds: z.array(NonEmptyStringSchema).min(1).optional(),
  accountNameIncludes: NonEmptyStringSchema.max(128).optional(),
  count: z.number().int().min(1).max(500).default(500),
  includeOriginalDescription: z.boolean().default(false),
  personalFinanceCategoryVersion: z.enum(["v1", "v2"]).optional(),
}).superRefine((value, context) => {
  if (value.startDate > value.endDate) {
    context.addIssue({
      code: "custom",
      message: "startDate must be on or before endDate.",
      path: ["startDate"],
    });
  }
});

export const TokenRecordSchema = z.object({
  itemId: NonEmptyStringSchema,
  accessToken: NonEmptyStringSchema,
  environment: PlaidEnvironmentSchema,
  label: z.string().trim().max(128).optional(),
  institutionId: z.string().trim().optional(),
  institutionName: z.string().trim().optional(),
  products: z.array(z.string()).default([]),
  linkedAt: NonEmptyStringSchema,
  updatedAt: NonEmptyStringSchema,
  transactionsCursor: z.string().nullable().optional(),
});

export const TokenStoreSchema = z.object({
  version: z.literal(1),
  defaultItemId: z.string().optional(),
  items: z.record(z.string(), TokenRecordSchema),
});

export type PlaidEnvironment = z.infer<typeof PlaidEnvironmentSchema>;
export type CreateHostedLinkInput = z.input<typeof CreateHostedLinkInputSchema>;
export type CompleteHostedLinkInput = z.input<
  typeof CompleteHostedLinkInputSchema
>;
export type ExchangePublicTokenInput = z.input<
  typeof ExchangePublicTokenInputSchema
>;
export type ItemSelectorInput = z.input<typeof ItemSelectorSchema>;
export type SyncTransactionsInput = z.input<typeof SyncTransactionsInputSchema>;
export type GetTransactionsInput = z.input<typeof GetTransactionsInputSchema>;
export const CashflowSummaryInputSchema = z.object({
  itemId: NonEmptyStringSchema.optional(),
  startDate: DateStringSchema.optional(),
  endDate: DateStringSchema.optional(),
  accountNameIncludes: NonEmptyStringSchema.max(128).optional(),
  accountIds: z.array(NonEmptyStringSchema).min(1).optional(),
  basis: z.enum(["cash", "normalized"]).default("cash"),
});

export type TokenRecord = z.infer<typeof TokenRecordSchema>;
export type TokenStore = z.infer<typeof TokenStoreSchema>;
export type CashflowSummaryInput = z.input<typeof CashflowSummaryInputSchema>;

export const McpInputSchemas = {
  createLink: {
    type: "object",
    properties: {
      clientUserId: {
        type: "string",
        description: "Stable local user id for this Link session.",
      },
      clientName: {
        type: "string",
        description: "Display name shown in Plaid Link.",
      },
      linkCustomizationName: {
        type: "string",
        description:
          "Optional Plaid Dashboard Link customization name to apply.",
      },
      products: {
        type: "array",
        items: {
          type: "string",
          enum: ["transactions", "auth", "identity", "liabilities", "investments"],
        },
        description: "Plaid products to request. Defaults to transactions.",
      },
      userPhoneNumber: {
        type: "string",
        description:
          "Optional E.164 phone number for the Link user, e.g. +15135550123.",
      },
      userEmailAddress: {
        type: "string",
        description: "Optional email address for the Link user.",
      },
      countryCodes: {
        type: "array",
        items: { type: "string" },
        description: "Two-letter country codes. Defaults to US.",
      },
      daysRequested: {
        type: "number",
        description: "Transaction history days to request, 1-730.",
      },
      hostedLinkUrlLifetimeSeconds: {
        type: "number",
        description: "Hosted Link URL lifetime in seconds.",
      },
      webhook: {
        type: "string",
        description: "Optional webhook URL for Plaid events.",
      },
      redirectUri: {
        type: "string",
        description: "Optional OAuth redirect URI registered with Plaid.",
      },
      completionRedirectUri: {
        type: "string",
        description: "Optional Hosted Link completion redirect URI.",
      },
    },
  },
  completeHostedLink: {
    type: "object",
    properties: {
      linkToken: {
        type: "string",
        description: "Link token returned by plaid_create_link.",
      },
      label: {
        type: "string",
        description: "Optional local label for the linked Item.",
      },
      timeoutSeconds: {
        type: "number",
        description: "Maximum polling time. Defaults to 300.",
      },
      pollIntervalSeconds: {
        type: "number",
        description: "Polling interval. Defaults to 3.",
      },
    },
    required: ["linkToken"],
  },
  linkStatus: {
    type: "object",
    properties: {
      linkToken: {
        type: "string",
        description: "Link token returned by plaid_create_link.",
      },
    },
    required: ["linkToken"],
  },
  exchangePublicToken: {
    type: "object",
    properties: {
      publicToken: {
        type: "string",
        description: "One-time Plaid public token from Link.",
      },
      label: {
        type: "string",
        description: "Optional local label for the linked Item.",
      },
    },
    required: ["publicToken"],
  },
  itemSelector: {
    type: "object",
    properties: {
      itemId: {
        type: "string",
        description: "Plaid Item ID. Defaults to the local default Item.",
      },
    },
  },
  syncTransactions: {
    type: "object",
    properties: {
      itemId: {
        type: "string",
        description: "Plaid Item ID. Defaults to the local default Item.",
      },
      count: {
        type: "number",
        description: "Page size for /transactions/sync, 1-500.",
      },
      persistCursor: {
        type: "boolean",
        description: "Persist next_cursor after a full successful sync.",
      },
      includeOriginalDescription: {
        type: "boolean",
        description: "Request original transaction descriptions.",
      },
      personalFinanceCategoryVersion: {
        type: "string",
        enum: ["v1", "v2"],
        description: "Plaid personal finance category taxonomy version.",
      },
      daysRequested: {
        type: "number",
        description: "Initial transaction history days if Item is not initialized.",
      },
    },
  },
  getTransactions: {
    type: "object",
    properties: {
      itemId: {
        type: "string",
        description: "Plaid Item ID. Defaults to the local default Item.",
      },
      startDate: {
        type: "string",
        description: "Inclusive start date in YYYY-MM-DD format.",
      },
      endDate: {
        type: "string",
        description: "Inclusive end date in YYYY-MM-DD format.",
      },
      accountIds: {
        type: "array",
        items: { type: "string" },
        description: "Optional Plaid account IDs to include.",
      },
      accountNameIncludes: {
        type: "string",
        description:
          "Optional case-insensitive account name substring used to select accounts.",
      },
      count: {
        type: "number",
        description: "Page size for /transactions/get, 1-500.",
      },
      includeOriginalDescription: {
        type: "boolean",
        description: "Request original transaction descriptions.",
      },
      personalFinanceCategoryVersion: {
        type: "string",
        enum: ["v1", "v2"],
        description: "Plaid personal finance category taxonomy version.",
      },
    },
    required: ["startDate", "endDate"],
  },
} as const;
