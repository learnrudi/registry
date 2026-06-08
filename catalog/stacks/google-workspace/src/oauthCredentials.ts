import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { WorkspacePaths } from "./state.js";

type OAuthClientConfig = {
  client_id: string;
  client_secret: string;
};

type GoogleCredentials = {
  installed?: OAuthClientConfig;
  web?: OAuthClientConfig;
};

type TokenLike = {
  client_id?: string;
  client_secret?: string;
};

export function loadGoogleCredentials(paths: WorkspacePaths, account?: string): GoogleCredentials | null {
  const fromEnv = process.env.GOOGLE_CREDENTIALS?.trim();
  if (fromEnv) {
    return parseGoogleCredentials(fromEnv);
  }

  if (account) {
    const accountCredentialsPath = join(paths.accountsDir, account, "credentials.json");
    if (existsSync(accountCredentialsPath)) {
      return readCredentialsFile(accountCredentialsPath);
    }
  }

  return null;
}

export function resolveOAuthClientConfig(paths: WorkspacePaths, token: TokenLike, account?: string): OAuthClientConfig {
  if (token.client_id && token.client_secret) {
    return {
      client_id: token.client_id,
      client_secret: token.client_secret,
    };
  }

  const credentials = loadGoogleCredentials(paths, account);
  const config = credentials?.installed || credentials?.web;
  if (!config?.client_id || !config?.client_secret) {
    throw new Error("Google OAuth credentials are missing. Set GOOGLE_CREDENTIALS or run npm run auth.");
  }

  return config;
}

export function readCredentialsFile(filePath: string): GoogleCredentials {
  return JSON.parse(readFileSync(filePath, "utf-8")) as GoogleCredentials;
}

function parseGoogleCredentials(value: string): GoogleCredentials {
  if (value.startsWith("{")) {
    return JSON.parse(value) as GoogleCredentials;
  }

  if (existsSync(value)) {
    return readCredentialsFile(value);
  }

  throw new Error("GOOGLE_CREDENTIALS must be credentials JSON or a path to credentials.json.");
}
