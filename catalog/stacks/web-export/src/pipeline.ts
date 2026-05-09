import { acquireBrowserSession, navigateAndWait } from "./browser.js";
import { detectLayoutMode } from "./detect.js";
import { diagnoseExport } from "./diagnose.js";
import { generatePdfPreviewsAndReview } from "./review-pdf.js";
import { renderArtboardPdf, renderArtboardPng } from "./render-art.js";
import { renderFlowPdf, renderFlowPng } from "./render-flow.js";
import type {
  ExportFormat,
  ExportResult,
  PageVisualAnalysis,
  RawExportArguments,
  ValidatedExportRequest,
} from "./types.js";
import type { DiagnosticWarning } from "./types.js";
import { RenderError } from "./types.js";
import { verifyPdfArtifacts, verifyPngArtifacts } from "./verify.js";
import { validateExportRequest } from "./validate.js";

async function executeValidatedRequest(
  request: ValidatedExportRequest,
): Promise<ExportResult> {
  const session = await acquireBrowserSession(request);

  try {
    await navigateAndWait(session, request);
    const detection = await detectLayoutMode(session.page, request);

    if (request.format === "png" && request.paginated && detection.matchedPageCount === 0) {
      throw new RenderError(
        "PAGINATED_ZERO_OUTPUT",
        "paginated PNG export requires one or more elements matching page_selector.",
        { pageSelector: request.pageSelector, modeDetected: detection.resolvedMode },
      );
    }

    const renderArtifact =
      request.format === "pdf"
        ? detection.resolvedMode === "artboard"
          ? await renderArtboardPdf(session.page, request)
          : await renderFlowPdf(session.page, request, detection)
        : detection.resolvedMode === "artboard"
          ? await renderArtboardPng(session.page, request)
          : await renderFlowPng(session.page, request);

    const verification =
      request.format === "pdf"
        ? await verifyPdfArtifacts(renderArtifact.artifactPaths)
        : verifyPngArtifacts(renderArtifact.artifactPaths);

    let previewPaths = renderArtifact.previewPaths;
    let pageAnalyses: PageVisualAnalysis[] = [];
    let previewWarnings: DiagnosticWarning[] = [];

    if (request.format === "pdf") {
      const review = await generatePdfPreviewsAndReview(
        verification.artifactPaths[0],
        request,
        verification.actualPageCount,
        request.preview && previewPaths.length === 0,
      );
      if (previewPaths.length === 0) {
        previewPaths = review.previewPaths;
      }
      pageAnalyses = review.pageAnalyses;
      previewWarnings = review.warnings;
    }

    const warnings = diagnoseExport(
      detection,
      verification,
      session.telemetry,
      renderArtifact.renderTimeMs,
      previewPaths,
      request.preview,
      pageAnalyses,
      previewWarnings,
    );

    return {
      success: true,
      format: request.format,
      modeDetected: detection.resolvedMode,
      actualPageCount: verification.actualPageCount,
      artboardCount: detection.matchedPageCount,
      artifactPaths: verification.artifactPaths,
      previewPaths,
      warnings,
      renderTimeMs: renderArtifact.renderTimeMs,
      fileSizeBytes: verification.fileSizeBytes,
      pageDimensions: verification.pageDimensions,
    };
  } finally {
    await session.release();
  }
}

export async function runExportPipeline(
  raw: RawExportArguments,
  format: ExportFormat,
): Promise<ExportResult> {
  const request = validateExportRequest(raw, format);
  return executeValidatedRequest(request);
}
