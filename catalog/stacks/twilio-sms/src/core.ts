import twilio from "twilio";

export const MAX_BODY_LENGTH = 1600;
export const DEFAULT_LIST_LIMIT = 10;
export const MAX_LIST_LIMIT = 50;

const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const API_KEY_SID_PATTERN = /^SK[0-9a-fA-F]{32}$/;
const MESSAGE_SID_PATTERN = /^SM[0-9a-fA-F]{32}$/;
const MESSAGING_SERVICE_SID_PATTERN = /^MG[0-9a-fA-F]{32}$/;

export type ToolArgs = Record<string, unknown> | undefined;

export interface EnvLike {
  [key: string]: string | undefined;
}

export interface ConfigStatus {
  account_sid_configured: boolean;
  auth_token_configured: boolean;
  api_key_sid_configured: boolean;
  api_key_secret_configured: boolean;
  api_key_pair_configured: boolean;
  from_number_configured: boolean;
  messaging_service_sid_configured: boolean;
  legacy_phone_number_configured: boolean;
  can_authenticate: boolean;
  can_send: boolean;
  send_blocker?: string;
}

export interface SendSmsInput {
  to: string;
  body: string;
  from?: string;
  messaging_service_sid?: string;
  confirm_send?: boolean;
}

export interface ListMessagesInput {
  limit?: number;
  to?: string;
  from?: string;
  date_sent_after?: Date;
  date_sent_before?: Date;
  include_body?: boolean;
}

export interface GetMessageInput {
  sid: string;
  include_body?: boolean;
}

export interface SmsCreateParams {
  to: string;
  body: string;
  from?: string;
  messagingServiceSid?: string;
}

export interface TwilioMessageLike {
  sid: string;
  status?: string | null;
  direction?: string | null;
  to?: string | null;
  from?: string | null;
  messagingServiceSid?: string | null;
  dateCreated?: Date | string | null;
  dateSent?: Date | string | null;
  dateUpdated?: Date | string | null;
  errorCode?: number | string | null;
  errorMessage?: string | null;
  price?: string | null;
  priceUnit?: string | null;
  body?: string | null;
}

export interface TwilioMessagesResource {
  create(params: SmsCreateParams): Promise<TwilioMessageLike>;
  list(params: Record<string, unknown>): Promise<TwilioMessageLike[]>;
  (sid: string): { fetch(): Promise<TwilioMessageLike> };
}

export interface TwilioClientLike {
  messages: TwilioMessagesResource;
}

export interface TwilioDependencies {
  env?: EnvLike;
  client?: TwilioClientLike;
}

