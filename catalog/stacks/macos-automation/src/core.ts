import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const MAX_TITLE_LENGTH = 160;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_SHORTCUT_NAME_LENGTH = 160;
export const DEFAULT_COMMAND_TIMEOUT_MS = 15000;
export const MAX_WINDOW_LIMIT = 50;

export type ToolArgs = Record<string, unknown> | undefined;

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: NodeJS.Signals | null;
}

export interface CommandOptions {
  timeoutMs?: number;
  input?: string;
}

export interface CommandRunner {
  execFile(file: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
}

export interface MacosAutomationDependencies {
  runner?: CommandRunner;
  platform?: NodeJS.Platform | string;
}

export interface OpenUrlInput {
  url: string;
}

export interface AppInput {
  app_name: string;
}

export interface NotificationInput {
  title: string;
  message: string;
  subtitle?: string;
  sound_name?: string;
}

export interface ShortcutInput {
  name: string;
  input_path?: string;
  output_path?: string;
  output_type?: string;
  confirm_run: boolean;
}

export interface ReminderDateParts {
  year: number;
  month: number;
  day: number;
  seconds_since_midnight: number;
}

export interface ReminderInput {
  title: string;
  notes?: string;
  list_name?: string;
  due_at?: string;
  due_date_parts?: ReminderDateParts;
  confirm_create: boolean;
}

export interface PathInput {
  path: string;
}

export interface ListWindowsInput {
  app_name?: string;
  limit: number;
}

export interface ClassifiedMacosError {
  kind: "permission" | "not_found" | "unsupported_platform" | "command_failed";
  message: string;
  remediation?: string;
  stderr?: string;
  exitCode?: number;
}

export class MacosAutomationError extends Error {
  constructor(public readonly details: ClassifiedMacosError) {
    super(details.message);
    this.name = "MacosAutomationError";
  }
}

const defaultRunner: CommandRunner = {
  execFile(file: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
      const timer = setTimeout(() => {
        if (settled) return;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          exitCode: exitCode ?? (signal ? 1 : 0),
          signal,
        });
      });

      if (options.input !== undefined) {
        child.stdin.end(options.input);
      } else {
        child.stdin.end();
      }
    });
  },
};

function getRunner(deps: MacosAutomationDependencies = {}): CommandRunner {
  return deps.runner ?? defaultRunner;
}

function ensureMacos(deps: MacosAutomationDependencies = {}): void {
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin") {
    throw new MacosAutomationError({
      kind: "unsupported_platform",
      message: "This stack only supports macOS.",
      remediation: "Run this stack on macOS, or use a platform-specific automation stack.",
    });
  }
}

function trimCommandOutput(value: string): string {
  return value.replace(/\s+$/g, "");
}

function requireArgs(args: ToolArgs): Record<string, unknown> {
  return args ?? {};
}

