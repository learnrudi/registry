import type { Page } from "playwright";

import { resolveFlowPngPath, resolveMergedPdfPath } from "./output-paths.js";
import type { LayoutDetectionResult, RenderArtifact, ValidatedExportRequest } from "./types.js";

function pdfDimension(value: number, unit: "in" | "px"): string {
  return `${value}${unit}`;
}

export async function renderFlowPdf(
  page: Page,
  request: ValidatedExportRequest,
  detection: LayoutDetectionResult,
): Promise<RenderArtifact> {
  const startedAt = Date.now();
  const artifactPath = resolveMergedPdfPath(request);

  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: artifactPath,
    width: pdfDimension(request.pageSize.width, request.pageSize.unit),
    height: pdfDimension(request.pageSize.height, request.pageSize.unit),
    printBackground: true,
    preferCSSPageSize: detection.resolvedMode === "css-print",
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  return {
    artifactPaths: [artifactPath],
    previewPaths: [],
    renderTimeMs: Date.now() - startedAt,
  };
}

export async function renderFlowPng(
  page: Page,
  request: ValidatedExportRequest,
): Promise<RenderArtifact> {
  const startedAt = Date.now();
  const artifactPath = resolveFlowPngPath(request);

  await page.screenshot({
    path: artifactPath,
    fullPage: true,
  });

  return {
    artifactPaths: [artifactPath],
    previewPaths: [],
    renderTimeMs: Date.now() - startedAt,
  };
}
