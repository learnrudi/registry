import { config as loadDotEnv } from "dotenv";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PlaidEnvironmentSchema,
  type PlaidEnvironment,
} from "../schemas.js";

const stackRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadDotEnv({ path: resolve(stackRoot, ".env") });
loadDotEnv();

export interface PlaidRuntimeConfig {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
}

export interface NormalizedPlaidError {
  message: string;
  status?: number;
  errorType?: string;
  errorCode?: string;
  requestId?: string;
  documentationUrl?: string;
  suggestedAction?: string;
}

export function getPlaidRuntimeConfig(): PlaidRuntimeConfig {
  const environment = PlaidEnvironmentSchema.parse(
    process.env.PLAID_ENV || "sandbox"
  );
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId) {
    throw new Error("PLAID_CLIENT_ID is required.");
  }
  if (!secret) {
    throw new Error("PLAID_SECRET is required.");
  }

  return { clientId, secret, environment };
}

export function createPlaidClient(
  runtimeConfig = getPlaidRuntimeConfig()
): PlaidApi {
  const basePath =
    PlaidEnvironments[
      runtimeConfig.environment as keyof typeof PlaidEnvironments
    ];

  if (!basePath) {
    throw new Error(`Unsupported Plaid environment: ${runtimeConfig.environment}`);
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": runtimeConfig.clientId,
        "PLAID-SECRET": runtimeConfig.secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export function normalizePlaidError(error: unknown): NormalizedPlaidError {
  const maybeError = error as {
    message?: string;
    response?: {
      status?: number;
      data?: {
        error_message?: string;
        error_type?: string;
        error_code?: string;
        request_id?: string;
        documentation_url?: string;
        suggested_action?: string;
      };
    };
  };

  const data = maybeError.response?.data;

  return {
    message:
      data?.error_message ||
      maybeError.message ||
      "Plaid request failed with an unknown error.",
    status: maybeError.response?.status,
    errorType: data?.error_type,
    errorCode: data?.error_code,
    requestId: data?.request_id,
    documentationUrl: data?.documentation_url,
    suggestedAction: data?.suggested_action,
  };
}

export function getPlaidErrorCode(error: unknown): string | undefined {
  return normalizePlaidError(error).errorCode;
}
