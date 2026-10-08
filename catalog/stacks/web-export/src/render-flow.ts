import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { assertFlowBudget, assertOutputBudget, assertRenderBudget, consumeOutputBudget } from "./render-budget.js";
import { RenderError } from "./types.js";
import { freezeDocumentLayout, preparePrintLayout } from './print-layout.js';
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
  await preparePrintLayout(page);
  const maxPages = await assertFlowBudget(page, request);
  const artifactPath = resolveMergedPdfPath(request);
  const bytes = await page.pdf({
    pageRanges: `1-${maxPages + 1}`,
    width: pdfDimension(request.pageSize.width, request.pageSize.unit),
    height: pdfDimension(request.pageSize.height, request.pageSize.unit),
    printBackground: true,
    preferCSSPageSize: detection.resolvedMode === "css-print",
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  assertOutputBudget(bytes.length);
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() > maxPages) {
    throw new RenderError('RENDER_BUDGET_EXCEEDED', 'PDF exceeds the page or aggregate pixel budget.');
  }
  assertRenderBudget(pdf.getPages().map(page => ({ width: page.getWidth() * 96 / 72, height: page.getHeight() * 96 / 72 })), Math.max(request.scale, request.dpi / 96));
  consumeOutputBudget(request, bytes.length);
  writeFileSync(artifactPath, bytes);
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
  await freezeDocumentLayout(page);
  await assertFlowBudget(page, request);
  const artifactPath = resolveFlowPngPath(request);

  const bytes = await page.screenshot({ fullPage: true });

  consumeOutputBudget(request, bytes.length);
  writeFileSync(artifactPath, bytes);
  return {
    artifactPaths: [artifactPath],
    previewPaths: [],
    renderTimeMs: Date.now() - startedAt,
  };
}
