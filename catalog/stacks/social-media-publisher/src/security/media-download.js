import { publicHttp } from './public-http.js';

// This trusted operator cap also limits adapters with multi-gigabyte provider limits.
export function mediaByteBudget(providerLimit) {
  const configured = Number(process.env.SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES ?? 64 * 1024 * 1024);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 512 * 1024 * 1024) {
    throw new Error('SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES must be between 1 and 536870912');
  }
  if (!Number.isSafeInteger(providerLimit) || providerLimit < 1) {
    throw new Error('Provider media byte limit must be a positive integer');
  }
  return Math.min(providerLimit, configured);
}

export async function downloadPublicMedia(url, providerLimit, timeoutMs = 60000) {
  const response = await publicHttp.fetch(url, { maxBytes: mediaByteBudget(providerLimit), timeoutMs });
  if (!response.ok) throw new Error(`Media download failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
