export const DEFAULT_TASKLIST_ID = "@default";

const TASK_STATUS_VALUES = ["needsAction", "completed"] as const;

type TaskStatus = typeof TASK_STATUS_VALUES[number];
type TaskArgs = Record<string, unknown>;

export type TaskInsertParams = {
  tasklist: string;
  parent?: string;
  previous?: string;
  requestBody: {
    title: string;
    notes?: string;
    due?: string;
  };
};

export type TaskListParams = {
  tasklist: string;
  maxResults?: number;
  pageToken?: string;
  showCompleted?: boolean;
  showDeleted?: boolean;
  showHidden?: boolean;
  completedMax?: string;
  completedMin?: string;
  dueMax?: string;
  dueMin?: string;
  updatedMin?: string;
};

export type TaskListListsParams = {
  maxResults?: number;
  pageToken?: string;
};

export type TaskPatchParams = {
  tasklist: string;
  task: string;
  requestBody: {
    title?: string;
    notes?: string | null;
    due?: string | null;
    status?: TaskStatus;
  };
};

export function buildTaskListsList(args: TaskArgs): TaskListListsParams {
  const params: TaskListListsParams = {};
  const maxResults = optionalInteger(args.max_results, "max_results", 1, 100);
  const pageToken = optionalString(args.next_page_token, "next_page_token");

  if (maxResults != null) params.maxResults = maxResults;
  if (pageToken) params.pageToken = pageToken;
  return params;
}

export function buildTaskList(args: TaskArgs): TaskListParams {
  const params: TaskListParams = {
    tasklist: optionalString(args.tasklist_id, "tasklist_id") || DEFAULT_TASKLIST_ID,
  };

  const maxResults = optionalInteger(args.max_results, "max_results", 1, 100);
  if (maxResults != null) params.maxResults = maxResults;

  const pageToken = optionalString(args.next_page_token, "next_page_token");
  if (pageToken) params.pageToken = pageToken;

  assignOptionalBoolean(params, args, "show_completed", "showCompleted");
  assignOptionalBoolean(params, args, "show_deleted", "showDeleted");
  assignOptionalBoolean(params, args, "show_hidden", "showHidden");
  assignOptionalDateTime(params, args, "completed_max", "completedMax");
  assignOptionalDateTime(params, args, "completed_min", "completedMin");
  assignOptionalDateTime(params, args, "due_max", "dueMax");
  assignOptionalDateTime(params, args, "due_min", "dueMin");
  assignOptionalDateTime(params, args, "updated_min", "updatedMin");

  return params;
}

export function buildTaskInsert(args: TaskArgs): TaskInsertParams {
  const requestBody: TaskInsertParams["requestBody"] = {
    title: requireString(args.title, "title"),
  };

  const notes = optionalString(args.notes, "notes");
  const due = optionalRfc3339DateTime(args.due, "due");
  const tasklist = optionalString(args.tasklist_id, "tasklist_id") || DEFAULT_TASKLIST_ID;
  const parent = optionalString(args.parent, "parent");
  const previous = optionalString(args.previous, "previous");

  if (notes) requestBody.notes = notes;
  if (due) requestBody.due = due;

  const params: TaskInsertParams = { tasklist, requestBody };
  if (parent) params.parent = parent;
  if (previous) params.previous = previous;
  return params;
}

export function buildTaskPatch(args: TaskArgs): TaskPatchParams {
  const requestBody: TaskPatchParams["requestBody"] = {};
  const title = optionalString(args.title, "title");
  const notes = optionalNullableString(args.notes, "notes");
  const due = optionalNullableRfc3339DateTime(args.due, "due");
  const status = optionalEnum(args.status, "status", TASK_STATUS_VALUES);

  if (title) requestBody.title = title;
  if (notes !== undefined) requestBody.notes = notes;
  if (due !== undefined) requestBody.due = due;
  if (status) requestBody.status = status;

  if (Object.keys(requestBody).length === 0) {
    throw new Error("At least one of title, notes, due, or status is required");
  }

  return {
    tasklist: optionalString(args.tasklist_id, "tasklist_id") || DEFAULT_TASKLIST_ID,
    task: requireString(args.task_id, "task_id"),
    requestBody,
  };
}

export function buildTaskComplete(args: TaskArgs): TaskPatchParams {
  return buildTaskPatch({ ...args, status: "completed" });
}

export function buildTaskDelete(args: TaskArgs): { tasklist: string; task: string } {
  return {
    tasklist: optionalString(args.tasklist_id, "tasklist_id") || DEFAULT_TASKLIST_ID,
    task: requireString(args.task_id, "task_id"),
  };
}

export function summarizeTask(task: Record<string, unknown>) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    notes: task.notes,
    due: task.due,
    completed: task.completed,
    updated: task.updated,
    parent: task.parent,
    position: task.position,
    webViewLink: task.webViewLink,
    selfLink: task.selfLink,
  };
}

export function summarizeTaskList(taskList: Record<string, unknown>) {
  return {
    id: taskList.id,
    title: taskList.title,
    updated: taskList.updated,
    selfLink: taskList.selfLink,
  };
}

function assignOptionalBoolean(
  params: Record<string, unknown>,
  args: TaskArgs,
  inputField: string,
  outputField: string
) {
  const value = optionalBoolean(args[inputField], inputField);
  if (value !== undefined) params[outputField] = value;
}

function assignOptionalDateTime(
  params: Record<string, unknown>,
  args: TaskArgs,
  inputField: string,
  outputField: string
) {
  const value = optionalRfc3339DateTime(args[inputField], inputField);
  if (value) params[outputField] = value;
}

function requireString(value: unknown, field: string): string {
  const stringValue = optionalString(value, field);
  if (!stringValue) {
    throw new Error(`${field} is required`);
  }
  return stringValue;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === null) return null;
  return optionalString(value, field);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T
): T[number] | undefined {
  const stringValue = optionalString(value, field);
  if (!stringValue) return undefined;
  if (!allowed.includes(stringValue)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return stringValue;
}

function optionalRfc3339DateTime(value: unknown, field: string): string | undefined {
  const stringValue = optionalString(value, field);
  if (!stringValue) return undefined;
  validateRfc3339DateTime(stringValue, field);
  return stringValue;
}

function optionalNullableRfc3339DateTime(value: unknown, field: string): string | null | undefined {
  if (value === null) return null;
  return optionalRfc3339DateTime(value, field);
}

function validateRfc3339DateTime(value: string, field: string) {
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!rfc3339.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an RFC 3339 datetime`);
  }
}
