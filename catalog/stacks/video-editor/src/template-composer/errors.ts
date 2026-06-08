export type ErrorKind =
  | "validation"
  | "unsupported_combo"
  | "render_failed"
  | "timeout"
  | "write_failed"
  | "unknown_tool"
  | "internal_error";

export interface ToolResult {
  ok: boolean;
  [key: string]: unknown;
}

export class ToolError extends Error {
  readonly error_kind: ErrorKind;
  readonly details?: Record<string, unknown>;

  constructor(errorKind: ErrorKind, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ToolError";
    this.error_kind = errorKind;
    this.details = details;
  }

  toResult(): ToolResult {
    return errorResult(this.error_kind, this.message, this.details);
  }
}

export function okResult(values: Record<string, unknown> = {}): ToolResult {
  return { ok: true, ...values };
}

export function errorResult(
  errorKind: ErrorKind,
  message: string,
  details?: Record<string, unknown>
): ToolResult {
  return {
    ok: false,
    error_kind: errorKind,
    message,
    ...(details ?? {}),
  };
}

export function safeExceptionDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message || "Unexpected error").slice(0, 2000);
}
