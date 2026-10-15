export const availabilityTool = {
  name: 'booking_pages_get_availability',
  description: 'Read published bookable slots from a public Google booking page in a fresh unsigned-in browser. No calendar credentials, reservations or bookings. Other providers are unsupported.',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  inputSchema: {
    type: 'object', additionalProperties: false,
    required: ['url', 'duration_minutes', 'from', 'through', 'timezone'],
    properties: {
      url: { type: 'string', maxLength: 2048, description: 'Public Google booking landing page or schedule URL.' },
      duration_minutes: { type: 'integer', minimum: 5, maximum: 480 },
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'First date in the requested timezone.' },
      through: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Last date inclusive; at most 31 days per call.' },
      timezone: { type: 'string', description: 'IANA timezone matching the booking page display, for example America/New_York. A mismatch fails verification.' },
      event_title: { type: 'string', minLength: 1, maxLength: 200, description: 'Exact meeting title when several schedules share a duration.' },
      expected_owner: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional exact displayed owner name.' },
      timeout_seconds: { type: 'number', minimum: 1, maximum: 25, default: 25 },
    },
  },
};
