import { DateTime } from 'luxon';
import { BookingError, bookingTarget, datesInRange } from '../contract.js';

const unverified = message => new BookingError('UNVERIFIED_PAGE', message);

export function durationFromText(text) {
  const match = text.match(/^(?:(\d+)\s*(?:hr|hour)s?\s*)?(?:(\d+)\s*min(?:ute)?s?\s*)?(?:appointments)?$/i);
  return match ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : null;
}

async function identity(page, request) {
  const banner = page.getByRole('banner');
  const title = (await banner.getByRole('heading', { level: 1 }).innerText()).trim();
  const owner = (await banner.getByRole('heading', { level: 2 }).innerText()).trim();
  const durations = (await banner.innerText()).split('\n').map(line => durationFromText(line.trim())).filter(Boolean);
  if (durations.length !== 1 || durations[0] !== request.duration_minutes) {
    throw unverified('The selected schedule duration does not match the request.');
  }
  const zoneText = await page.getByRole('heading', { name: 'Select an appointment time', exact: true })
    .locator('..').innerText();
  const canonical = new Intl.DateTimeFormat('en-US', { timeZone: request.timezone }).resolvedOptions().timeZone;
  const browserZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const zoneLabels = [request.timezone.split('/').at(-1).replaceAll('_', ' ') + ' Time',
    canonical.split('/').at(-1).replaceAll('_', ' ') + ' Time'];
  // Standard/daylight names can describe different IANA zones that diverge
  // later in the requested range. Require Google's exact city label instead.
  if (browserZone !== canonical || !zoneLabels.some(label => zoneText.split('\n').includes(label))) {
    throw unverified('The booking page timezone could not be verified.');
  }
  return { title, owner, duration_minutes: durations[0], timezone: request.timezone, source: page.url() };
}

async function visibleDays(page) {
  const raw = await page.locator('[role="list"][aria-label]').evaluateAll(nodes => nodes
    .filter(node => node.getClientRects().length)
    .map(node => ({ label: node.getAttribute('aria-label'), times: Array.from(node.querySelectorAll('button'))
      .filter(button => button.getClientRects().length && !button.disabled && button.getAttribute('aria-disabled') !== 'true')
      .map(button => button.textContent.trim()) })));
  return raw.map(day => {
    const parsed = DateTime.fromFormat(day.label, 'cccc, LLLL d, yyyy', { zone: 'UTC', locale: 'en-US' });
    if (!parsed.isValid) throw unverified('Unrecognized date labels on the booking page.');
    return { date: parsed.toISODate(), times: day.times };
  });
}

async function verifyEmptyDay(page, date) {
  const day = DateTime.fromISO(date, { zone: 'UTC' });
  const name = new RegExp(`^(?:${day.toFormat('LLLL')} )?${day.day}, ${day.toFormat('cccc')}, (?:today, )?no available times$`);
  if (await page.getByRole('grid').getByRole('button', { name }).count() !== 1) {
    throw unverified('An empty slot list was not confirmed by the calendar availability labels.');
  }
}

async function selectSchedule(page, request) {
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
  bookingTarget(page.url());
  if (new URL(page.url()).pathname.includes('/appointments/schedules/')) return;
  const links = await page.locator('a[href*="appointments/schedules/"], a[href^="./schedules/"]')
    .evaluateAll(nodes => nodes.map(node => ({ url: node.href,
      title: node.querySelector('h2')?.textContent.trim(), lines: node.innerText.split('\n') })));
  const matches = links.filter(link => (!request.event_title || link.title === request.event_title) &&
    link.lines.some(line => durationFromText(line.trim()) === request.duration_minutes));
  if (matches.length !== 1) throw new BookingError('SCHEDULE_SELECTION', matches.length
    ? 'Multiple schedules match; supply an exact event_title from the booking page.'
    : 'No schedule matches this duration and event_title.');
  const target = bookingTarget(matches[0].url);
  if (!new URL(target.url).pathname.includes('/appointments/schedules/')) throw unverified('Unexpected schedule link.');
  await page.goto(target.url, { waitUntil: 'domcontentloaded' });
}

async function advance(page, direction, oldFirst) {
  await page.getByRole('button', { name: `${direction} day`, exact: true }).click();
  await page.waitForFunction(first => {
    const list = Array.from(document.querySelectorAll('[role="list"][aria-label]')).find(node => node.getClientRects().length);
    return list && list.getAttribute('aria-label') !== first;
  }, DateTime.fromISO(oldFirst, { locale: 'en-US' }).toFormat('cccc, LLLL d, yyyy'));
  await page.waitForLoadState('networkidle');
}

async function positionStart(page, date, visible) {
  if (visible.some(day => day.date === date)) return;
  const target = DateTime.fromISO(date, { zone: 'UTC', locale: 'en-US' });
  const grid = page.getByRole('grid');
  let month = DateTime.fromFormat(await grid.getAttribute('aria-label'), 'LLLL yyyy', { zone: 'UTC', locale: 'en-US' });
  if (!month.isValid || Math.abs(target.startOf('month').diff(month, 'months').months) > 12) {
    throw new BookingError('RANGE_LIMIT', 'The requested start date is beyond the supported 12-month navigation limit.');
  }
  while (month.toFormat('yyyy-MM') !== target.toFormat('yyyy-MM')) {
    const direction = month < target.startOf('month') ? 1 : -1;
    month = month.plus({ months: direction });
    await page.getByRole('button', { name: direction === 1 ? 'Next month' : 'Previous month', exact: true }).click();
    await page.getByRole('grid', { name: month.toFormat('LLLL yyyy'), exact: true }).waitFor();
  }
  const button = grid.getByRole('button', { name: new RegExp(`^${target.day}, ${target.toFormat('cccc')}(?:,|$)`) });
  if (await button.count() === 1) {
    await button.click();
    await page.getByRole('list', { name: target.toFormat('cccc, LLLL d, yyyy'), exact: true }).waitFor({ state: 'attached' });
    await page.waitForLoadState('networkidle');
  }
}

async function collectDays(page, request) {
  let visible = await visibleDays(page);
  await positionStart(page, request.from, visible);
  const expected = datesInRange(request.from, request.through);
  const observed = new Map();
  for (let window = 0; window < 12; window++) {
    visible = await visibleDays(page);
    if (!visible.length || visible.length > 7) throw unverified('Unrecognized booking date layout.');
    for (const day of visible) {
      if (!expected.includes(day.date)) continue;
      if (!day.times.length) await verifyEmptyDay(page, day.date);
      observed.set(day.date, day);
    }
    if (expected.every(date => observed.has(date))) return expected.map(date => observed.get(date));
    const nextMissing = expected.find(date => !observed.has(date));
    const direction = nextMissing < visible[0].date ? 'Previous' : 'Next';
    await advance(page, direction, visible[0].date);
  }
  throw unverified('The requested date range was not completely observed within the navigation limit.');
}

export async function readGoogle(page, request) {
  page.setDefaultTimeout(8000);
  await page.goto(request.url, { waitUntil: 'domcontentloaded' });
  await selectSchedule(page, request);
  await page.getByRole('button', { name: 'Next day', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  bookingTarget(page.url());
  const metadata = await identity(page, request);
  const days = await collectDays(page, request);
  return { ...metadata, days };
}
