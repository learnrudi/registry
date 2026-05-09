import { accessSync, constants, existsSync, mkdirSync, statSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "path";
import { homedir } from "os";

import {
  DEFAULT_DPI,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PAGE_SELECTOR,
  DEFAULT_SCALE,
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  PAGE_SIZE_PRESETS,
  type ExportFormat,
  type PageSize,
  type PageSizePreset,
  type RawExportArguments,
  type RequestedMode,
  type ValidatedExportRequest,
  ValidationError,
} from "./types.js";

function expandPath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("INVALID_STRING", `${fieldName} must be a non-empty string.`, {
      field: fieldName,
      value,
    });
  }

  return value.trim();
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return parseString(value, fieldName);
}

function parseBoolean(value: unknown, fieldName: string, defaultValue: boolean): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError("INVALID_BOOLEAN", `${fieldName} must be a boolean.`, {
      field: fieldName,
      value,
    });
  }

  return value;
}

function parseNumber(
  value: unknown,
  fieldName: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError("INVALID_NUMBER", `${fieldName} must be a finite number.`, {
      field: fieldName,
      value,
    });
  }

  if (value < min || value > max) {
    throw new ValidationError(
      "NUMBER_OUT_OF_RANGE",
      `${fieldName} must be between ${min} and ${max}.`,
      { field: fieldName, value, min, max },
    );
  }

  return value;
}

function parseRequestedMode(value: unknown): RequestedMode {
  if (value === undefined || value === null) {
    return "auto";
  }

  if (value === "auto" || value === "flow" || value === "artboard") {
    return value;
  }

  throw new ValidationError(
    "INVALID_MODE",
    "mode must be one of: auto, flow, artboard.",
    { field: "mode", value },
  );
}

function parseBrowserEndpoint(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const endpoint = parseString(value, "browser_ws_endpoint");

  try {
    const parsed = new URL(endpoint);
    if (!["ws:", "wss:", "http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Unsupported protocol.");
    }
  } catch {
    throw new ValidationError(
      "INVALID_BROWSER_ENDPOINT",
      "browser_ws_endpoint must be a valid ws, wss, http, or https URL.",
      { field: "browser_ws_endpoint", value },
    );
  }

  return endpoint;
}

function resolveInputPath(raw: RawExportArguments): { inputPath: string; inputStem: string } {
  const inputValue = raw.input ?? raw.html_path;
  const inputPath = resolve(expandPath(parseString(inputValue, "input")));

  if (!existsSync(inputPath)) {
    throw new ValidationError("INPUT_NOT_FOUND", `Input HTML file not found: ${inputPath}`, {
      field: "input",
      value: inputPath,
    });
  }

  const stats = statSync(inputPath);
  if (!stats.isFile()) {
    throw new ValidationError("INPUT_NOT_FILE", `input must point to a file: ${inputPath}`, {
      field: "input",
      value: inputPath,
    });
  }

  return {
    inputPath,
    inputStem: basename(inputPath, extname(inputPath)),
  };
}

function resolveOutputTarget(
  rawOutput: unknown,
  inputStem: string,
  format: ExportFormat,
): string {
  const defaultPath = resolve(join(homedir(), DEFAULT_OUTPUT_DIR, `${inputStem}.${format}`));
  if (rawOutput === undefined || rawOutput === null) {
    mkdirSync(dirname(defaultPath), { recursive: true });
    return defaultPath;
  }

  const outputValue = resolve(expandPath(parseString(rawOutput, "output")));
  const parentPath = extname(outputValue) ? dirname(outputValue) : dirname(outputValue);

  mkdirSync(parentPath, { recursive: true });
  accessSync(parentPath, constants.W_OK);

  return outputValue;
}

function parsePageSize(value: unknown): PageSize {
  if (value === undefined || value === null) {
    const preset = PAGE_SIZE_PRESETS.letter;
    return { ...preset, explicit: false };
  }

  if (typeof value === "string") {
    if (value in PAGE_SIZE_PRESETS) {
      const preset = PAGE_SIZE_PRESETS[value as PageSizePreset];
      return { ...preset, explicit: true };
    }

    throw new ValidationError(
      "INVALID_ARTBOARD_SIZE",
      `artboard_size must be one of: ${Object.keys(PAGE_SIZE_PRESETS).join(", ")} or a [width, height] tuple.`,
      { field: "artboard_size", value },
    );
  }

  if (Array.isArray(value) && value.length === 2) {
    const [width, height] = value;
    if (
      typeof width === "number" &&
      Number.isFinite(width) &&
      width > 0 &&
      typeof height === "number" &&
      Number.isFinite(height) &&
      height > 0
    ) {
      return {
        width,
        height,
        unit: "px",
        label: `${width}x${height}px`,
        explicit: true,
      };
    }
  }

  throw new ValidationError(
    "INVALID_ARTBOARD_SIZE",
    "artboard_size must be a preset string or a [width, height] tuple with positive numbers.",
    { field: "artboard_size", value },
  );
}

export function validateExportRequest(
  raw: RawExportArguments,
  format: ExportFormat,
): ValidatedExportRequest {
  const { inputPath, inputStem } = resolveInputPath(raw);
  const outputTarget = resolveOutputTarget(raw.output, inputStem, format);
  const pageSelector = parseOptionalString(raw.page_selector, "page_selector") ?? DEFAULT_PAGE_SELECTOR;
  const mode = parseRequestedMode(raw.mode);
  const paginated = parseBoolean(raw.paginated, "paginated", false);
  const splitOutput = parseBoolean(raw.split_output, "split_output", false);

  if (format === "png" && paginated && mode === "flow") {
    throw new ValidationError(
      "INVALID_MODE_FOR_PAGINATED_PNG",
      "paginated PNG export requires mode=auto or mode=artboard.",
      { field: "mode", value: mode, paginated },
    );
  }

  if (format === "png" && splitOutput) {
    throw new ValidationError(
      "UNSUPPORTED_OPTION",
      "split_output is only supported for PDF exports.",
      { field: "split_output", value: splitOutput, format },
    );
  }

  return {
    format,
    inputPath,
    inputStem,
    outputTarget,
    outputProvided: raw.output !== undefined && raw.output !== null,
    mode,
    dpi: parseNumber(raw.dpi, "dpi", DEFAULT_DPI, 72, 600),
    scale: parseNumber(raw.scale, "scale", DEFAULT_SCALE, 0.25, 4),
    pageSelector,
    readySelector: parseOptionalString(raw.ready_selector, "ready_selector"),
    waitForJs: parseOptionalString(raw.wait_for_js, "wait_for_js"),
    paginated,
    preview: parseBoolean(raw.preview, "preview", false),
    splitOutput,
    viewportWidth: parseNumber(
      raw.viewport_width,
      "viewport_width",
      DEFAULT_VIEWPORT_WIDTH,
      320,
      7680,
    ),
    viewportHeight: parseNumber(
      raw.viewport_height,
      "viewport_height",
      DEFAULT_VIEWPORT_HEIGHT,
      240,
      4320,
    ),
    browserWsEndpoint: parseBrowserEndpoint(raw.browser_ws_endpoint),
    pageSize: parsePageSize(raw.artboard_size),
  };
}
