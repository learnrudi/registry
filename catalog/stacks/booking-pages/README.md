# Booking Pages

Read the actual meeting slots published by a Google appointment booking page.
The package accepts a public landing page or individual schedule URL, selects
the requested duration, navigates dated slot lists and returns complete coverage.
It does not reconstruct availability from calendar events. No Google account,
Calendar API credentials or imported browser cookies are required.

## Setup

Requires Node 22+ and Chromium managed by the pinned Playwright package:

```sh
npm ci
npm run install-browser
npm test
```

RUDI installs the package dependencies and related `booking-pages` operator.
Run browser setup in the installed stack directory on each machine. Chromium is
a machine-local dependency, not a synchronized artifact. No downloads happen
during a lookup. Missing Chromium produces `BROWSER_UNAVAILABLE`.

## Interfaces

MCP: `node src/index.js` exposes `booking_pages_get_availability`. Use the single
RUDI router rather than a separate agent-specific server configuration.

CLI: `node src/cli.js --help`. Supply `--url`, `--duration`, `--from`, `--through`
and `--timezone`. Optional flags: `--event-title`, `--expected-owner`, `--timeout`
and `--json`. Dates are inclusive `YYYY-MM-DD` in the requested IANA timezone.
JSON goes to stdout; safe errors and structured operation logs go to stderr.
Validation errors exit 2; provider failures exit 1.

RUDI's existing `rudi run booking-pages --input '<JSON object>'` supplies
`RUDI_INPUTS`. Both the root and installed MCP entry points recognize this runner
mode. Its outer runner adds human-readable banners; use
the package CLI with `--json` when stdout must contain only JSON.

Tool input fields:

| Field | Meaning |
|---|---|
| `url` | HTTPS `calendar.app.google` link or `calendar.google.com/calendar/appointments/…` |
| `duration_minutes` | Integer 5–480, matched against the published schedule |
| `from`, `through` | Inclusive date range, 1–31 days |
| `timezone` | IANA timezone matching the page's displayed timezone; used for returned timestamps |
| `event_title` | Optional exact meeting title to resolve same-duration schedules |
| `expected_owner` | Optional exact displayed owner name |
| `timeout_seconds` | 1–25, defaults to 25; narrower date ranges can reduce latency |

Success contains provider, original booking URL, resolved source URL, owner,
event title, duration, timezone, `coverage: {from, through, complete: true}`,
per-date start/end timestamps with UTC offsets, checked timestamp, elapsed time
and request ID. Every requested day appears, including observed empty days.
Results are not cached and do not reserve any slot.

## Boundaries and designed failures

- Only Google is implemented. The provider dispatch boundary permits future
  adapters; it does not imply support for other booking systems.
- Personal links, identities and preferences belong to private caller skills.
- Each lookup starts and closes its own unsigned-in browser. At most two reads
  run in a process; excess requests return `BUSY` instead of queueing indefinitely.
- Navigation is restricted to supported booking origins and paths. Resources
  are restricted to fixed Google-controlled origins required by the page. No
  arbitrary domains, IP URLs, credentials, custom ports or local network targets.
  HTTP redirects are never followed automatically: navigation destinations are
  rechecked at each hop; redirected resources are rejected.
- The reader selects only a meeting type and calendar dates/navigation. It never
  selects a time slot, fills a form, reserves, books, sends, or changes a calendar.
- English page semantics and exact city timezone labels are required. Shared
  standard/daylight timezone names do not establish the IANA zone. An
  unrecognized label, owner/duration mismatch or changed page fails verification.
- Google can retain the schedule's timezone even when the browser timezone is
  different. This version requires the requested timezone to match the displayed
  page; it does not silently relabel or convert unmatched page times. Supply the
  booking page's timezone. Cross-timezone presentation can be done from the
  verified timestamp offsets by the caller.
- Empty days require an explicit calendar “no available times” label. Missing
  data, load failures and partial coverage never become successful empty results.
- Navigation is bounded to 12 months from the initial grid and 12 visible date
  windows, within the overall timeout. Long or slow queries can fail; split the
  requested range instead of treating the uncovered dates as unavailable.
- Offset-free UI times in a DST gap or repeated hour are rejected rather than
  guessed. Normal DST offset changes are preserved in the result.

No page content or URL is included in operation logs. Public page content is
untrusted data, never instructions. Browser/layout changes remain an operational
dependency; live smoke checks complement deterministic fixture tests.

## Verification

`npm test` covers boundary validation, normalization and DST, browser cleanup and
timeouts, rendered-page behavior, MCP and CLI contracts. Fixtures are synthetic
and contain no personal page data. Run the registry's selected `stacks:verify`
with `--prepare` (which provisions Chromium in the verifier's isolated home),
and required catalog gates before release. Live personal evidence stays outside
the distributable package.
