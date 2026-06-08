type HeaderLike = {
  name?: string | null;
  value?: string | null;
};

type GmailMessageLike = {
  id?: string | null;
  threadId?: string | null;
  payload?: {
    headers?: HeaderLike[] | null;
  } | null;
};

type DraftMessageOptions = {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  body?: unknown;
  replyMessageId?: unknown;
  replyAll?: unknown;
  originalMessage?: GmailMessageLike | null;
  selfEmail?: string | null;
};

export type GmailDraftMessage = {
  raw: string;
  to: string;
  subject: string;
  cc?: string;
  bcc?: string;
  contentType?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
};

export type GmailRawMessageOptions = {
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject: unknown;
  body: unknown;
  contentType?: unknown;
  inReplyTo?: unknown;
  references?: unknown;
};

export const DEFAULT_GMAIL_CONTENT_TYPE = 'text/plain; charset="UTF-8"';

export function resolveRequestedAccount(
  args: Record<string, unknown> | undefined,
  currentAccount: string | null
): string | null {
  if (!args || args.account == null) return currentAccount;
  if (typeof args.account !== "string" || args.account.trim() === "") {
    throw new Error("account must be a non-empty string");
  }
  return sanitizeHeaderValue(args.account, "account");
}

export function buildGmailDraftMessage(options: DraftMessageOptions): GmailDraftMessage {
  const body = requireString(options.body, "body");
  const replyMessageId = optionalString(options.replyMessageId, "reply_message_id");

  if (!replyMessageId) {
    const to = requireHeaderSafeString(options.to, "to");
    const subject = requireHeaderSafeString(options.subject, "subject");
    const cc = optionalHeaderSafeString(options.cc, "cc");
    const bcc = optionalHeaderSafeString(options.bcc, "bcc");
    const contentType = inferGmailContentType(body);
    return {
      raw: buildGmailRawMessage({
        to,
        cc,
        bcc,
        subject,
        body,
        contentType,
      }),
      to,
      subject,
      cc,
      bcc,
      contentType,
    };
  }

  const originalMessage = options.originalMessage;
  if (!originalMessage) {
    throw new Error("originalMessage is required when reply_message_id is provided");
  }

  const headers = originalMessage.payload?.headers || [];
  const originalSubject = getHeader(headers, "Subject");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const referencesHeader = getHeader(headers, "References");
  const subject =
    optionalHeaderSafeString(options.subject, "subject") || buildReplySubject(originalSubject);
  const to =
    optionalHeaderSafeString(options.to, "to") ||
    buildReplyRecipients({
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      cc: getHeader(headers, "Cc"),
      replyAll: options.replyAll === true,
      selfEmail: options.selfEmail || "",
    });

  if (!to) {
    throw new Error("to is required because the original message has no reply recipient");
  }

  const references = buildReferencesHeader(referencesHeader, messageIdHeader);
  const cc = optionalHeaderSafeString(options.cc, "cc");
  const bcc = optionalHeaderSafeString(options.bcc, "bcc");
  const contentType = inferGmailContentType(body);

  return {
    raw: buildGmailRawMessage({
      to,
      cc,
      bcc,
      subject,
      body,
      contentType,
      inReplyTo: messageIdHeader || undefined,
      references,
    }),
    to,
    subject,
    cc,
    bcc,
    contentType,
    inReplyTo: messageIdHeader || undefined,
    references,
    threadId: originalMessage.threadId || undefined,
  };
}

export function buildGmailRawMessage(options: GmailRawMessageOptions): string {
  const body = requireString(options.body, "body");
  const contentType =
    optionalHeaderSafeString(options.contentType, "Content-Type") || inferGmailContentType(body);
  const lines = [
    `To: ${requireHeaderSafeString(options.to, "to")}`,
  ];
  const cc = optionalHeaderSafeString(options.cc, "cc");
  const bcc = optionalHeaderSafeString(options.bcc, "bcc");
  const inReplyTo = optionalHeaderSafeString(options.inReplyTo, "In-Reply-To");
  const references = optionalHeaderSafeString(options.references, "References");

  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${encodeMimeHeaderValue(requireHeaderSafeString(options.subject, "subject"))}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: ${contentType}`);
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("", encodeMimeBody(body));
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export function inferGmailContentType(body: string): string {
  return looksLikeHtml(body) ? "text/html; charset=utf-8" : DEFAULT_GMAIL_CONTENT_TYPE;
}

export function encodeMimeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return splitHeaderValue(value)
    .map((part) => `=?UTF-8?B?${Buffer.from(part, "utf-8").toString("base64")}?=`)
    .join("\r\n ");
}

export function encodeMimeBody(value: string): string {
  return wrapBase64(Buffer.from(normalizeMimeLineEndings(value), "utf-8").toString("base64"));
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function normalizeMimeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
}

function looksLikeHtml(body: string): boolean {
  return /<\/?(?:a|article|b|blockquote|body|br|div|em|h[1-6]|html|i|li|ol|p|pre|span|strong|table|tbody|td|th|thead|tr|ul)(?:\s|>|\/)/i.test(body);
}

function splitHeaderValue(value: string): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const char of Array.from(value)) {
    const candidate = chunk + char;
    if (chunk && Buffer.byteLength(candidate, "utf-8") > 45) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function buildReplySubject(subject: string): string {
  if (!subject) return "Re:";
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function buildReferencesHeader(references: string, messageId: string): string | undefined {
  if (!messageId) return references || undefined;
  return references ? `${references} ${messageId}` : messageId;
}

function buildReplyRecipients(options: {
  from: string;
  to: string;
  cc: string;
  replyAll: boolean;
  selfEmail: string;
}): string {
  const candidates = options.replyAll
    ? splitAddressList([options.from, options.to, options.cc].filter(Boolean).join(", "))
    : splitAddressList(options.from);
  const self = normalizeEmailAddress(options.selfEmail);
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const candidate of candidates) {
    const identity = normalizeEmailAddress(candidate);
    if (!identity || identity === self || seen.has(identity)) continue;
    seen.add(identity);
    recipients.push(candidate);
  }

  return recipients.join(", ");
}

function splitAddressList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

function getHeader(headers: HeaderLike[], name: string): string {
  const value = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
  return sanitizeHeaderValue(value, name);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalHeaderSafeString(value: unknown, field: string): string | undefined {
  const stringValue = optionalString(value, field);
  return stringValue ? sanitizeHeaderValue(stringValue, field) : undefined;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requireHeaderSafeString(value: unknown, field: string): string {
  return sanitizeHeaderValue(requireString(value, field).trim(), field);
}

function sanitizeHeaderValue(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${field} must not contain newlines`);
  }
  return value.trim();
}
