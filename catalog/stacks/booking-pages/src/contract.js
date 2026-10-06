import { DateTime, IANAZone } from 'luxon';

const providers = new Map([
  ['calendar.app.google', 'google'], ['calendar.google.com', 'google'],
]);

export class BookingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function bookingTarget(value) {
  let url;
  try { url = new URL(value); } catch { /* rejected below */ }
  if (typeof value !== 'string' || value.length > 2048 || !url ||
      url.protocol !== 'https:' || url.username || url.password || url.port ||
      !providers.has(url.hostname) || url.pathname === '/' || /[\u0000-\u0020]/.test(value)) {
    throw new BookingError('INVALID_URL', 'Use a supported public HTTPS booking URL without credentials or a custom port.');
  }
  if (url.hostname === 'calendar.google.com' && !url.pathname.startsWith('/calendar/appointments/')) {
    throw new BookingError('INVALID_URL', 'Use a Google appointment booking URL.');
  }
  url.hash = '';
  return { url: url.href, provider: providers.get(url.hostname) };
}

export function validateRequest(input) {
  const fields = ['url', 'duration_minutes', 'from', 'through', 'timezone',
    'event_title', 'expected_owner', 'timeout_seconds'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key))) {
    throw new BookingError('INVALID_INPUT', 'Expected an object containing only the documented fields.');
  }
  const target = bookingTarget(input.url);
  const { duration_minutes: duration, timezone } = input;
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw new BookingError('INVALID_INPUT', 'duration_minutes must be an integer from 5 to 480.');
  }
  if (typeof timezone !== 'string' || !IANAZone.isValidZone(timezone)) {
    throw new BookingError('INVALID_INPUT', 'timezone must be an IANA timezone, for example America/New_York.');
  }
  const from = parseDate(input.from);
  const through = parseDate(input.through);
  const count = through.diff(from, 'days').days + 1;
  if (count < 1 || count > 31) {
    throw new BookingError('INVALID_INPUT', 'Use an inclusive date range of 1 to 31 days.');
  }
  for (const key of ['event_title', 'expected_owner']) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' ||
        !input[key].trim() || input[key].length > 200 || /[\u0000-\u001f]/.test(input[key]))) {
      throw new BookingError('INVALID_INPUT', `${key} must be nonempty text up to 200 characters.`);
    }
  }
  const timeout = input.timeout_seconds ?? 25;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 25) {
    throw new BookingError('INVALID_INPUT', 'timeout_seconds must be between 1 and 25.');
  }
  return { ...input, ...target, timeout_seconds: timeout };
}

export function parseDate(value) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? DateTime.fromISO(value, { zone: 'UTC' }) : null;
  if (!date?.isValid) throw new BookingError('INVALID_INPUT', 'Dates must be real YYYY-MM-DD dates.');
  return date;
}

export function datesInRange(from, through) {
  const end = parseDate(through);
  const dates = [];
  for (let day = parseDate(from); day <= end; day = day.plus({ days: 1 })) dates.push(day.toISODate());
  return dates;
}
