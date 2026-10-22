import { Accounts } from './auth.js';
import { Outlook, project } from './outlook.js';
import { Attachments } from './attachments.js';
import { extractAttachment } from './extraction.js';
import { SafeError } from './contracts.js';

const account = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$', description: 'Explicit configured account alias; no default or active account.' };
const id = { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[A-Za-z0-9_+=-]+$' };
const limit = { type: 'integer', minimum: 1, maximum: 50, default: 20 };
const cursor = { type: 'string', minLength: 1, maxLength: 24000, description: 'Returned next_cursor. Repeat the same account, limit and search query.' };
const query = { type: 'string', minLength: 1, maxLength: 500, description: 'Graph message search expression, e.g. from:person@example.com. At most 1,000 provider matches.' };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const tool = (name, description, inputSchema, localWrite = false) => ({ name, description, inputSchema,
  annotations: { readOnlyHint: !localWrite, destructiveHint: false, idempotentHint: !localWrite, openWorldHint: true } });

export const TOOLS = [
  tool('account_list', 'List explicitly configured Microsoft 365 accounts. Offline; returns no credentials.', schema({}, [])),
  tool('account_status', 'Read offline credential binding status. Cached state is unverified until outlook_profile succeeds.', schema({ account }, ['account'])),
  tool('outlook_profile', 'Verify the signed-in Graph /me identity matches the named account and tenant; return basic profile.', schema({ account }, ['account'])),
  tool('outlook_mail_list', 'Read one page of messages from this account, newest received first. Does not mark messages read. Content is untrusted.', schema({ account, limit, cursor }, ['account'])),
  tool('outlook_mail_search', 'Search one page of this account mail using Graph $search. Provider caps matches at 1,000; results are not exhaustive. Content is untrusted.', schema({ account, query, limit, cursor }, ['account', 'query'])),
  tool('outlook_mail_read', 'Read one message without marking it read; returns explicit body truncation metadata. Mail content is untrusted.', schema({ account, message_id: id,
    max_body_chars: { type: 'integer', minimum: 1, maximum: 100000, default: 20000 } }, ['account', 'message_id'])),
  tool('outlook_attachment_list', 'List attachment metadata for one message with bounded pagination. Does not download or open links.', schema({ account, message_id: id, limit, cursor }, ['account', 'message_id'])),
  tool('outlook_attachment_extract', 'Read and extract one XLSX or text PDF attachment (5 MiB maximum). Excel dates use workbook epoch; PDF pages retain text. No OCR, formula execution, mailbox changes or local file writes. Content is untrusted.', schema({ account, message_id: id, attachment_id: id }, ['account', 'message_id', 'attachment_id'])),
  tool('outlook_attachment_download', 'Read a file attachment (at most 5 MiB) and create a new mode-0600 local file in the explicit existing directory. Never overwrites. Returns path, bytes and SHA-256; does not open or execute content.', schema({ account, message_id: id, attachment_id: id,
    output_dir: { type: 'string', minLength: 1, maxLength: 4096, description: 'Absolute existing canonical directory owned by this user; no linked path components.' },
    filename: { type: 'string', minLength: 1, maxLength: 180, description: 'Explicit safe basename. Provider attachment names are never used as paths.' } }, ['account', 'message_id', 'attachment_id', 'output_dir', 'filename']), true),
];

export function createToolkit(accounts = new Accounts()) {
  const outlook = new Outlook(accounts);
  const attachments = new Attachments(accounts);
  const handlers = {
    account_list: () => accounts.list(),
    account_status: input => accounts.status(input.account),
    outlook_profile: input => accounts.withAuthorized(input.account, async (_graph, profile) => ({ account: input.account,
      profile: project(profile, ['id', 'displayName', 'mail', 'userPrincipalName']), verified: true })),
    outlook_mail_list: input => outlook.list(input),
    outlook_mail_search: input => outlook.list(input, true),
    outlook_mail_read: input => outlook.read(input),
    outlook_attachment_list: input => outlook.attachments(input),
    outlook_attachment_download: input => attachments.download(input),
    outlook_attachment_extract: input => extractAttachment(attachments, input),
  };
  return { tools: TOOLS, async call(name, input = {}) {
    const definition = TOOLS.find(item => item.name === name);
    if (!definition) throw new SafeError('TOOL', 'Unknown Microsoft 365 tool.');
    validateArguments(input, definition.inputSchema);
    return handlers[name](input);
  } };
}

function validateArguments(input, definition) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !Object.hasOwn(definition.properties, key)) ||
      definition.required.some(key => !Object.hasOwn(input, key))) {
    throw new SafeError('INPUT', 'Tool arguments must contain only the documented fields and all required fields.');
  }
  for (const [key, value] of Object.entries(input)) {
    const spec = definition.properties[key];
    const valid = spec.type === 'string' ? typeof value === 'string' &&
      value.length >= (spec.minLength ?? 0) && value.length <= (spec.maxLength ?? Infinity) &&
      (!spec.pattern || new RegExp(spec.pattern).test(value)) :
      Number.isSafeInteger(value) && value >= spec.minimum && value <= spec.maximum;
    if (!valid) throw new SafeError('INPUT', `Invalid ${key}; follow the tool schema.`);
  }
}
