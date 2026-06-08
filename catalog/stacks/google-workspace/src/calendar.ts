type CalendarCreateArgs = Record<string, unknown>;

export type CalendarEventInsert = {
  calendarId: string;
  conferenceDataVersion?: number;
  sendUpdates?: string;
  requestBody: {
    summary: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    description?: string;
    location?: string;
    attendees?: Array<{ email: string }>;
    conferenceData?: {
      createRequest: {
        requestId: string;
        conferenceSolutionKey: { type: "hangoutsMeet" };
      };
    };
  };
};

export function buildCalendarEventInsert(args: CalendarCreateArgs): CalendarEventInsert {
  const attendees = optionalStringArray(args.attendees, "attendees").map((email) => ({ email }));
  const createMeet = args.create_meet === true;
  const sendUpdates = optionalEnum(args.send_updates, "send_updates", ["all", "externalOnly", "none"]);
  const calendarId = optionalString(args.calendar_id, "calendar_id") || "primary";
  const timeZone = optionalString(args.time_zone, "time_zone");

  const requestBody: CalendarEventInsert["requestBody"] = {
    summary: requireString(args.summary, "summary"),
    start: { dateTime: requireString(args.start, "start") },
    end: { dateTime: requireString(args.end, "end") },
  };

  if (timeZone) {
    requestBody.start.timeZone = timeZone;
    requestBody.end.timeZone = timeZone;
  }

  const description = optionalString(args.description, "description");
  const location = optionalString(args.location, "location");
  if (description) requestBody.description = description;
  if (location) requestBody.location = location;
  if (attendees.length > 0) requestBody.attendees = attendees;
  if (createMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: makeConferenceRequestId(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const insert: CalendarEventInsert = { calendarId, requestBody };
  if (createMeet) insert.conferenceDataVersion = 1;
  if (sendUpdates) insert.sendUpdates = sendUpdates;
  return insert;
}

export function makeConferenceRequestId(): string {
  return `rudi-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        throw new Error(`${field}[${index}] must be a non-empty string`);
      }
      return entry.trim();
    });
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  throw new Error(`${field} must be an array of strings or a comma-separated string`);
}

function optionalEnum(value: unknown, field: string, allowed: string[]): string | undefined {
  const stringValue = optionalString(value, field);
  if (!stringValue) return undefined;
  if (!allowed.includes(stringValue)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return stringValue;
}
