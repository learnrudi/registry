import type { Browser, BrowserContext, Page } from "playwright";

export const DEFAULT_OUTPUT_DIR = ".rudi/output";
export const DEFAULT_PAGE_SELECTOR = ".artboard, [data-page]";
export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;
export const DEFAULT_DPI = 150;
export const DEFAULT_SCALE = 1;
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;
export const SLOW_RENDER_MS = 10_000;

export const PAGE_SIZE_PRESETS = {
  "letter": { width: 8.5, height: 11, unit: "in", label: "US Letter (8.5x11)" },
  "letter-landscape": { width: 11, height: 8.5, unit: "in", label: "US Letter Landscape (11x8.5)" },
  "16:9": { width: 16, height: 9, unit: "in", label: "16:9 Presentation" },
  "a4": { width: 8.27, height: 11.69, unit: "in", label: "A4" },
  "a4-landscape": { width: 11.69, height: 8.27, unit: "in", label: "A4 Landscape" },
} as const;

export type ExportFormat = "pdf" | "png";
export type LayoutMode = "flow" | "css-print" | "artboard";
export type RequestedMode = "auto" | "flow" | "artboard";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type PageSizePreset = keyof typeof PAGE_SIZE_PRESETS;

export interface RawExportArguments {
  input?: unknown;
  html_path?: unknown;
  output?: unknown;
  mode?: unknown;
  dpi?: unknown;
  scale?: unknown;
  page_selector?: unknown;
  ready_selector?: unknown;
  wait_for_js?: unknown;
  paginated?: unknown;
  artboard_size?: unknown;
  viewport_width?: unknown;
  viewport_height?: unknown;
  browser_ws_endpoint?: unknown;
  preview?: unknown;
  split_output?: unknown;
}

export interface PageSize {
  width: number;
  height: number;
  unit: "in" | "px";
  label: string;
  explicit: boolean;
}

export interface ValidatedExportRequest {
  format: ExportFormat;
  inputPath: string;
  inputStem: string;
  outputTarget: string;
  outputProvided: boolean;
  mode: RequestedMode;
  dpi: number;
  scale: number;
  pageSelector: string;
  readySelector?: string;
  waitForJs?: string;
  paginated: boolean;
  preview: boolean;
  splitOutput: boolean;
  viewportWidth: number;
  viewportHeight: number;
  browserWsEndpoint?: string;
  pageSize: PageSize;
}

export interface BrowserTelemetry {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  telemetry: BrowserTelemetry;
  release: () => Promise<void>;
}

export interface LayoutDetectionResult {
  requestedMode: RequestedMode;
  resolvedMode: LayoutMode;
  matchedPageCount: number;
  cssPrintSignals: string[];
  warnings: DiagnosticWarning[];
}

export interface RenderArtifact {
  artifactPaths: string[];
  previewPaths: string[];
  renderTimeMs: number;
}

export interface PageDimension {
  width: number;
  height: number;
}

export interface PageVisualAnalysis {
  pageNumber: number;
  isBlank: boolean;
  inkCoverageRatio: number;
  bottomWhitespaceRatio: number;
}

export interface VerificationResult {
  artifactPaths: string[];
  actualPageCount: number;
  fileSizeBytes: number;
  pageDimensions: PageDimension[];
}

export interface DiagnosticWarning {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  modeDetected: LayoutMode;
  actualPageCount: number;
  artboardCount: number;
  artifactPaths: string[];
  previewPaths: string[];
  warnings: DiagnosticWarning[];
  renderTimeMs: number;
  fileSizeBytes: number;
  pageDimensions: PageDimension[];
}

export interface CombinedExportResult {
  success: boolean;
  pdf: ExportResult;
  png: ExportResult;
}

export class ExportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends ExportError {}
export class RenderError extends ExportError {}
export class VerificationError extends ExportError {}

export function createWarning(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  details?: Record<string, unknown>,
): DiagnosticWarning {
  return { code, severity, message, details };
}
