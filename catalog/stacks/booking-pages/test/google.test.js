import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { readGoogle } from '../src/providers/google.js';
import { normalizeResult } from '../src/result.js';

const url = 'https://calendar.google.com/calendar/appointments/schedules/example';
const request = { url, provider: 'google', duration_minutes: 30, from: '2026-10-05',
  through: '2026-10-06', timezone: 'America/New_York' };

function fixture() {
  return `<header><h2>Example Host</h2><h1>Intro</h1><div>30 min appointments</div></header>
    <main><div><h2>Select an appointment time</h2><div>New York Time</div></div>
    <div role="grid" aria-label="October 2026"><button aria-label="5, Monday">5</button>
    <button aria-label="6, Tuesday, no available times">6</button></div>
    <button aria-label="Previous day">Previous</button><button aria-label="Next day">Next</button>
    <div role="list" aria-label="Monday, October 5, 2026"><button>12:00pm</button></div>
    <div role="list" aria-label="Tuesday, October 6, 2026"></div></main>`;
}

test('rejects shared standard-time labels that do not prove the requested IANA zone', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-20T12:00:00Z') });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: 'America/Chicago' });
    // Mexico City and Chicago share this winter label but differ after US DST.
    await page.clock.setFixedTime(new Date('2026-01-20T12:00:00Z'));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html',
      body: fixture().replace('New York Time', 'Central Standard Time') }));
    await assert.rejects(readGoogle(page, { ...request, timezone: 'America/Chicago' }), /timezone could not be verified/i);
  } finally { await browser.close(); }
});

test('collects more than two weeks without navigating back to already observed dates', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: request.timezone });
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture() + `<script>
      let first=5;
      function render(){
        document.querySelectorAll('[role="list"]').forEach(n=>n.remove());
        document.querySelector('[role="grid"]').innerHTML='';
        for(let d=first;d<first+7;d++){
          const date=new Date(Date.UTC(2026,9,d));
          const weekday=date.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
          const list=document.createElement('div');list.setAttribute('role','list');
          list.setAttribute('aria-label',weekday+', October '+d+', 2026');document.querySelector('main').append(list);
          const button=document.createElement('button');button.setAttribute('aria-label',d+', '+weekday+', no available times');
          button.textContent=d;document.querySelector('[role="grid"]').append(button);
        }
      }
      document.querySelector('[aria-label="Next day"]').onclick=()=>{first+=7;render()};
      document.querySelector('[aria-label="Previous day"]').onclick=()=>{first-=7;render()};render();
    </script>` }));
    const extended={...request,through:'2026-10-25'};
    const result=normalizeResult(await readGoogle(page,extended),extended);
    assert.equal(result.days.length,21);
    assert.ok(result.days.every(day=>day.slots.length===0));
  } finally { await browser.close(); }
});

test('reads a rendered Google schedule including explicit empty days without selecting a slot', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: request.timezone });
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture() }));
    let clicked = false;
    await page.exposeFunction('slotClicked', () => { clicked = true; });
    await page.addInitScript(() => document.addEventListener('click', e => {
      if (e.target.closest('[role=list]')) window.slotClicked();
    }));
    const result = normalizeResult(await readGoogle(page, request), request);
    assert.equal(result.owner, 'Example Host');
    assert.equal(result.days[0].slots[0].start, '2026-10-05T12:00:00-04:00');
    assert.deepEqual(result.days[1].slots, []);
    assert.equal(clicked, false);
  } finally { await browser.close(); }
});

test('refuses an empty list when the calendar says slots exist', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: request.timezone });
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html',
      body: fixture().replace('<button>12:00pm</button>', '') }));
    await assert.rejects(readGoogle(page, request), /empty slot list/i);
  } finally { await browser.close(); }
});

test('does not guess between two schedules with the same duration', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: request.timezone });
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body:
      '<header><h1>Example</h1></header>' + ['Intro', 'Support'].map(title =>
        `<a href="./appointments/schedules/${title}"><h2>${title}</h2><div>30 min</div></a>`).join('') }));
    await assert.rejects(readGoogle(page, { ...request, url: url.replace('/schedules/example', '/example') }), /Multiple schedules/);
  } finally { await browser.close(); }
});

test('selects a duration from a landing page and navigates to dates outside the first week', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: request.timezone });
    const landing = url.replace('/schedules/example', '/example');
    await page.route('**/*', route => {
      if (route.request().url() === landing) return route.fulfill({ contentType: 'text/html', body:
        '<header><h1>Example Host</h1></header><a href="./schedules/example"><h2>Intro</h2><div>30 min</div></a>' });
      return route.fulfill({ contentType: 'text/html', body: fixture() + `<script>
        document.querySelector('[aria-label="Next day"]').onclick = () => {
          document.querySelector('[role="grid"]').innerHTML = '<button aria-label="12, Monday">12</button><button aria-label="13, Tuesday, no available times">13</button>';
          const lists = document.querySelectorAll('[role="list"]');
          lists[0].setAttribute('aria-label', 'Monday, October 12, 2026');
          lists[1].setAttribute('aria-label', 'Tuesday, October 13, 2026');
        };
      </script>` });
    });
    const next = { ...request, url: landing, from: '2026-10-12', through: '2026-10-13' };
    const result = normalizeResult(await readGoogle(page, next), next);
    assert.equal(result.days[0].date, next.from);
    assert.equal(result.days[0].slots[0].start, '2026-10-12T12:00:00-04:00');
  } finally { await browser.close(); }
});
