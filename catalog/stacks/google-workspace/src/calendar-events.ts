import type { calendar_v3 } from "googleapis";

type ToolArgs = Record<string, unknown> | undefined;
const requestOptions = { timeout: 30_000, retry: false };

export function calendarEventToolDefinitions(accountInput: Record<string, unknown>) {
  const identity = {
    account: accountInput,
    calendar_id: { type: "string", description: "Calendar ID containing the event (default: primary)" },
    event_id: { type: "string", minLength: 1, description: "Exact event ID, or occurrence ID for one recurring instance" },
  };
  return [
    {
      name: "calendar_get",
      description: "Read one calendar event, including notes, location, guests, recurrence, conference details and etag.",
      inputSchema: { type: "object", properties: identity, required: ["event_id"], additionalProperties: false },
    },
    {
      name: "calendar_update",
      description: "Patch an existing event and verify it by reading it back. Omitted fields are preserved. Guest lists, conferences, and recurring series are not edited. Requires an explicit guest notification mode.",
      inputSchema: {
        type: "object",
        properties: {
          ...identity,
          summary: { type: "string", minLength: 1, description: "New event title" },
          description: { type: "string", description: "New notes; empty string clears notes" },
          location: { type: "string", description: "New location; empty string clears location" },
          start: { type: "string", format: "date-time", description: "New timed start with UTC offset; requires end. Cannot convert an all-day event." },
          end: { type: "string", format: "date-time", description: "New timed end with UTC offset; requires start" },
          time_zone: { type: "string", description: "IANA time zone for new start/end; requires both. Omitted zones are preserved." },
          etag: { type: "string", description: "Optional etag from calendar_get; reject if the event has changed since that read" },
          send_updates: { type: "string", enum: ["all", "externalOnly", "none"], description: "Explicit Google Calendar guest notification mode" },
        },
        required: ["event_id", "send_updates"],
        additionalProperties: false,
      },
    },
  ];
}

function eventIdentity(args: ToolArgs) {
  return {
    calendarId: args?.calendar_id === undefined ? "primary" : nonemptyString(args.calendar_id, "calendar_id"),
    eventId: nonemptyString(args?.event_id, "event_id"),
  };
}

function validateFields(args: ToolArgs, name: string) {
  const properties = calendarEventToolDefinitions({}).find((tool) => tool.name === name)!.inputSchema.properties;
  for (const key of Object.keys(args ?? {})) {
    if (!Object.hasOwn(properties, key)) throw new Error(`Unsupported field: ${key}`);
  }
  if (args?.account !== undefined) nonemptyString(args.account, "account");
}

function nonemptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`${field} must be a non-empty string without newlines`);
  }
  return value.trim();
}

