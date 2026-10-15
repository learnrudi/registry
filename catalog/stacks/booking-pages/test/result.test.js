import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResult } from '../src/result.js';

const request = {
  url: 'https://calendar.google.com/calendar/appointments/schedules/example',
  provider: 'google', duration_minutes: 30, timezone: 'America/New_York',
  from: '2026-03-07', through: '2026-03-09', expected_owner: 'Example Host',
};
const raw = {
  title: 'Intro', owner: 'Example Host', duration_minutes: 30, timezone: request.timezone,
  source: request.url, days: [
    { date: '2026-03-07', times: ['9:00am'] },
    { date: '2026-03-08', times: [] },
    { date: '2026-03-09', times: ['9:00am'] },
  ],
};
test('normalizes observed days including empties and DST offsets without fabricating slots', () => {
  const result = normalizeResult(raw, request);
  assert.deepEqual(result.coverage, { from: request.from, through: request.through, complete: true });
  assert.equal(result.days[0].slots[0].start, '2026-03-07T09:00:00-05:00');
  assert.equal(result.days[0].slots[0].end, '2026-03-07T09:30:00-05:00');
  assert.deepEqual(result.days[1].slots, []);
  assert.equal(result.days[2].slots[0].start, '2026-03-09T09:00:00-04:00');
});

test('rejects incomplete, mismatched and impossible provider evidence rather than reporting no slots', () => {
  for (const patch of [ { days: raw.days.slice(1) }, { owner: 'Another Person' },
    { duration_minutes: 45 }, { timezone: 'Europe/London' },
    { source: 'https://evil.example/' },
    { days: raw.days.map(day => ({ ...day, times: ['nonsense'] })) },
    { days: raw.days.map(day => ({ ...day, times: ['9:00am', '9:00am'] })) } ]) {
    assert.throws(() => normalizeResult({ ...raw, ...patch }, request));
  }
  const spring = { ...request, from: '2026-03-08', through: '2026-03-08' };
  assert.throws(() => normalizeResult({ ...raw, days: [{ date: spring.from, times: ['2:30am'] }] }, spring));
  const fall = { ...request, from: '2026-11-01', through: '2026-11-01' };
  assert.throws(() => normalizeResult({ ...raw, days: [{ date: fall.from, times: ['1:30am'] }] }, fall));
});
