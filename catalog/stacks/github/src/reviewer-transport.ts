import type { FetchLike } from "./core.js";

/** Fixed GitHub origin, bounded body and whole-request deadline; no redirect or retry. */
export function createReviewerFetch(fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): FetchLike {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error("Invalid reviewer transport deadline");
  }
  return async (url, init = {}) => {
    const target = new URL(url);
    if (target.origin !== "https://api.github.com" || target.username || target.password || target.hash) {
      throw new Error("Invalid reviewer API origin");
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Request deadline")); }, timeoutMs);
    });
    const request = async () => {
      const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
      const response = await fetchImpl(target.toString(), { ...init, signal, redirect: "error" });
      if (response.status >= 300 && response.status < 400) throw new Error("Redirect rejected");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing response body");
      const parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 262_144) throw new Error("Response exceeds limit");
          parts.push(value);
        }
        if (signal.aborted) throw new Error("Request aborted");
        const raw = Buffer.concat(parts).toString("utf8");
        return { ok: response.ok, status: response.status, headers: response.headers, text: async () => raw };
      } finally { void reader.cancel().catch(() => undefined); }
    };
    try { return await Promise.race([request(), deadline]); }
    catch { throw new Error("Reviewer transport failed"); }
    finally { clearTimeout(timer); controller.abort(); }
  };
}
