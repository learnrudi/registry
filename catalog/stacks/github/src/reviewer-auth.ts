import { withinDeadline } from "./deadline.js";
import { sign, type KeyObject } from "node:crypto";
import type { FetchLike } from "./core.js";
import { createReviewerFetch } from "./reviewer-transport.js";

export const REVIEWER_PERMISSIONS = Object.freeze({
  contents: "read", metadata: "read", pull_requests: "write",
  checks: "write", statuses: "read",
});

export interface ReviewerAppConfig {
  appId: number;
  installationId: number;
  accountId: number;
  repositoryIds: number[];
}

export interface ReviewerAuthDependencies {
  privateKey: () => Promise<KeyObject>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  keyTimeoutMs?: number;
}

export function createReviewerTokenProvider(
  config: ReviewerAppConfig, deps: ReviewerAuthDependencies,
): () => Promise<string> {
  const policy = copyConfig(config);
  const clock = deps.now ?? Date.now;
  const fetchImpl = createReviewerFetch(deps.fetchImpl);
  const privateKey = deps.privateKey;
  const keyTimeoutMs = deps.keyTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(keyTimeoutMs) || keyTimeoutMs < 1 || keyTimeoutMs > 30_000) {
    throw new Error("Invalid key-loader deadline");
  }
  let cached: { token: string; expires: number } | undefined;
  let pending: Promise<string> | undefined;
  const refresh = async () => {
    try {
      const now = clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid clock");
      const key = await withinDeadline(privateKey, keyTimeoutMs);
      if (key.type !== "private" || key.asymmetricKeyType !== "rsa"
        || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
        throw new Error("Invalid signing key");
      }
      const unsigned = [
        { alg: "RS256", typ: "JWT" },
        { iss: String(policy.appId), iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540 },
      ].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
      const jwt = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
      const path = `/app/installations/${policy.installationId}`;
      const installation = await appRequest(fetchImpl, jwt, path);
      const account = record(installation.account);
      if (installation.id !== policy.installationId || installation.app_id !== policy.appId
        || account.id !== policy.accountId || installation.suspended_at !== null) {
        throw new Error("Installation identity mismatch");
      }
      validatePermissions(installation.permissions);
      const result = await appRequest(fetchImpl, jwt, `${path}/access_tokens`, {
        repository_ids: policy.repositoryIds, permissions: REVIEWER_PERMISSIONS,
      });
      validatePermissions(result.permissions);
      const repositories = result.repositories;
      if (!Array.isArray(repositories) || repositories.length !== policy.repositoryIds.length
        || repositories.some(repo => !policy.repositoryIds.includes(record(repo).id as number))
        || new Set(repositories.map(repo => record(repo).id)).size !== repositories.length) {
        throw new Error("Token repository scope mismatch");
      }
      const expires = typeof result.expires_at === "string" ? Date.parse(result.expires_at) : NaN;
      if (!Number.isFinite(expires) || expires <= clock() + 60_000 || expires > now + 3_660_000
        || typeof result.token !== "string" || !/^[A-Za-z0-9_.-]{1,4096}$/.test(result.token)) {
        throw new Error("Invalid token response");
      }
      cached = { token: result.token, expires };
      return result.token;
    } catch {
      // Neither key-loader exceptions nor upstream bodies are safe diagnostics.
      throw new Error("Reviewer App authentication failed");
    }
  };
  return async () => {
    if (cached && cached.expires > clock() + 60_000) return cached.token;
    if (!pending) pending = refresh().finally(() => { pending = undefined; });
    return pending;
  };
}

function copyConfig(config: ReviewerAppConfig): ReviewerAppConfig {
  const ids = [config?.appId, config?.installationId, config?.accountId];
  const repositories = config?.repositoryIds;
  if (!Array.isArray(repositories) || repositories.length < 1 || repositories.length > 500
    || [...ids, ...repositories].some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(repositories).size !== repositories.length) {
    throw new Error("Invalid reviewer App configuration");
  }
  return { appId: config.appId, installationId: config.installationId,
    accountId: config.accountId, repositoryIds: [...repositories] };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid API object");
  return value as Record<string, unknown>;
}

function validatePermissions(value: unknown): void {
  const permissions = record(value);
  if (Object.keys(permissions).length !== Object.keys(REVIEWER_PERMISSIONS).length
    || Object.entries(REVIEWER_PERMISSIONS).some(([name, level]) => permissions[name] !== level)) {
    throw new Error("Token permission scope mismatch");
  }
}

async function appRequest(
  fetchImpl: FetchLike, jwt: string, path: string, body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status !== (body ? 201 : 200)) throw new Error("App API request failed");
  return record(JSON.parse(await response.text()));
}
