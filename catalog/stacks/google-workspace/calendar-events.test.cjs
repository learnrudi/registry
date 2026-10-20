const assert = require("node:assert/strict");
const { test } = require("node:test");

const identity = { calendar_id: "team@example.com", event_id: "event-1" };
const original = {
  id: "event-1", etag: '"v1"', summary: "Placeholder", status: "confirmed",
  start: { dateTime: "2026-10-02T15:30:00-04:00", timeZone: "America/New_York" },
  end: { dateTime: "2026-10-02T16:30:00-04:00", timeZone: "America/New_York" },
  description: "Original notes", location: "Old venue",
  attendees: [{ email: "guest@example.com", responseStatus: "accepted" }],
  conferenceData: { conferenceId: "keep-me" },
  reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
  attachments: [{ fileUrl: "https://example.com/agenda" }],
};

function provider(event = original) {
  let saved = structuredClone(event);
  const calls = [];
  return {
    calls,
    events: {
      get: async (args, options) => {
        calls.push({ method: "get", args, options });
        return { data: structuredClone(saved) };
      },
      patch: async (args, options) => {
        calls.push({ method: "patch", args, options });
        saved = { ...saved, ...args.requestBody, etag: '"v2"' };
        return { data: structuredClone(saved) };
      },
    },
  };
}
const payload = (result) => JSON.parse(result.content[0].text);

test("reads exact calendar/event details and preserves unrelated data when rescheduling", async () => {
  const { runCalendarGet, runCalendarUpdate } = await import("./src/calendar-events.ts");
  const calendar = provider();
  assert.deepEqual(payload(await runCalendarGet(calendar, identity)).event, original);
  calendar.calls.length = 0;
  const result = payload(await runCalendarUpdate(calendar, {
    ...identity, send_updates: "none", etag: '"v1"', summary: "In person meeting",
    start: "2026-10-06T15:30:00-04:00", end: "2026-10-06T16:30:00-04:00",
  }));
  assert.equal(result.verified, true);
  assert.equal(result.eventId, original.id);
  for (const key of ["attendees", "conferenceData", "reminders", "attachments", "description", "location"]) {
    assert.deepEqual(result.event[key], original[key], `${key} preserved`);
  }
  assert.deepEqual(calendar.calls.map((call) => call.method), ["get", "patch", "get"]);
  assert.deepEqual(calendar.calls[1].args, {
    calendarId: identity.calendar_id, eventId: identity.event_id, sendUpdates: "none",
    requestBody: {
      summary: "In person meeting",
      start: { dateTime: "2026-10-06T19:30:00.000Z", timeZone: "America/New_York" },
      end: { dateTime: "2026-10-06T20:30:00.000Z", timeZone: "America/New_York" },
    },
  });
  assert.deepEqual(calendar.calls[1].options, { timeout: 30000, retry: false, headers: { "If-Match": '"v1"' } });
});

test("rejects unsupported fields before reading or changing the event", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  const calendar = provider();
  await assert.rejects(runCalendarUpdate(calendar, {
    ...identity, send_updates: "none", summary: "New title", attendees: [],
  }), /Unsupported field: attendees/);
  assert.equal(calendar.calls.length, 0);
});

test("clears notes and location explicitly, including on all-day events", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  const calendar = provider({ ...original, start: { date: "2026-10-02" }, end: { date: "2026-10-03" } });
  const result = payload(await runCalendarUpdate(calendar, { ...identity, send_updates: "all", description: "", location: "" }));
  assert.equal(result.verified, true);
  assert.equal(result.event.description, "");
  assert.equal(result.event.location, "");
  assert.deepEqual(result.event.start, { date: "2026-10-02" });
  assert.equal(calendar.calls[1].args.sendUpdates, "all");
  assert.deepEqual(calendar.calls[1].args.requestBody, { description: "", location: "" });
});

