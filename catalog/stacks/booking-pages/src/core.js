import { randomUUID } from 'node:crypto';
import { BookingError, validateRequest } from './contract.js';
import { withBrowser } from './browser.js';
import { restrictNetwork, resolveBookingUrl } from './network.js';
import { normalizeResult } from './result.js';
import { readGoogle } from './providers/google.js';

const adapters = { google: readGoogle };

export function safeError(error) {
  if (error instanceof BookingError) return { code: error.code, message: error.message };
  if (error?.name === 'TimeoutError') return { code: 'TIMEOUT',
    message: 'The page did not become verifiable in time. Retry with a shorter date range or inspect the booking page.' };
  if (error?.message?.includes("Executable doesn't exist")) return { code: 'BROWSER_UNAVAILABLE',
    message: 'Chromium is missing. Run npm run install-browser inside the installed booking-pages stack.' };
  return { code: 'PROVIDER_UNAVAILABLE', message: 'The public booking page could not be verified. It may be unavailable, changed, or require sign-in. No availability was inferred.' };
}

export async function getAvailability(input, signal) {
  const request = validateRequest(input);
  const requestId = randomUUID();
  const started = Date.now();
  let outcome = 'error';
  try {
    const raw = await withBrowser(request, async page => {
      await restrictNetwork(page);
      const url = await resolveBookingUrl(page.context(), request.url);
      return adapters[request.provider](page, { ...request, url });
    }, undefined, signal);
    const result = normalizeResult(raw, request);
    outcome = 'success';
    return { ...result, checked_at: new Date().toISOString(), request_id: requestId,
      elapsed_seconds: Math.round((Date.now() - started) / 10) / 100 };
  } finally {
    process.stderr.write(JSON.stringify({ operation: 'booking_pages_get_availability', request_id: requestId,
      provider: request.provider, outcome, elapsed_ms: Date.now() - started }) + '\n');
  }
}
