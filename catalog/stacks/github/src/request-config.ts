import { withinDeadline } from "./deadline.js";

export interface EnvLike {
  [key: string]: string | undefined;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

export function getEnv(name: string, env: EnvLike = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function getToken(env: EnvLike = process.env): string {
  const token = getEnv("GITHUB_TOKEN", env);
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured");
  }
  return token;
}

export async function resolveToken(
  deps: { tokenProvider?: () => Promise<string> },
  env: EnvLike
): Promise<string> {
  if (!deps.tokenProvider) return getToken(env);
  try {
    const token = await withinDeadline(deps.tokenProvider, getTimeoutMs(env));
    if (typeof token !== "string" || !/^[A-Za-z0-9_.\-]{1,4096}$/.test(token)) {
      throw new Error("Invalid provider token");
    }
    return token;
  } catch {
    // Provider failures can contain key material; never attach their cause.
    throw new Error("GitHub authentication provider unavailable");
  }
}

export function getTimeoutMs(env: EnvLike = process.env): number {
  const raw = getEnv("GITHUB_API_TIMEOUT_MS", env);
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const timeout = Number(raw);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > MAX_TIMEOUT_MS) {
    throw new Error(`GITHUB_API_TIMEOUT_MS must be an integer between 1000 and ${MAX_TIMEOUT_MS}`);
  }
  return timeout;
}
