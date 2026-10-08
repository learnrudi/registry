export interface PublicFetchOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  redirect?: "follow";
}
export function isPublicAddress(address: string): boolean;
export function parsePublicUrl(rawUrl: string): URL;
export function createPublicFetcher(dependencies?: {
  resolve?: (hostname: string, options: { all: true; verbatim: true }) => Promise<{ address: string; family: number }[]>;
  request?: typeof import("node:http").request;
}): (url: string, options?: PublicFetchOptions) => Promise<Response>;
export const publicHttp: { fetch: (url: string, options?: PublicFetchOptions) => Promise<Response> };
