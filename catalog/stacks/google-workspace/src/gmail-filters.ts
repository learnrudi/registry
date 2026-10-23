import type { gmail_v1 } from "googleapis";

type ToolArgs = Record<string, unknown> | undefined;
class FilterInputError extends Error {}
const requestOptions = { timeout: 30_000, retry: false };
const stringInput = { type: "string", minLength: 1, maxLength: 4096 };
const criteriaProperties = {
  from: stringInput, to: stringInput, subject: stringInput, query: stringInput, negatedQuery: stringInput,
  hasAttachment: { type: "boolean" }, excludeChats: { type: "boolean" },
  size: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  sizeComparison: { type: "string", enum: ["smaller", "larger"] },
};
const labelArrayInput = { type: "array", items: stringInput, maxItems: 100, uniqueItems: true };
const actionProperties = { addLabelIds: labelArrayInput, removeLabelIds: labelArrayInput, forward: stringInput };

export function gmailFilterToolDefinitions(accountInput: Record<string, unknown>) {
  return [{
    name: "gmail_filter_list",
    description: "List incoming-mail filters after verifying the explicitly selected mailbox. Read-only.",
    inputSchema: {
      type: "object", properties: { account: accountInput },
      required: ["account"], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, {
    name: "gmail_filter_get",
    description: "Inspect one exact incoming-mail filter in the verified mailbox. Read-only.",
    inputSchema: {
      type: "object", properties: { account: accountInput, filter_id: { type: "string", minLength: 1 } },
      required: ["account", "filter_id"], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, {
    name: "gmail_filter_preview",
    description: "Read-only sample of a candidate Gmail search query. Counts are estimates; this is not a simulation of structured filter criteria or future delivery. Excludes spam/trash and preserves unread state.",
    inputSchema: {
      type: "object", properties: {
        account: accountInput, query: { type: "string", minLength: 1 },
        max_results: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        next_page_token: { type: "string", minLength: 1 },
      }, required: ["account", "query"], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, {
    name: "gmail_filter_create",
    description: "Create an authorized incoming-mail filter and verify it by read-back. Uses label IDs, not names. Does not apply to old messages. Requires gmail.settings.basic consent. Never blindly retry uncertain results.",
    inputSchema: {
      type: "object", properties: {
        account: accountInput,
        criteria: { type: "object", properties: criteriaProperties, additionalProperties: false, minProperties: 1 },
        action: { type: "object", properties: actionProperties, additionalProperties: false, minProperties: 1 },
      }, required: ["account", "criteria", "action"], additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, {
    name: "gmail_filter_delete",
    description: "Permanently delete one explicitly authorized filter and verify its absence. Does not delete messages. Never blindly retry uncertain results.",
    inputSchema: {
      type: "object", properties: { account: accountInput, filter_id: { type: "string", minLength: 1 } },
      required: ["account", "filter_id"], additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }];
}

export async function runGmailFilterTool(name: string, gmail: gmail_v1.Gmail, args: ToolArgs) {
  try {
    return await executeFilterTool(name, gmail, args);
  } catch (error) {
    if (error instanceof FilterInputError) throw error;
    return response({ status: "request_failed", ...scopeHint(error),
      message: "Gmail filter request failed. Check account authorization, the filter ID and provider availability. No application retry was attempted.",
    }, true);
  }
}

async function executeFilterTool(name: string, gmail: gmail_v1.Gmail, args: ToolArgs) {
  const definition = gmailFilterToolDefinitions({}).find(tool => tool.name === name);
  if (!definition) throw new FilterInputError(`Unknown Gmail filter tool: ${name}`);
  for (const key of Object.keys(args ?? {})) {
    if (!Object.hasOwn(definition.inputSchema.properties, key)) throw new FilterInputError(`Unsupported field: ${key}`);
  }
  const account = text(args?.account, "account").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) throw new FilterInputError("account must be an explicit mailbox email address");
  const id = name === "gmail_filter_get" || name === "gmail_filter_delete" ? text(args?.filter_id, "filter_id") : undefined;
  const query = name === "gmail_filter_preview" ? text(args?.query, "query") : undefined;
  const maxResults = name === "gmail_filter_preview" ? boundedInteger(args?.max_results === undefined ? 20 : args.max_results, "max_results", 1, 100) : undefined;
  const pageToken = args?.next_page_token === undefined ? undefined : text(args.next_page_token, "next_page_token");
  const rule = name === "gmail_filter_create" ? buildRule(args?.criteria, args?.action) : undefined;
  const { data: profile } = await gmail.users.getProfile({ userId: "me" }, requestOptions);
  if (profile.emailAddress?.toLowerCase() !== account) throw new FilterInputError("Authenticated Gmail profile does not match account");
  if (rule) return createFilter(gmail, account, rule);
  if (name === "gmail_filter_delete") return deleteFilter(gmail, account, id!);
  if (query) {
    const { data } = await gmail.users.messages.list({ userId: "me", q: query, maxResults, pageToken, includeSpamTrash: false }, requestOptions);
    if (data.messages != null && !Array.isArray(data.messages)) throw new FilterInputError("Gmail returned malformed preview messages");
    const messages = (data.messages ?? []).map(message => ({ id: text(message.id, "message.id"), threadId: text(message.threadId, "message.threadId") }));
    return response({ account, query, approximate: true, messages,
      resultSizeEstimate: data.resultSizeEstimate ?? 0,
      ...(data.nextPageToken ? { nextPageToken: text(data.nextPageToken, "nextPageToken") } : {}),
      note: "Search sample only; not an exact filter simulation. Spam/trash excluded. No messages or filters changed.",
    });
  }
  if (id) {
    const { data } = await gmail.users.settings.filters.get({ userId: "me", id }, requestOptions);
    return response({ account, filter: checkedFilter(data, id) });
  }
  const { data } = await gmail.users.settings.filters.list({ userId: "me" }, requestOptions);
  const filters = data.filter ?? [];
  if (!Array.isArray(filters)) throw new FilterInputError("Gmail returned a malformed filter list");
  return response({ account, filters: filters.map(filter => checkedFilter(filter)) });
}

function checkedFilter(value: gmail_v1.Schema$Filter, expectedId?: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FilterInputError("Gmail returned a malformed filter");
  const id = text(value.id, "filter.id");
  if (expectedId !== undefined && id !== expectedId) throw new FilterInputError("Gmail returned a mismatched filter ID");
  return { id, criteria: record(value.criteria ?? {}, "filter.criteria"), action: record(value.action ?? {}, "filter.action") };
}

function buildRule(rawCriteria: unknown, rawAction: unknown): gmail_v1.Schema$Filter {
  const criteria = record(rawCriteria, "criteria", criteriaProperties);
  for (const key of ["from", "to", "subject", "query", "negatedQuery"]) {
    if (criteria[key] !== undefined) criteria[key] = text(criteria[key], `criteria.${key}`);
  }
  for (const key of ["hasAttachment", "excludeChats"]) {
    if (criteria[key] !== undefined && typeof criteria[key] !== "boolean") throw new FilterInputError(`criteria.${key} must be a boolean`);
  }
  if (criteria.size !== undefined || criteria.sizeComparison !== undefined) {
    criteria.size = boundedInteger(criteria.size, "criteria.size", 1, Number.MAX_SAFE_INTEGER);
    if (!["smaller", "larger"].includes(criteria.sizeComparison as string)) throw new FilterInputError("criteria.sizeComparison must be smaller or larger when size is supplied");
  }
  if (!Object.values(criteria).some(value => value !== false)) throw new FilterInputError("criteria must contain at least one effective matching condition");
  const action = record(rawAction, "action", actionProperties);
  const add = labelIds(action.addLabelIds, "action.addLabelIds");
  const remove = labelIds(action.removeLabelIds, "action.removeLabelIds");
  if (add.some(id => remove.includes(id))) throw new FilterInputError("A label cannot be both added and removed");
  if (action.addLabelIds !== undefined) action.addLabelIds = add;
  if (action.removeLabelIds !== undefined) action.removeLabelIds = remove;
  if (action.forward !== undefined) {
    action.forward = text(action.forward, "action.forward");
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(action.forward as string)) throw new FilterInputError("action.forward must be one verified forwarding email address");
  }
  if (!add.length && !remove.length && !action.forward) throw new FilterInputError("action must add/remove labels or forward to a verified address");
  return { criteria, action };
}

async function createFilter(gmail: gmail_v1.Gmail, account: string, rule: gmail_v1.Schema$Filter) {
  const ids = [...(rule.action?.addLabelIds ?? []), ...(rule.action?.removeLabelIds ?? [])];
  if (ids.length) {
    const { data } = await gmail.users.labels.list({ userId: "me" }, requestOptions);
    if (!Array.isArray(data.labels)) throw new FilterInputError("Gmail returned a malformed label list");
    for (const id of ids) {
      if (!data.labels.some(label => label.id === id)) throw new FilterInputError(`Unknown Gmail label ID: ${id}; use gmail_label_list`);
    }
    const userLabels = rule.action?.addLabelIds?.filter(id => data.labels!.some(label => label.id === id && label.type === "user")) ?? [];
    if (userLabels.length > 1) throw new FilterInputError("Only one user-defined label can be added per filter");
  }
  let id: string;
  try {
    const { data } = await gmail.users.settings.filters.create({ userId: "me", requestBody: rule }, requestOptions);
    id = text(data.id, "created filter.id");
  } catch (error) {
    return response({ account, status: "create_not_verified", verified: false, ...scopeHint(error),
      message: "Creation did not complete reliably and may have been applied. Inspect gmail_filter_list before retrying.",
    }, true);
  }
  try {
    const { data } = await gmail.users.settings.filters.get({ userId: "me", id }, requestOptions);
    const saved = checkedFilter(data, id);
    if (canonical(saved.criteria) !== canonical(rule.criteria) || canonical(saved.action) !== canonical(rule.action)) throw new FilterInputError("Filter read-back mismatch");
    return response({ account, status: "created", verified: true, filter: saved });
  } catch {
    return response({ account, filterId: id, status: "created_unverified", verified: false,
      message: "Gmail accepted creation, but read-back failed or differed. Inspect gmail_filter_get/list; do not repeat creation blindly.",
    }, true);
  }
}

async function deleteFilter(gmail: gmail_v1.Gmail, account: string, id: string) {
  const filters = gmail.users.settings.filters;
  const { data } = await filters.get({ userId: "me", id }, requestOptions);
  checkedFilter(data, id);
  try {
    await filters.delete({ userId: "me", id }, requestOptions);
  } catch (error) {
    return response({ account, filterId: id, status: "delete_not_verified", verified: false, ...scopeHint(error),
      message: "Deletion did not complete reliably and may have been applied. Inspect gmail_filter_get/list before retrying.",
    }, true);
  }
  try {
    await filters.get({ userId: "me", id }, requestOptions);
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      return response({ account, filterId: id, status: "deleted", verified: true });
    }
  }
  return response({ account, filterId: id, status: "deleted_unverified", verified: false,
    message: "Gmail accepted deletion, but absence was not verified. Inspect gmail_filter_get/list before retrying.",
  }, true);
}

function canonical(value: unknown): string {
  const object = record(value ?? {}, "filter fields");
  return JSON.stringify(Object.entries(object).filter(([, v]) => v !== false && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([key, v]) => [key, Array.isArray(v) ? [...v].sort() : key === "subject" && typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v])
    .sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function record(value: unknown, field: string, properties?: object): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FilterInputError(`${field} must be an object`);
  const result = { ...value } as Record<string, unknown>;
  if (properties) for (const key of Object.keys(result)) {
    if (!Object.hasOwn(properties, key)) throw new FilterInputError(`Unsupported ${field} field: ${key}`);
  }
  return result;
}

function labelIds(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new FilterInputError(`${field} must be an array of at most 100 label IDs`);
  const ids = value.map(id => text(id, field));
  if (new Set(ids).size !== ids.length) throw new FilterInputError(`${field} must contain unique label IDs`);
  return ids;
}

function scopeHint(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 403 ? { hint: "Filter settings require gmail.settings.basic. If scope consent is missing, reauthorize this exact account through rudi auth google-workspace; administrator policy can also deny access." } : {};
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\r\n\x00]/.test(value) || value.length > 4096) {
    throw new FilterInputError(`${field} must be a non-empty string without newlines (maximum 4096 characters)`);
  }
  return value.trim();
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new FilterInputError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function response(value: unknown, isError = false) {
  return { ...(isError ? { isError: true } : {}), content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
