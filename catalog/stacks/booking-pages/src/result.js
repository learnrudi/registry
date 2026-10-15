import { DateTime } from 'luxon';
import { BookingError, bookingTarget, datesInRange } from './contract.js';

function requireEvidence(condition, message) {
  if (!condition) throw new BookingError('UNVERIFIED_PAGE', message);
}

function normalizeSlot(date, label, request) {
  requireEvidence(typeof label === 'string', 'Unrecognized slot time.');
  const time = label.toLowerCase().replace(/[\s\u202f\u00a0]/g, '');
  requireEvidence(/^(?:[1-9]|1[0-2]):[0-5]\d(?:am|pm)$/.test(time), 'Unrecognized slot time.');
  const start = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd h:mma',
    { zone: request.timezone, locale: 'en-US' });
  // UI labels have no UTC offset: never guess across a DST gap or repeated hour.
  requireEvidence(start.isValid && start.toFormat('h:mma').toLowerCase() === time &&
    start.getPossibleOffsets().length === 1, 'The page time is invalid or ambiguous in this timezone.');
  return { start: start.toISO({ suppressMilliseconds: true }),
    end: start.plus({ minutes: request.duration_minutes }).toISO({ suppressMilliseconds: true }) };
}

export function normalizeResult(raw, request) {
  const expected = datesInRange(request.from, request.through);
  requireEvidence(raw && typeof raw.title === 'string' && raw.title.length > 0 && raw.title.length <= 300 &&
    typeof raw.owner === 'string' && raw.owner.length > 0 && raw.owner.length <= 300 &&
    raw.duration_minutes === request.duration_minutes && raw.timezone === request.timezone &&
    (!request.expected_owner || raw.owner === request.expected_owner) &&
    (!request.event_title || raw.title === request.event_title), 'Booking identity, duration or timezone did not match.');
  requireEvidence(bookingTarget(raw.source).provider === request.provider, 'Unexpected booking provider.');
  requireEvidence(Array.isArray(raw.days) && raw.days.length === expected.length,
    'The requested date range was not completely observed.');
  const days = raw.days.map((day, index) => {
    requireEvidence(day.date === expected[index] && Array.isArray(day.times) && day.times.length <= 288,
      'The requested date range was not completely observed.');
    const slots = day.times.map(time => normalizeSlot(day.date, time, request));
    requireEvidence(new Set(slots.map(slot => slot.start)).size === slots.length, 'Duplicate slot evidence.');
    slots.sort((a, b) => a.start.localeCompare(b.start));
    return { date: day.date, slots };
  });
  return { provider: request.provider, source: raw.source, booking_url: request.url,
    owner: raw.owner, event_title: raw.title, duration_minutes: request.duration_minutes,
    timezone: request.timezone, coverage: { from: request.from, through: request.through, complete: true }, days };
}
