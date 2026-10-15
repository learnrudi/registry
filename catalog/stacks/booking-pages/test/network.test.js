import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedRequest, restrictNetwork, resolveBookingUrl } from '../src/network.js';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

test('resolves allowed booking redirects but rejects forbidden hops before requesting them', async () => {
  const received = [];
  const server = createServer((req, res) => {
    received.push(req.url);
    if (req.url === '/short') res.writeHead(302, { location: '/booking' });
    if (req.url === '/bad') res.writeHead(302, { location: '/forbidden' });
    res.end('booking');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const allow = value => ['/short', '/booking', '/bad'].some(path => value === base + path);
    assert.equal(await resolveBookingUrl(context, base + '/short', allow), base + '/booking');
    await assert.rejects(resolveBookingUrl(context, base + '/bad', allow), /redirect/i);
    assert.deepEqual(received, ['/short', '/booking', '/bad']);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('browser never follows a redirect to a forbidden destination', async () => {
  const received = [];
  const server = createServer((req, res) => {
    received.push(req.url);
    if (req.url === '/start') res.writeHead(302, { location: '/forbidden' });
    res.end('destination');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await restrictNetwork(page, value => value === `${base}/start`);
    await assert.rejects(page.goto(`${base}/start`));
    assert.deepEqual(received, ['/start']);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('browser reaches allowed redirected pages while checking each navigation', async () => {
  const received = [];
  const checked = [];
  const server = createServer((req, res) => {
    received.push(req.url);
    if (req.url === '/start') res.writeHead(302, { location: '/booking' });
    res.end('<h1>Booking page</h1>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await restrictNetwork(page, value => {
      checked.push(value);
      return ['/start', '/booking'].some(path => value === base + path);
    });
    await page.goto(base + '/start');
    await page.getByRole('heading', { name: 'Booking page' }).waitFor();
    assert.equal(page.url(), base + '/booking');
    assert.deepEqual(received, ['/start', '/booking']);
    assert.ok(checked.includes(base + '/booking'));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('limits navigation to Google booking pages and resources to fixed provider origins', () => {
  for (const value of ['http://calendar.google.com/calendar/appointments/a',
    'https://127.0.0.1/', 'https://evil.example/', 'file:///etc/passwd',
    'https://accounts.google.com/login', 'https://calendar.google.com:8443/a',
    'https://user:pass@fonts.gstatic.com/a']) {
    assert.equal(allowedRequest(value, false), false, value);
  }
  assert.equal(allowedRequest('https://calendar.google.com/calendar/u/0/', true), false);
  assert.equal(allowedRequest('https://calendar.google.com/calendar/appointments/schedules/abc', true), true);
  assert.equal(allowedRequest('https://calendar.app.google/abc', true), true);
  assert.equal(allowedRequest('https://fonts.gstatic.com/font.woff2', false), true);
  assert.equal(allowedRequest('https://calendar-pa.clients6.google.com/v1/calendar', false), true);
});
