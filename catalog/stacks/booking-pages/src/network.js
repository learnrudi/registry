import { BookingError, bookingTarget } from './contract.js';

const resources = new Set(['calendar.google.com', 'calendar.app.google',
  'www.gstatic.com', 'ssl.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com',
  'lh3.googleusercontent.com', 'calendar-pa.clients6.google.com']);

export function allowedRequest(value, navigation) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (navigation) {
    try { bookingTarget(value); return true; } catch { return false; }
  }
  return resources.has(url.hostname);
}

export async function resolveBookingUrl(context, value, allow = allowedRequest) {
  let current = value;
  for (let hop = 0; hop < 6; hop++) {
    if (!allow(current, true)) throw new BookingError('UNVERIFIED_PAGE', 'Booking redirect destination is not allowed.');
    const response = await context.request.get(current, { maxRedirects: 0, timeout: 8000 });
    const status = response.status();
    const location = response.headers().location;
    await response.dispose();
    if (status >= 200 && status < 300) return current;
    if (![301, 302, 303, 307, 308].includes(status) || !location) break;
    current = new URL(location, current).href;
  }
  throw new BookingError('UNVERIFIED_PAGE', 'Booking redirect could not be resolved within the allowed limit.');
}

export async function restrictNetwork(page, allow = allowedRequest) {
  await page.context().route('**/*', async route => {
    const request = route.request();
    if (!allow(request.url(), request.isNavigationRequest())) return route.abort('blockedbyclient');
    // Browser routing does not intercept subsequent HTTP redirect hops. Fetch
    // without following redirects and never hand a redirect back to Chromium.
    try {
      const response = await route.fetch({ maxRedirects: 0, timeout: 8000 });
      if (response.status() >= 300 && response.status() < 400) {
        const location = response.headers().location;
        const destination = location && new URL(location, request.url()).href;
        if (!request.isNavigationRequest() || !destination || !allow(destination, true)) {
          return await route.abort('blockedbyclient');
        }
        // Turn a validated HTTP redirect into a fresh document navigation so
        // Playwright intercepts the next hop, including any subsequent redirect.
        const literal = JSON.stringify(destination).replaceAll('<', '\\u003c');
        return await route.fulfill({ status: 200, contentType: 'text/html',
          body: `<script>location.replace(${literal})</script>` });
      }
      await route.fulfill({ response });
    } catch {
      await route.abort('failed').catch(() => {}); // Context may already be closed by the deadline.
    }
  });
  // A reader has no reason to open another tab or download a document.
  page.on('popup', popup => { void popup.close(); });
}
