---
name: "booking-pages"
description: "Read published meeting availability from a public Google booking page through RUDI. Supply a booking link, duration, date range and timezone; no calendar sign-in required."
version: 0.1.0
category: "web"
tags:
  - rudi
  - operator
  - booking
  - calendar
  - capability:read
requires:
  stacks:
    - stack:booking-pages
---

# Booking Pages

Use the installed `booking_pages_get_availability` tool through the RUDI router.
This version supports public Google appointment landing pages and individual
schedules. Calendly, Cal.com, custom domains and routing forms are unsupported.

## Workflow

1. Obtain the user's booking URL and preferences from their personal skill or
   this conversation. The generic stack has no account or personal defaults.
2. Resolve duration, inclusive dates and IANA timezone. Use a supplied duration;
   ask if it cannot be determined. When no date range is given, check today
   through six days later in the user's timezone and state that range. When
   timezone is unknown, ask rather than assume. Send explicit dates to the tool.
   The tool timezone must match the booking page display; Google can retain the
   schedule zone regardless of the browser zone. Convert verified timestamps
   separately for presentation if the user wants another display timezone.
3. Inspect the live schema. Supply `url`, `duration_minutes`, `from`, `through`,
   `timezone`, and optionally exact `event_title` and displayed `expected_owner`.
   A range is limited to 31 days; split a longer requested interval into bounded
   calls and report the actual coverage of every call.
4. Report dated slots in the requested timezone, meeting duration, checked time
   and the original booking link. Retain source and coverage from the result.
   Slots are a fresh observation, not a hold or guarantee of later availability.

## Evidence and failure behavior

- An observed empty day means no slots were bookable on that page. It does not
  establish that the underlying calendar is busy all day.
- A page error, timeout, missing browser, sign-in/CAPTCHA, changed layout or
  incomplete coverage is a failed lookup. Never turn it into “no availability.”
- Ambiguous meeting selection requires an exact title or schedule link. Do not
  guess between schedules of the same duration.
- Do not silently replace a failed page read with private-calendar calculations.
  Requests to inspect events or explicitly override booking-page rules belong to
  the authenticated calendar operator instead.
- If the stack is missing, describe the missing capability. Installation and
  browser setup are separate from possessing these instructions.
- No bookings, slot reservations, messages, invites, authentication, cookie
  import or calendar modifications are authorized by an availability request.

## CLI

The stack also has `node src/cli.js --help` and a `--json` mode. Run it from the
installed stack directory using a supported Node runtime. It uses the same
reader as MCP and does not depend on any agent host's browser wrapper.
