/** Build a credential-bearing REST URL while preserving its configured origin. */
export function buildRestUrl(baseUrl: string, path: string, query: Record<string, unknown>): URL {
  const base = new URL(`${baseUrl.replace(/\/+$/, "")}/`);
  if (base.protocol !== "https:") {
    throw new Error("GITHUB_API_BASE_URL must use https");
  }
  const url = new URL(path.replace(/^\//, ""), base);
  // WHATWG normalization treats backslashes as authority separators.
  if (url.origin !== base.origin || url.username || url.password) {
    throw new Error("path must remain on the configured GitHub REST API origin");
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}