function response(value: unknown, isError = false) {
  return { ...(isError ? { isError: true } : {}), content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function validateEvent(event: calendar_v3.Schema$Event, eventId: string) {
  if (event.id !== eventId || event.status === "cancelled") {
    throw new Error("Calendar returned a missing, cancelled, or mismatched event");
  }
}

export async function runCalendarGet(calendar: calendar_v3.Calendar, args: ToolArgs) {
  validateFields(args, "calendar_get");
  const identity = eventIdentity(args);
  const { data } = await calendar.events.get(identity, requestOptions);
  validateEvent(data, identity.eventId);
  return response({ ...identity, event: data });
}

export async function runCalendarUpdate(calendar: calendar_v3.Calendar, args: ToolArgs) {
  validateFields(args, "calendar_update");
  const identity = eventIdentity(args);
  const sendUpdates = nonemptyString(args?.send_updates, "send_updates");
  if (!["all", "externalOnly", "none"].includes(sendUpdates)) {
    throw new Error("send_updates must be all, externalOnly, or none");
  }
  const patch = buildPatch(args);
  const expectedEtag = args?.etag === undefined ? undefined : nonemptyString(args.etag, "etag");
  const { data: current } = await calendar.events.get(identity, requestOptions);
  validateEvent(current, identity.eventId);
  if (current.recurrence?.length) throw new Error("Recurring series edits are unsupported; use an exact occurrence ID");
  const etag = nonemptyString(current.etag, "event etag");
  if (expectedEtag !== undefined && etag !== expectedEtag) throw new Error("Event changed since calendar_get; read it again before updating");
  if (patch.start && patch.end) {
    if (current.start?.date || current.end?.date) throw new Error("Cannot retime an all-day event with timed start/end");
    // Preserve each existing zone when the caller only changes the instants.
    patch.start.timeZone ??= current.start?.timeZone;
    patch.end.timeZone ??= current.end?.timeZone;
  }
  try {
    await calendar.events.patch({ ...identity, sendUpdates, requestBody: patch }, {
      ...requestOptions, headers: { "If-Match": etag },
    });
  } catch (error) {
    const code = (error as { response?: { status?: number } })?.response?.status;
    return response({ ...identity, status: code === 412 ? "conflict" : "update_not_verified", verified: false,
      message: code === 412 ? "Concurrent edit rejected. Read calendar_get before retrying." : "Update did not complete reliably. Read calendar_get before retrying; the update may have been applied." }, true);
  }
  try {
    const { data: saved } = await calendar.events.get(identity, requestOptions);
    validateEvent(saved, identity.eventId);
    if (!matchesPatch(saved, patch)) throw new Error("Read-back does not match requested fields");
    return response({ ...identity, status: "updated", verified: true, event: saved });
  } catch {
    return response({ ...identity, status: "updated_unverified", verified: false,
      message: "Google accepted the update, but read-back verification failed. Use calendar_get to inspect the event; do not blindly repeat the update." }, true);
  }
}

function buildPatch(args: ToolArgs): calendar_v3.Schema$Event {
  const patch: calendar_v3.Schema$Event = {};
  if (args?.summary !== undefined) patch.summary = nonemptyString(args.summary, "summary");
  for (const key of ["description", "location"] as const) {
    if (args?.[key] !== undefined) {
      if (typeof args[key] !== "string") throw new Error(`${key} must be a string`);
      patch[key] = args[key];
    }
  }
  if (args?.start !== undefined || args?.end !== undefined) {
    patch.start = { dateTime: timestamp(args.start, "start") };
    patch.end = { dateTime: timestamp(args.end, "end") };
    if (patch.start.dateTime! >= patch.end.dateTime!) throw new Error("start must precede end");
  }
  if (args?.time_zone !== undefined) {
    if (!patch.start || !patch.end) throw new Error("time_zone requires start and end");
    const zone = nonemptyString(args.time_zone, "time_zone");
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); }
    catch { throw new Error("time_zone must be a valid IANA time zone"); }
    patch.start.timeZone = zone;
    patch.end.timeZone = zone;
  }
  if (!Object.keys(patch).length) throw new Error("At least one event field must be supplied");
  return patch;
}

function timestamp(value: unknown, field: string): string {
  const text = nonemptyString(value, field);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(text);
  const parsed = Date.parse(text);
  if (!match || !Number.isFinite(parsed)) throw new Error(`${field} must be an ISO timestamp with offset`);
  const [, year, month, day, hour, minute, second] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59) {
    throw new Error(`${field} must be a valid calendar timestamp`);
  }
  return new Date(parsed).toISOString();
}

function matchesPatch(saved: calendar_v3.Schema$Event, patch: calendar_v3.Schema$Event): boolean {
  return Object.entries(patch).every(([key, value]) => {
    if (key === "start" || key === "end") {
      const expected = value as calendar_v3.Schema$EventDateTime;
      return Date.parse(saved[key]?.dateTime || "") === Date.parse(expected.dateTime || "")
        && (!expected.timeZone || saved[key]?.timeZone === expected.timeZone);
    }
    // Google may omit a field cleared with an empty string.
    return (saved[key as keyof calendar_v3.Schema$Event] ?? "") === value;
  });
}
