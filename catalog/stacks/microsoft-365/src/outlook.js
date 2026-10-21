import { SafeError, accountAlias } from './contracts.js';
import { identifier, continuation } from './graph.js';

const SUMMARY = ['id', 'subject', 'from', 'toRecipients', 'receivedDateTime', 'sentDateTime', 'hasAttachments', 'isRead', 'bodyPreview', 'conversationId', 'internetMessageId', 'webLink'];
const ATTACHMENT = ['id', 'name', 'contentType', 'size', 'isInline', 'lastModifiedDateTime'];

export class Outlook {
  constructor(accounts) { this.accounts = accounts; }

  async list(input, search = false) {
    accountAlias(input.account);
    const limit = integer(input.limit ?? 20, 1, 50, 'limit');
    const parameters = { '$select': SUMMARY.join(','), '$top': String(limit) };
    if (search) {
      if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 500 || /[\x00-\x1f\x7f]/.test(input.query)) {
        throw new SafeError('INPUT', 'Search query must contain 1–500 characters without control characters.');
      }
      parameters.$search = JSON.stringify(input.query);
    } else parameters.$orderby = 'receivedDateTime desc';
    return this.page(input, '/me/messages', parameters, limit, SUMMARY, search);
  }

  async page(input, endpoint, parameters, limit, fields, search = false) {
    const nextLink = decodeCursor(input.cursor, input.account, endpoint, parameters);
    return this.accounts.withAuthorized(input.account, async graph => {
      const data = await graph.get(endpoint, parameters, nextLink);
      if (!Array.isArray(data.value) || data.value.length > limit) throw new SafeError('GRAPH_PAYLOAD', 'Graph returned an invalid or oversized page.');
      const next = data['@odata.nextLink'];
      if (next !== undefined && typeof next !== 'string') throw new SafeError('CONTINUATION', 'Invalid continuation returned by Graph.');
      if (next) continuation(endpoint, parameters, next);
      return { account: input.account, items: data.value.map(item => project(item, fields)), has_more: Boolean(next),
        next_cursor: next ? encodeCursor(input.account, endpoint, parameters, next) : null,
        completeness: search ? 'provider_limited_search' : (next ? 'more_pages_available' : 'end_of_collection'),
        ...(search ? { search_result_cap: 1000, note: 'Graph mail search returns at most 1,000 matches. End of pagination does not prove all mailbox matches were returned.' } : {}) };
    });
  }

  async read(input) {
    accountAlias(input.account);
    const message = identifier(input.message_id);
    const max = integer(input.max_body_chars ?? 20000, 1, 100000, 'max_body_chars');
    return this.accounts.withAuthorized(input.account, async graph => {
      const data = await graph.get(`/me/messages/${message}`, { '$select': [...SUMMARY, 'ccRecipients', 'replyTo', 'body'].join(',') });
      const result = project(data, [...SUMMARY, 'ccRecipients', 'replyTo']);
      if (typeof data.body?.content !== 'string' || !['text', 'html'].includes(data.body.contentType?.toLowerCase())) {
        throw new SafeError('GRAPH_PAYLOAD', 'Graph returned an invalid message body.');
      }
      return { account: input.account, message: { ...result, body: { contentType: data.body.contentType, content: data.body.content.slice(0, max) } },
        body_truncated: data.body.content.length > max, body_characters: data.body.content.length };
    });
  }

  async attachments(input) {
    accountAlias(input.account);
    const message = identifier(input.message_id);
    const limit = integer(input.limit ?? 20, 1, 50, 'limit');
    return this.page(input, `/me/messages/${message}/attachments`, { '$select': ATTACHMENT.join(','), '$top': String(limit) }, limit, ATTACHMENT);
  }
}

export function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new SafeError('INPUT', `${name} must be an integer from ${min} to ${max}.`);
  return value;
}

export function project(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !value.id || value.id.length > 2048) {
    throw new SafeError('GRAPH_PAYLOAD', 'Graph returned an invalid resource.');
  }
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]]));
}

function encodeCursor(account, endpoint, parameters, nextLink) {
  return Buffer.from(JSON.stringify({ version: 1, account, endpoint, parameters, nextLink })).toString('base64url');
}

function decodeCursor(cursor, account, endpoint, parameters) {
  if (cursor === undefined) return null;
  let value;
  try {
    if (typeof cursor !== 'string' || cursor.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (value.version !== 1 || value.account !== account || value.endpoint !== endpoint ||
        JSON.stringify(value.parameters) !== JSON.stringify(parameters) || typeof value.nextLink !== 'string') throw new Error();
  } catch { throw new SafeError('CONTINUATION', 'Invalid continuation or changed account/query/page size.'); }
  continuation(endpoint, parameters, value.nextLink);
  return value.nextLink;
}