export function getEnv(name: string, env: EnvLike = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function getDefaultFromNumber(env: EnvLike = process.env): string | undefined {
  return getEnv("TWILIO_FROM_NUMBER", env) || getEnv("TWILIO_PHONE_NUMBER", env);
}

export function getDefaultMessagingServiceSid(env: EnvLike = process.env): string | undefined {
  return getEnv("TWILIO_MESSAGING_SERVICE_SID", env);
}

export function getConfigStatus(env: EnvLike = process.env): ConfigStatus {
  const accountSid = getEnv("TWILIO_ACCOUNT_SID", env);
  const authToken = getEnv("TWILIO_AUTH_TOKEN", env);
  const apiKeySid = getEnv("TWILIO_API_KEY_SID", env);
  const apiKeySecret = getEnv("TWILIO_API_KEY_SECRET", env);
  const fromNumber = getEnv("TWILIO_FROM_NUMBER", env);
  const legacyPhoneNumber = getEnv("TWILIO_PHONE_NUMBER", env);
  const messagingServiceSid = getDefaultMessagingServiceSid(env);
  const apiKeyPairConfigured = Boolean(apiKeySid && apiKeySecret);
  const canAuthenticate = Boolean(accountSid && (authToken || apiKeyPairConfigured));
  const hasSender = Boolean(fromNumber || legacyPhoneNumber || messagingServiceSid);
  const canSend = canAuthenticate && hasSender;

  return {
    account_sid_configured: Boolean(accountSid),
    auth_token_configured: Boolean(authToken),
    api_key_sid_configured: Boolean(apiKeySid),
    api_key_secret_configured: Boolean(apiKeySecret),
    api_key_pair_configured: apiKeyPairConfigured,
    from_number_configured: Boolean(fromNumber),
    messaging_service_sid_configured: Boolean(messagingServiceSid),
    legacy_phone_number_configured: Boolean(legacyPhoneNumber),
    can_authenticate: canAuthenticate,
    can_send: canSend,
    send_blocker: canSend
      ? undefined
      : "Set TWILIO_ACCOUNT_SID, one credential method, and either TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.",
  };
}

export function getTwilioClient(env: EnvLike = process.env): TwilioClientLike {
  const accountSid = getEnv("TWILIO_ACCOUNT_SID", env);
  const authToken = getEnv("TWILIO_AUTH_TOKEN", env);
  const apiKeySid = getEnv("TWILIO_API_KEY_SID", env);
  const apiKeySecret = getEnv("TWILIO_API_KEY_SECRET", env);

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }
  if (!ACCOUNT_SID_PATTERN.test(accountSid)) {
    throw new Error("TWILIO_ACCOUNT_SID must be a Twilio Account SID beginning with AC");
  }
  if (authToken) {
    return twilio(accountSid, authToken) as unknown as TwilioClientLike;
  }
  if (apiKeySid && apiKeySecret) {
    if (!API_KEY_SID_PATTERN.test(apiKeySid)) {
      throw new Error("TWILIO_API_KEY_SID must be a Twilio API Key SID beginning with SK");
    }
    return twilio(apiKeySid, apiKeySecret, { accountSid }) as unknown as TwilioClientLike;
  }

  throw new Error("Configure TWILIO_AUTH_TOKEN or both TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET");
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function validateE164(phoneNumber: string, name: string): string {
  if (!E164_PATTERN.test(phoneNumber)) {
    throw new Error(`${name} must be an E.164 phone number such as +15551234567`);
  }
  return phoneNumber;
}

export function validateMessagingServiceSid(sid: string): string {
  if (!MESSAGING_SERVICE_SID_PATTERN.test(sid)) {
    throw new Error("messaging_service_sid must be a Twilio Messaging Service SID beginning with MG");
  }
  return sid;
}

export function validateMessageSid(sid: string): string {
  if (!MESSAGE_SID_PATTERN.test(sid)) {
    throw new Error("sid must be a Twilio message SID beginning with SM");
  }
  return sid;
}

export function validateBody(body: string): string {
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(`body must be ${MAX_BODY_LENGTH} characters or fewer`);
  }
  return body;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_LIST_LIMIT;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("limit must be an integer");
  }
  if (value < 1 || value > MAX_LIST_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_LIST_LIMIT}`);
  }
  return value;
}

function parseDate(value: unknown, name: string): Date | undefined {
  const raw = optionalString(value, name);
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be an ISO date or datetime`);
  }
  return date;
}

export function parseSendArgs(args: ToolArgs): SendSmsInput {
  const to = validateE164(requireString(args?.to, "to"), "to");
  const body = validateBody(requireString(args?.body, "body"));
  const from = optionalString(args?.from, "from");
  const messagingServiceSid = optionalString(args?.messaging_service_sid, "messaging_service_sid");

  if (from && messagingServiceSid) {
    throw new Error("Provide either from or messaging_service_sid, not both");
  }

  return {
    to,
    body,
    from: from ? validateE164(from, "from") : undefined,
    messaging_service_sid: messagingServiceSid ? validateMessagingServiceSid(messagingServiceSid) : undefined,
    confirm_send: args?.confirm_send === true,
  };
}

export function parseListArgs(args: ToolArgs): ListMessagesInput {
  const to = optionalString(args?.to, "to");
  const from = optionalString(args?.from, "from");

  return {
    limit: parseLimit(args?.limit),
    to: to ? validateE164(to, "to") : undefined,
    from: from ? validateE164(from, "from") : undefined,
    date_sent_after: parseDate(args?.date_sent_after, "date_sent_after"),
    date_sent_before: parseDate(args?.date_sent_before, "date_sent_before"),
    include_body: args?.include_body === true,
  };
}

export function parseGetArgs(args: ToolArgs): GetMessageInput {
  return {
    sid: validateMessageSid(requireString(args?.sid, "sid")),
    include_body: args?.include_body === true,
  };
}