test("invalid or incomplete changes never reach Google", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  for (const change of [
    {}, { summary: "" }, { location: null }, { description: 3 },
    { start: "2026-10-06T15:30:00-04:00" },
    { start: "2026-10-06T15:30:00", end: "2026-10-06T16:30:00" },
    { start: "2026-02-30T15:30:00Z", end: "2026-03-03T16:30:00Z" },
    { start: "2026-10-06T15:30:00Z", end: "2026-10-06T15:30:00Z" },
    { start: "2026-10-06T15:30:00Z", end: "2026-10-06T14:30:00Z" },
    { time_zone: "America/New_York" },
    { start: "2026-10-06T15:30:00Z", end: "2026-10-06T16:30:00Z", time_zone: "not-a-zone" },
    { summary: "valid", send_updates: "invalid" },
    { summary: "valid", send_updates: undefined },
    { summary: "valid", event_id: "" },
    { summary: "valid", calendar_id: null },
  ]) {
    const calendar = provider();
    await assert.rejects(runCalendarUpdate(calendar, { ...identity, send_updates: "none", ...change }));
    assert.equal(calendar.calls.length, 0, JSON.stringify(change));
  }
});

test("rejects stale etags, recurring masters, cancelled events and all-day retiming without mutation", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  for (const [event, change, message] of [
    [original, { etag: '"old"' }, /changed since calendar_get/],
    [{ ...original, recurrence: ["RRULE:FREQ=WEEKLY"] }, {}, /Recurring series/],
    [{ ...original, status: "cancelled" }, {}, /cancelled/],
    [{ ...original, id: "other" }, {}, /mismatched/],
    [{ ...original, etag: null }, {}, /etag/],
    [{ ...original, start: { date: "2026-10-02" } }, { start: "2026-10-06T15:30:00Z", end: "2026-10-06T16:30:00Z" }, /all-day/],
  ]) {
    const calendar = provider(event);
    await assert.rejects(runCalendarUpdate(calendar, { ...identity, send_updates: "none", summary: "new", ...change }), message);
    assert.deepEqual(calendar.calls.map((call) => call.method), ["get"]);
  }
});

test("read-back failure reports an accepted but unverified update without retrying", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  for (const failure of ["throw", "mismatch", "wrong-id"]) {
    const calendar = provider();
    const get = calendar.events.get;
    calendar.events.get = async (...args) => {
      const result = await get(...args);
      if (calendar.calls.length === 3) {
        if (failure === "throw") throw new Error("Do not leak provider request headers");
        if (failure === "mismatch") result.data.summary = "Concurrent replacement";
        if (failure === "wrong-id") result.data.id = "other";
      }
      return result;
    };
    const result = await runCalendarUpdate(calendar, { ...identity, send_updates: "none", summary: "New" });
    assert.equal(result.isError, true);
    assert.equal(payload(result).status, "updated_unverified");
    assert.equal(payload(result).verified, false);
    assert.doesNotMatch(JSON.stringify(result), /headers/);
    assert.deepEqual(calendar.calls.map((call) => call.method), ["get", "patch", "get"]);
  }
});

test("provider conflict or uncertain patch failure is surfaced without automatic retries", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  for (const status of [412, 403, 500, undefined]) {
    const calendar = provider();
    let writes = 0;
    calendar.events.patch = async (_args, options) => {
      writes++;
      assert.equal(options.retry, false);
      throw { response: { status } };
    };
    const result = await runCalendarUpdate(calendar, { ...identity, send_updates: "externalOnly", summary: "New" });
    assert.equal(result.isError, true);
    assert.equal(payload(result).status, status === 412 ? "conflict" : "update_not_verified");
    assert.equal(writes, 1);
  }
});

test("updates one recurring occurrence and verifies equivalent returned time offsets", async () => {
  const { runCalendarUpdate } = await import("./src/calendar-events.ts");
  const calendar = provider({ ...original, recurringEventId: "series-1" });
  const get = calendar.events.get;
  calendar.events.get = async (...args) => {
    const result = await get(...args);
    if (calendar.calls.length === 3) {
      result.data.start.dateTime = "2026-10-06T15:30:00-04:00";
      result.data.end.dateTime = "2026-10-06T16:30:00-04:00";
    }
    return result;
  };
  const result = payload(await runCalendarUpdate(calendar, {
    event_id: original.id, send_updates: "none", start: "2026-10-06T19:30:00Z", end: "2026-10-06T20:30:00Z", time_zone: "America/New_York",
  }));
  assert.equal(result.verified, true);
  assert.equal(result.calendarId, "primary");
  assert.equal(result.event.recurringEventId, "series-1");
});
