import {
  LARGE_FILE_BYTES,
  SLOW_RENDER_MS,
  type BrowserTelemetry,
  type DiagnosticWarning,
  type LayoutDetectionResult,
  type PageVisualAnalysis,
  type VerificationResult,
  createWarning,
} from "./types.js";

const UNDERFILLED_LAST_PAGE_THRESHOLD = 0.35;
const RISKY_PAGE_FIT_THRESHOLD = 0.02;

export function diagnoseExport(
  detection: LayoutDetectionResult,
  verification: VerificationResult,
  telemetry: BrowserTelemetry,
  renderTimeMs: number,
  previewPaths: string[],
  previewRequested: boolean,
  pageAnalyses: PageVisualAnalysis[],
  previewWarnings: DiagnosticWarning[],
): DiagnosticWarning[] {
  const warnings: DiagnosticWarning[] = [...detection.warnings, ...previewWarnings];

  if (
    detection.resolvedMode === "artboard" &&
    detection.matchedPageCount > 0 &&
    verification.actualPageCount !== detection.matchedPageCount
  ) {
    warnings.push(
      createWarning(
        "ARTBOARD_COUNT_MISMATCH",
        "warning",
        "The verified PDF page count differs from the number of matched explicit pages.",
        {
          matchedPageCount: detection.matchedPageCount,
          actualPageCount: verification.actualPageCount,
        },
      ),
    );
  }

  const missingAssets = [...telemetry.failedRequests, ...telemetry.consoleErrors, ...telemetry.pageErrors];
  if (missingAssets.length > 0) {
    warnings.push(
      createWarning(
        "MISSING_ASSETS",
        "warning",
        "The browser reported failed requests or runtime errors while rendering.",
        { issues: missingAssets.slice(0, 20) },
      ),
    );
  }

  if (renderTimeMs > SLOW_RENDER_MS) {
    warnings.push(
      createWarning("SLOW_RENDER", "info", "Rendering exceeded the slow-render threshold.", {
        renderTimeMs,
      }),
    );
  }

  if (verification.fileSizeBytes > LARGE_FILE_BYTES) {
    warnings.push(
      createWarning("LARGE_FILE", "info", "Output artifact exceeded the large-file threshold.", {
        fileSizeBytes: verification.fileSizeBytes,
      }),
    );
  }

  const blankPages = pageAnalyses.filter((analysis) => analysis.isBlank).map((analysis) => analysis.pageNumber);
  if (blankPages.length > 0) {
    warnings.push(
      createWarning(
        "BLANK_PAGE",
        "warning",
        "One or more rendered pages appear to be blank.",
        { pages: blankPages },
      ),
    );
  }

  const riskyPages = pageAnalyses
    .filter((analysis) => !analysis.isBlank && analysis.bottomWhitespaceRatio < RISKY_PAGE_FIT_THRESHOLD)
    .map((analysis) => analysis.pageNumber);
  if (riskyPages.length > 0) {
    warnings.push(
      createWarning(
        "RISKY_PAGE_FIT",
        "warning",
        "One or more pages end very close to the bottom edge and may need review.",
        { pages: riskyPages, threshold: RISKY_PAGE_FIT_THRESHOLD },
      ),
    );
  }

  const lastPage = pageAnalyses.at(-1);
  if (
    lastPage &&
    !lastPage.isBlank &&
    verification.actualPageCount > 1 &&
    lastPage.bottomWhitespaceRatio > UNDERFILLED_LAST_PAGE_THRESHOLD
  ) {
    warnings.push(
      createWarning(
        "UNDERFILLED_LAST_PAGE",
        "info",
        "The last page leaves substantial unused space at the bottom.",
        {
          pageNumber: lastPage.pageNumber,
          bottomWhitespaceRatio: Number(lastPage.bottomWhitespaceRatio.toFixed(3)),
        },
      ),
    );
  }

  if (previewRequested && previewPaths.length === 0) {
    warnings.push(
      createWarning(
        "PREVIEW_UNAVAILABLE",
        "info",
        "Preview generation was requested but could not be produced for this export.",
      ),
    );
  }

  return warnings;
}
