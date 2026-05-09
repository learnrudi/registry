import type { LayoutDetectionResult, ValidatedExportRequest } from "./types.js";
import { createWarning } from "./types.js";
import type { Page } from "playwright";

function detectCssSignals(markup: string, pageClassCount: number): string[] {
  const signals: string[] = [];

  if (/@page\b/i.test(markup)) signals.push("@page");
  if (/page-break-(before|after|inside)/i.test(markup)) signals.push("page-break");
  if (/break-(before|after|inside)/i.test(markup)) signals.push("break-*");
  if (pageClassCount > 0) signals.push(".page");

  return signals;
}

export async function detectLayoutMode(
  page: Page,
  request: ValidatedExportRequest,
): Promise<LayoutDetectionResult> {
  const [matchedPageCount, pageClassCount, markup] = await Promise.all([
    page.$$eval(request.pageSelector, (elements) =>
      elements.filter((element) => {
        const html = element as HTMLElement;
        const rect = html.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
    ),
    page.$$eval(".page", (elements) => elements.length),
    page.content(),
  ]);

  const cssPrintSignals = detectCssSignals(markup, pageClassCount);
  let resolvedMode: LayoutDetectionResult["resolvedMode"];

  if (request.mode === "flow") {
    resolvedMode = cssPrintSignals.length > 0 ? "css-print" : "flow";
  } else if (request.mode === "artboard") {
    resolvedMode = "artboard";
  } else if (matchedPageCount > 0) {
    resolvedMode = "artboard";
  } else if (cssPrintSignals.length > 0) {
    resolvedMode = "css-print";
  } else {
    resolvedMode = "flow";
  }

  const warnings = [];
  if (request.mode === "artboard" && matchedPageCount === 0) {
    warnings.push(
      createWarning(
        "NO_ARTBOARDS_IN_ARTBOARD_MODE",
        "error",
        "mode=artboard was requested, but page_selector matched zero elements.",
        { pageSelector: request.pageSelector },
      ),
    );
  }

  return {
    requestedMode: request.mode,
    resolvedMode,
    matchedPageCount,
    cssPrintSignals,
    warnings,
  };
}
