import { writeFileSync } from "fs";

import { PDFDocument } from "pdf-lib";
import type { Page } from "playwright";

import {
  resolveArtboardPdfPaths,
  resolveArtboardPngPaths,
  resolvePreviewPaths,
} from "./output-paths.js";
import type { RenderArtifact, ValidatedExportRequest } from "./types.js";
import { RenderError } from "./types.js";

interface ArtboardMetric {
  index: number;
  width: number;
  height: number;
}

interface IsolationSnapshot {
  bodyStyle: string | null;
  htmlStyle: string | null;
  targetStyle: string | null;
}

const ISOLATION_STYLE_ID = "__web-export-isolation";

async function getArtboardMetrics(page: Page, selector: string): Promise<ArtboardMetric[]> {
  return page.$$eval(selector, (elements) =>
    elements
      .map((element, index) => {
        const html = element as HTMLElement;
        const rect = html.getBoundingClientRect();
        const width = Math.ceil(html.scrollWidth || rect.width);
        const height = Math.ceil(html.scrollHeight || rect.height);

        return {
          index,
          width,
          height,
        };
      })
      .filter((metric) => metric.width > 0 && metric.height > 0),
  );
}

async function isolateArtboard(
  page: Page,
  selector: string,
  index: number,
): Promise<IsolationSnapshot> {
  const snapshot = await page.evaluate(
    ({ selector: selector_, index: index_ }) => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector_));
      const target = matches[index_];

      if (!target) {
        return null;
      }

      const style = document.createElement("style");
      style.id = "__web-export-isolation";
      style.textContent = `
        body > * { visibility: hidden !important; }
        [data-web-export-target], [data-web-export-target] * { visibility: visible !important; }
        [data-web-export-target] {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          margin: 0 !important;
          transform: none !important;
        }
      `;

      document.head.append(style);

      const snapshot_ = {
        bodyStyle: document.body.getAttribute("style"),
        htmlStyle: document.documentElement.getAttribute("style"),
        targetStyle: target.getAttribute("style"),
      };

      target.setAttribute("data-web-export-target", "true");
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";

      return snapshot_;
    },
    { selector, index },
  );

  if (!snapshot) {
    throw new RenderError("ARTBOARD_NOT_FOUND", "Failed to isolate the requested artboard.", {
      selector,
      index,
    });
  }

  return snapshot;
}

async function restoreArtboard(page: Page, snapshot: IsolationSnapshot): Promise<void> {
  await page.evaluate((snapshot_) => {
    const style = document.getElementById("__web-export-isolation");
    style?.remove();

    const target = document.querySelector<HTMLElement>("[data-web-export-target]");
    if (target) {
      target.removeAttribute("data-web-export-target");
      if (snapshot_.targetStyle === null) {
        target.removeAttribute("style");
      } else {
        target.setAttribute("style", snapshot_.targetStyle);
      }
    }

    if (snapshot_.bodyStyle === null) {
      document.body.removeAttribute("style");
    } else {
      document.body.setAttribute("style", snapshot_.bodyStyle);
    }

    if (snapshot_.htmlStyle === null) {
      document.documentElement.removeAttribute("style");
    } else {
      document.documentElement.setAttribute("style", snapshot_.htmlStyle);
    }
  }, snapshot);
}

export async function renderArtboardPdf(
  page: Page,
  request: ValidatedExportRequest,
): Promise<RenderArtifact> {
  const startedAt = Date.now();
  const metrics = await getArtboardMetrics(page, request.pageSelector);

  if (metrics.length === 0) {
    throw new RenderError(
      "NO_ARTBOARDS_IN_ARTBOARD_MODE",
      "Explicit-page PDF rendering requires one or more elements matching page_selector.",
      { pageSelector: request.pageSelector },
    );
  }

  const { mergedPath, splitPaths } = resolveArtboardPdfPaths(request, metrics.length);
  const previewPaths = request.preview ? resolvePreviewPaths(request, metrics.length) : [];
  const pageBuffers: Uint8Array[] = [];

  await page.emulateMedia({ media: "print" });

  for (const metric of metrics) {
    const snapshot = await isolateArtboard(page, request.pageSelector, metric.index);

    try {
      await page.waitForTimeout(25);

      if (request.preview) {
        await page.screenshot({
          path: previewPaths[metric.index],
          clip: { x: 0, y: 0, width: metric.width, height: metric.height },
        });
      }

      const pageBytes = await page.pdf({
        width: `${metric.width}px`,
        height: `${metric.height}px`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      pageBuffers.push(pageBytes);
    } finally {
      await restoreArtboard(page, snapshot);
    }
  }

  if (request.splitOutput) {
    for (const [index, buffer] of pageBuffers.entries()) {
      writeFileSync(splitPaths[index], Buffer.from(buffer));
    }

    return {
      artifactPaths: splitPaths,
      previewPaths,
      renderTimeMs: Date.now() - startedAt,
    };
  }

  const merged = await PDFDocument.create();

  for (const buffer of pageBuffers) {
    const part = await PDFDocument.load(buffer);
    const copiedPages = await merged.copyPages(part, part.getPageIndices());
    copiedPages.forEach((copiedPage) => merged.addPage(copiedPage));
  }

  writeFileSync(mergedPath, Buffer.from(await merged.save()));

  return {
    artifactPaths: [mergedPath],
    previewPaths,
    renderTimeMs: Date.now() - startedAt,
  };
}

export async function renderArtboardPng(
  page: Page,
  request: ValidatedExportRequest,
): Promise<RenderArtifact> {
  const startedAt = Date.now();
  const metrics = await getArtboardMetrics(page, request.pageSelector);

  if (metrics.length === 0) {
    throw new RenderError(
      request.paginated ? "PAGINATED_ZERO_OUTPUT" : "NO_ARTBOARDS_IN_ARTBOARD_MODE",
      request.paginated
        ? "paginated PNG export requires one or more elements matching page_selector."
        : "Explicit-page PNG rendering requires one or more elements matching page_selector.",
      { pageSelector: request.pageSelector, paginated: request.paginated },
    );
  }

  const artifactPaths = resolveArtboardPngPaths(request, metrics.length);

  for (const metric of metrics) {
    const snapshot = await isolateArtboard(page, request.pageSelector, metric.index);

    try {
      await page.waitForTimeout(25);
      await page.screenshot({
        path: artifactPaths[metric.index],
        clip: { x: 0, y: 0, width: metric.width, height: metric.height },
      });
    } finally {
      await restoreArtboard(page, snapshot);
    }
  }

  return {
    artifactPaths,
    previewPaths: [],
    renderTimeMs: Date.now() - startedAt,
  };
}