export function maskPhone(phoneNumber?: string | null): string | undefined {
  if (!phoneNumber) {
    return undefined;
  }
  const trimmed = phoneNumber.trim();
  if (trimmed.length <= 5) {
    return "***";
  }
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-4)}`;
}

export function maskSid(sid?: string | null): string | undefined {
  if (!sid) {
    return undefined;
  }
  return `${sid.slice(0, 4)}...${sid.slice(-4)}`;
}

function normalizeDate(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolveSender(input: SendSmsInput, env: EnvLike) {
  const explicitFrom = input.from;
  const explicitMessagingServiceSid = input.messaging_service_sid;
  const envMessagingServiceSid = getDefaultMessagingServiceSid(env);
  const envFrom = getDefaultFromNumber(env);

  const messagingServiceSid = explicitMessagingServiceSid || (!explicitFrom ? envMessagingServiceSid : undefined);
  const from = messagingServiceSid ? undefined : explicitFrom || envFrom;

  if (from) {
    validateE164(from, "from");
  }
  if (messagingServiceSid) {
    validateMessagingServiceSid(messagingServiceSid);
  }

  return { from, messagingServiceSid };
}

function normalizeMessage(message: TwilioMessageLike, includeBody = false) {
  const body = typeof message.body === "string" ? message.body : undefined;

  return {
    sid: message.sid,
    status: message.status ?? null,
    direction: message.direction ?? null,
    to: maskPhone(message.to),
    from: maskPhone(message.from),
    messaging_service_sid: maskSid(message.messagingServiceSid),
    date_created: normalizeDate(message.dateCreated),
    date_sent: normalizeDate(message.dateSent),
    date_updated: normalizeDate(message.dateUpdated),
    error_code: message.errorCode ?? null,
    error_message: message.errorMessage ?? null,
    price: message.price ?? null,
    price_unit: message.priceUnit ?? null,
    body_length: body?.length ?? null,
    body: includeBody ? body ?? "" : undefined,
  };
}

export async function sendSms(input: SendSmsInput, deps: TwilioDependencies = {}) {
  const env = deps.env ?? process.env;
  const { from, messagingServiceSid } = resolveSender(input, env);

  if (!input.confirm_send) {
    return {
      sent: false,
      dry_run: true,
      reason: "Set confirm_send to true to send this SMS.",
      sender_configured: Boolean(from || messagingServiceSid),
      to: maskPhone(input.to),
      from: from ? maskPhone(from) : undefined,
      messaging_service_sid: messagingServiceSid ? maskSid(messagingServiceSid) : undefined,
      body_preview: input.body.length > 80 ? `${input.body.slice(0, 77)}...` : input.body,
      body_length: input.body.length,
    };
  }

  if (!from && !messagingServiceSid) {
    throw new Error("No sender configured. Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
  }

  const client = deps.client ?? getTwilioClient(env);
  const result = await client.messages.create({
    to: input.to,
    body: input.body,
    ...(messagingServiceSid ? { messagingServiceSid } : { from }),
  });

  return {
    sent: true,
    dry_run: false,
    sid: result.sid,
    status: result.status ?? null,
    direction: result.direction ?? null,
    to: maskPhone(result.to),
    from: maskPhone(result.from),
    messaging_service_sid: maskSid(result.messagingServiceSid),
    body_length: input.body.length,
  };
}

export async function listMessages(input: ListMessagesInput, deps: TwilioDependencies = {}) {
  const client = deps.client ?? getTwilioClient(deps.env);
  const request: Record<string, unknown> = {
    limit: input.limit ?? DEFAULT_LIST_LIMIT,
  };

  if (input.to) request.to = input.to;
  if (input.from) request.from = input.from;
  if (input.date_sent_after) request.dateSentAfter = input.date_sent_after;
  if (input.date_sent_before) request.dateSentBefore = input.date_sent_before;

  const messages = await client.messages.list(request);
  return messages.map((message) => normalizeMessage(message, input.include_body === true));
}

export async function getMessage(input: GetMessageInput, deps: TwilioDependencies = {}) {
  const client = deps.client ?? getTwilioClient(deps.env);
  const message = await client.messages(input.sid).fetch();
  return normalizeMessage(message, input.include_body === true);
}
