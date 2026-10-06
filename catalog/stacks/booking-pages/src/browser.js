import { chromium } from 'playwright';
import { BookingError } from './contract.js';

let active = 0;

export async function withBrowser(request, work, launch = options => chromium.launch(options), signal) {
  const cancelled = () => new BookingError('CANCELLED', 'Booking-page read was cancelled.');
  if (signal?.aborted) throw cancelled();
  if (active >= 2) throw new BookingError('BUSY', 'Two booking reads are already running. Retry when one finishes.');
  active++;
  const started = Date.now();
  const budget = request.timeout_seconds * 1000;
  let browser;
  let timer;
  let onAbort;
  try {
    browser = await launch({ headless: true, timeout: budget });
    if (signal?.aborted) throw cancelled();
    const read = async () => {
      const context = await browser.newContext({ timezoneId: request.timezone, locale: 'en-US',
        viewport: { width: 1800, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false });
      return work(await context.newPage());
    };
    return await Promise.race([read(), new Promise((_, reject) => {
      onAbort = () => reject(cancelled());
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => reject(new BookingError('TIMEOUT', 'Booking-page read timed out; no availability was verified.')),
        Math.max(1, budget - (Date.now() - started)));
    })]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    try { if (browser) await browser.close(); } finally { active--; }
  }
}