function requireString(
  args: Record<string, unknown>,
  name: string,
  options: { maxLength?: number; allowNewline?: boolean } = {}
): string {
  const value = args[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return validateText(value.trim(), name, options);
}

function optionalString(
  args: Record<string, unknown>,
  name: string,
  options: { maxLength?: number; allowNewline?: boolean } = {}
): string | undefined {
  const value = args[name];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed ? validateText(trimmed, name, options) : undefined;
}

function validateText(
  value: string,
  name: string,
  options: { maxLength?: number; allowNewline?: boolean } = {}
): string {
  const maxLength = options.maxLength ?? MAX_MESSAGE_LENGTH;
  if (value.length > maxLength) {
    throw new Error(`${name} must be ${maxLength} characters or fewer`);
  }
  if (value.includes("\0")) {
    throw new Error(`${name} must not contain null bytes`);
  }
  if (!options.allowNewline && /[\r\n]/.test(value)) {
    throw new Error(`${name} must not contain newlines`);
  }
  if (/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    throw new Error(`${name} contains unsupported control characters`);
  }
  return value;
}

function optionalAbsolutePath(args: Record<string, unknown>, name: string): string | undefined {
  const value = optionalString(args, name, { maxLength: 2048 });
  if (!value) return undefined;
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return value;
}

function requireAbsolutePath(args: Record<string, unknown>, name: string): string {
  const value = requireString(args, name, { maxLength: 2048 });
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null) return 20;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("limit must be an integer");
  }
  if (value < 1 || value > MAX_WINDOW_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_WINDOW_LIMIT}`);
  }
  return value;
}

function parseDueDateParts(dueAt: string): ReminderDateParts {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("due_at must be an ISO date or datetime");
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    seconds_since_midnight:
      date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds(),
  };
}

function osascriptArgs(lines: string[], argv: string[] = []): string[] {
  return lines.flatMap((line) => ["-e", line]).concat(argv);
}

function checkCommand(result: CommandResult): CommandResult {
  if (result.exitCode !== 0) {
    throw new MacosAutomationError(classifyMacosError(result));
  }
  return result;
}

async function runCommand(
  file: string,
  args: string[],
  deps: MacosAutomationDependencies = {},
  options: CommandOptions = {}
): Promise<CommandResult> {
  ensureMacos(deps);
  const result = await getRunner(deps).execFile(file, args, {
    timeoutMs: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    input: options.input,
  });
  return checkCommand(result);
}

export function parseOpenUrlArgs(args: ToolArgs): OpenUrlInput {
  const raw = requireString(requireArgs(args), "url", { maxLength: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("url must be a valid http or https URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must be a valid http or https URL");
  }
  return { url: parsed.href };
}

export function parseAppArgs(args: ToolArgs): AppInput {
  return {
    app_name: requireString(requireArgs(args), "app_name", {
      maxLength: MAX_SHORTCUT_NAME_LENGTH,
    }),
  };
}

export function parseNotificationArgs(args: ToolArgs): NotificationInput {
  const parsedArgs = requireArgs(args);
  return {
    title: requireString(parsedArgs, "title", { maxLength: MAX_TITLE_LENGTH }),
    message: requireString(parsedArgs, "message", {
      maxLength: MAX_MESSAGE_LENGTH,
      allowNewline: true,
    }),
    subtitle: optionalString(parsedArgs, "subtitle", { maxLength: MAX_TITLE_LENGTH }),
    sound_name: optionalString(parsedArgs, "sound_name", { maxLength: 80 }),
  };
}

export function parseShortcutArgs(args: ToolArgs): ShortcutInput {
  const parsedArgs = requireArgs(args);
  return {
    name: requireString(parsedArgs, "name", { maxLength: MAX_SHORTCUT_NAME_LENGTH }),
    input_path: optionalAbsolutePath(parsedArgs, "input_path"),
    output_path: optionalAbsolutePath(parsedArgs, "output_path"),
    output_type: optionalString(parsedArgs, "output_type", { maxLength: 120 }),
    confirm_run: parsedArgs.confirm_run === true,
  };
}

export function parseReminderArgs(args: ToolArgs): ReminderInput {
  const parsedArgs = requireArgs(args);
  const dueAt = optionalString(parsedArgs, "due_at", { maxLength: 80 });
  return {
    title: requireString(parsedArgs, "title", { maxLength: MAX_TITLE_LENGTH }),
    notes: optionalString(parsedArgs, "notes", {
      maxLength: MAX_MESSAGE_LENGTH,
      allowNewline: true,
    }),
    list_name: optionalString(parsedArgs, "list_name", { maxLength: MAX_TITLE_LENGTH }),
    due_at: dueAt,
    due_date_parts: dueAt ? parseDueDateParts(dueAt) : undefined,
    confirm_create: parsedArgs.confirm_create === true,
  };
}

export function parsePathArgs(args: ToolArgs): PathInput {
  return {
    path: requireAbsolutePath(requireArgs(args), "path"),
  };
}

export function parseListWindowsArgs(args: ToolArgs): ListWindowsInput {
  const parsedArgs = requireArgs(args);
  return {
    app_name: optionalString(parsedArgs, "app_name", { maxLength: MAX_TITLE_LENGTH }),
    limit: parseLimit(parsedArgs.limit),
  };
}

export function classifyMacosError(error: unknown): ClassifiedMacosError {
  const maybeResult = error as Partial<CommandResult> | undefined;
  const rawMessage =
    maybeResult?.stderr ||
    maybeResult?.stdout ||
    (error instanceof Error ? error.message : String(error));
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("assistive access") ||
    normalized.includes("-25211") ||
    (normalized.includes("system events") && normalized.includes("not allowed"))
  ) {
    return {
      kind: "permission",
      message: "macOS Accessibility permission is required for System Events automation.",
      remediation:
        "Open System Settings > Privacy & Security > Accessibility and allow the terminal or agent host running RUDI.",
      stderr: maybeResult?.stderr,
      exitCode: maybeResult?.exitCode,
    };
  }

  if (
    normalized.includes("not authorized to send apple events") ||
    normalized.includes("not authorised to send apple events") ||
    normalized.includes("automation") && normalized.includes("not allowed")
  ) {
    return {
      kind: "permission",
      message: "macOS Automation permission is required for this app control action.",
      remediation:
        "Open System Settings > Privacy & Security > Automation and allow the terminal or agent host to control the target app.",
      stderr: maybeResult?.stderr,
      exitCode: maybeResult?.exitCode,
    };
  }

  if (
    normalized.includes("can't get application") ||
    normalized.includes("application isn't running") ||
    normalized.includes("application process is not running") ||
    normalized.includes("no such file")
  ) {
    return {
      kind: "not_found",
      message: trimCommandOutput(rawMessage) || "The requested macOS resource was not found.",
      stderr: maybeResult?.stderr,
      exitCode: maybeResult?.exitCode,
    };
  }

  return {
    kind: "command_failed",
    message: trimCommandOutput(rawMessage) || "macOS automation command failed.",
    stderr: maybeResult?.stderr,
    exitCode: maybeResult?.exitCode,
  };
}

export async function getStatus(): Promise<Record<string, unknown>> {
  const isDarwin = process.platform === "darwin";
  async function executable(file: string): Promise<boolean> {
    if (!isDarwin) return false;
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  return {
    platform: process.platform,
    supported: isDarwin,
    binaries: {
      osascript: await executable("/usr/bin/osascript"),
      open: await executable("/usr/bin/open"),
      shortcuts: await executable("/usr/bin/shortcuts"),
      screencapture: await executable("/usr/sbin/screencapture"),
    },
    permissions: {
      accessibility:
        "Required for System Events tools such as frontmost app and window inspection.",
      automation:
        "Required when controlling Finder, Reminders, or a target application.",
      shortcuts:
        "Running a Shortcut may prompt for permissions configured inside that Shortcut.",
    },
  };
}

export async function checkAccessibility(
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  const result = await runCommand(
    "/usr/bin/osascript",
    osascriptArgs([
      "tell application \"System Events\"",
      "return UI elements enabled",
      "end tell",
    ]),
    deps
  );
  return {
    ui_elements_enabled: trimCommandOutput(result.stdout).toLowerCase() === "true",
  };
}

export async function getFrontmostApp(
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  const result = await runCommand(
    "/usr/bin/osascript",
    osascriptArgs([
      "tell application \"System Events\"",
      "set frontApp to first application process whose frontmost is true",
      "return name of frontApp",
      "end tell",
    ]),
    deps
  );
  return { app_name: trimCommandOutput(result.stdout) };
}

export async function listWindows(
  input: ListWindowsInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  const result = await runCommand(
    "/usr/bin/osascript",
    osascriptArgs(
      [
        "on run argv",
        "set appName to item 1 of argv",
        "set maxItems to item 2 of argv as integer",
        "tell application \"System Events\"",
        "if appName is \"\" then",
        "set targetProcess to first application process whose frontmost is true",
        "else",
        "if not (exists application process appName) then error \"Application process is not running: \" & appName",
        "set targetProcess to application process appName",
        "end if",
        "set windowNames to {}",
        "repeat with windowItem in windows of targetProcess",
        "if (count of windowNames) is less than maxItems then set end of windowNames to name of windowItem",
        "end repeat",
        "set AppleScript's text item delimiters to linefeed",
        "return windowNames as text",
        "end tell",
        "end run",
      ],
      [input.app_name ?? "", String(input.limit)]
    ),
    deps
  );
  return {
    app_name: input.app_name,
    windows: trimCommandOutput(result.stdout).split("\n").filter(Boolean),
  };
}

export async function openUrl(
  input: OpenUrlInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  await runCommand("/usr/bin/open", [input.url], deps);
  return { opened: true, url: input.url };
}

export async function openApp(
  input: AppInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  await runCommand("/usr/bin/open", ["-a", input.app_name], deps);
  return { opened: true, app_name: input.app_name };
}

export async function focusApp(
  input: AppInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  await runCommand(
    "/usr/bin/osascript",
    osascriptArgs(
      [
        "on run argv",
        "tell application (item 1 of argv) to activate",
        "return item 1 of argv",
        "end run",
      ],
      [input.app_name]
    ),
    deps
  );
  return { focused: true, app_name: input.app_name };
}

export async function showNotification(
  input: NotificationInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  await runCommand(
    "/usr/bin/osascript",
    osascriptArgs(
      [
        "on run argv",
        "set notificationTitle to item 1 of argv",
        "set notificationMessage to item 2 of argv",
        "set notificationSubtitle to item 3 of argv",
        "set notificationSound to item 4 of argv",
        "if notificationSubtitle is \"\" and notificationSound is \"\" then",
        "display notification notificationMessage with title notificationTitle",
        "else if notificationSound is \"\" then",
        "display notification notificationMessage with title notificationTitle subtitle notificationSubtitle",
        "else if notificationSubtitle is \"\" then",
        "display notification notificationMessage with title notificationTitle sound name notificationSound",
        "else",
        "display notification notificationMessage with title notificationTitle subtitle notificationSubtitle sound name notificationSound",
        "end if",
        "return \"ok\"",
        "end run",
      ],
      [input.title, input.message, input.subtitle ?? "", input.sound_name ?? ""]
    ),
    deps
  );
  return { shown: true, title: input.title };
}

export async function listShortcuts(
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  const result = await runCommand("/usr/bin/shortcuts", ["list"], deps);
  return {
    shortcuts: trimCommandOutput(result.stdout).split("\n").filter(Boolean),
  };
}

export async function runShortcut(
  input: ShortcutInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  const args = ["run", input.name];
  if (input.input_path) args.push("--input-path", input.input_path);
  if (input.output_path) args.push("--output-path", input.output_path);
  if (input.output_type) args.push("--output-type", input.output_type);

  if (!input.confirm_run) {
    return {
      ran: false,
      dry_run: true,
      shortcut: input.name,
      command: ["/usr/bin/shortcuts", ...args],
      input_path: input.input_path,
      output_path: input.output_path,
      output_type: input.output_type,
    };
  }

  const result = await runCommand("/usr/bin/shortcuts", args, deps, {
    timeoutMs: 60000,
  });
  return {
    ran: true,
    dry_run: false,
    shortcut: input.name,
    stdout: trimCommandOutput(result.stdout),
    stderr: trimCommandOutput(result.stderr) || undefined,
  };
}

export async function createReminder(
  input: ReminderInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  if (!input.confirm_create) {
    return {
      created: false,
      dry_run: true,
      title: input.title,
      list_name: input.list_name,
      due_at: input.due_at,
      due_date_parts: input.due_date_parts,
    };
  }

  const due = input.due_date_parts;
  const result = await runCommand(
    "/usr/bin/osascript",
    osascriptArgs(
      [
        "on run argv",
        "set reminderTitle to item 1 of argv",
        "set reminderBody to item 2 of argv",
        "set listName to item 3 of argv",
        "set hasDueDate to item 4 of argv",
        "tell application \"Reminders\"",
        "if listName is \"\" then",
        "set targetList to default list",
        "else",
        "if not (exists list listName) then error \"Reminder list not found: \" & listName",
        "set targetList to list listName",
        "end if",
        "set newReminder to make new reminder at end of reminders of targetList with properties {name:reminderTitle}",
        "if reminderBody is not \"\" then set body of newReminder to reminderBody",
        "if hasDueDate is \"true\" then",
        "set dueDate to current date",
        "set year of dueDate to (item 5 of argv as integer)",
        "set month of dueDate to (item 6 of argv as integer)",
        "set day of dueDate to (item 7 of argv as integer)",
        "set time of dueDate to (item 8 of argv as integer)",
        "set remind me date of newReminder to dueDate",
        "end if",
        "return id of newReminder",
        "end tell",
        "end run",
      ],
      [
        input.title,
        input.notes ?? "",
        input.list_name ?? "",
        due ? "true" : "false",
        due ? String(due.year) : "",
        due ? String(due.month) : "",
        due ? String(due.day) : "",
        due ? String(due.seconds_since_midnight) : "",
      ]
    ),
    deps
  );

  return {
    created: true,
    dry_run: false,
    id: trimCommandOutput(result.stdout),
    title: input.title,
    list_name: input.list_name,
  };
}

export async function getSelectedFinderItems(
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  const result = await runCommand(
    "/usr/bin/osascript",
    osascriptArgs([
      "tell application \"Finder\"",
      "set selectedItems to selection as alias list",
      "set outputPaths to {}",
      "repeat with selectedItem in selectedItems",
      "set end of outputPaths to POSIX path of selectedItem",
      "end repeat",
      "set AppleScript's text item delimiters to linefeed",
      "return outputPaths as text",
      "end tell",
    ]),
    deps
  );
  return {
    paths: trimCommandOutput(result.stdout).split("\n").filter(Boolean),
  };
}

export async function revealInFinder(
  input: PathInput,
  deps: MacosAutomationDependencies = {}
): Promise<Record<string, unknown>> {
  await fs.access(input.path);
  await runCommand("/usr/bin/open", ["-R", input.path], deps);
  return {
    revealed: true,
    path: input.path,
  };
}
