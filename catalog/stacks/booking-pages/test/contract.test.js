import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRequest } from '../src/contract.js';

const request = {
  url: 'https://calendar.google.com/calendar/appointments/schedules/example', duration_minutes: 30,
  from: '2026-10-05', through: '2026-10-11', timezone: 'America/New_York',
};

test('rejects unsupported or credential-bearing booking targets before navigation', () => {
  for (const url of ['http://calendar.app.google/example', 'https://localhost/a',
    'https://calendar.app.google.evil.example/a', 'https://user:pass@calendar.app.google/a',
    'https://calendar.app.google:8443/a', 'https://127.0.0.1/a',
    'https://cal.com/example/intro', 'https://calendly.com/example/intro']) {
    assert.throws(() => validateRequest({ ...request, url }), /booking URL/i);
  }
});

test('requires real inclusive dates, bounded range, duration, zone and strict fields', () => {
  for (const patch of [ { from: '2026-02-30' }, { through: '2026-10-04' },
    { through: '2027-10-05' }, { duration_minutes: 0 }, { duration_minutes: '30' },
    { timezone: 'EST-ish' }, { surprise: true }, { from: '2026-1-5' } ]) {
    assert.throws(() => validateRequest({ ...request, ...patch }));
  }
  const result = validateRequest(request);
  assert.equal(result.provider, 'google');
  assert.equal(result.timeout_seconds, 25);
});
