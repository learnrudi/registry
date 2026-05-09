import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { resolvePreviewPaths } from "./output-paths.js";
import type {
  DiagnosticWarning,
  PageVisualAnalysis,
  ValidatedExportRequest,
} from "./types.js";
import { createWarning } from "./types.js";

const ANALYSIS_DPI = 36;
const NON_WHITE_THRESHOLD = 245;
const RASTERIZER_COMMAND = "pdftoppm";

interface PgmImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface PdfReviewResult {
  previewPaths: string[];
  pageAnalyses: PageVisualAnalysis[];
  warnings: DiagnosticWarning[];
}

function runRasterizer(args: string[]): { ok: boolean; missing: boolean; stderr: string } {
  const result = spawnSync(RASTERIZER_COMMAND, args, { encoding: "utf8" });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return { ok: false, missing: true, stderr: `${RASTERIZER_COMMAND} is not installed.` };
    }

    return { ok: false, missing: false, stderr: error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      missing: false,
      stderr: result.stderr?.trim() || `${RASTERIZER_COMMAND} exited with status ${result.status}.`,
    };
  }

  return { ok: true, missing: false, stderr: "" };
}

export function isPdfRasterizerAvailable(): boolean {
  const result = runRasterizer(["-v"]);
  return result.ok;
}

function parsePgm(buffer: Buffer): PgmImage {
  let index = 0;
  const tokens: string[] = [];

  function isWhitespace(byte: number): boolean {
    return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
  }

  while (tokens.length < 4 && index < buffer.length) {
    while (index < buffer.length && isWhitespace(buffer[index])) {
      index += 1;
    }

    if (buffer[index] === 0x23) {
      while (index < buffer.length && buffer[index] !== 0x0a) {
        index += 1;
      }
      continue;
    }

    const start = index;
    while (index < buffer.length && !isWhitespace(buffer[index])) {
      index += 1;
    }
    tokens.push(buffer.subarray(start, index).toString("ascii"));
  }

  if (tokens.length < 4 || tokens[0] !== "P5") {
    throw new Error("Invalid PGM image.");
  }

  while (index < buffer.length && isWhitespace(buffer[index])) {
    index += 1;
  }

  const width = Number.parseInt(tokens[1], 10);
  const height = Number.parseInt(tokens[2], 10);
  const maxValue = Number.parseInt(tokens[3], 10);

  if (!Number.isFinite(width) || !Number.isFinite(height) || maxValue !== 255) {
    throw new Error("Unsupported PGM header.");
  }

  const pixelCount = width * height;
  const pixels = buffer.subarray(index, index + pixelCount);

  if (pixels.length !== pixelCount) {
    throw new Error("Truncated PGM image.");
  }

  return { width, height, pixels: Uint8Array.from(pixels) };
}

export function analyzePgmBuffer(buffer: Buffer, pageNumber: number): PageVisualAnalysis {
  const image = parsePgm(buffer);
  let nonWhiteCount = 0;
  let lastInkRow = -1;

  for (let row = 0; row < image.height; row += 1) {
    let rowHasInk = false;
    const rowOffset = row * image.width;

    for (let column = 0; column < image.width; column += 1) {
      if (image.pixels[rowOffset + column] < NON_WHITE_THRESHOLD) {
        nonWhiteCount += 1;
        rowHasInk = true;
      }
    }

    if (rowHasInk) {
      lastInkRow = row;
    }
  }

  const totalPixels = image.width * image.height;
  const inkCoverageRatio = totalPixels === 0 ? 0 : nonWhiteCount / totalPixels;
  const isBlank = lastInkRow < 0 || inkCoverageRatio < 0.0005;
  const bottomWhitespaceRatio =
    isBlank || image.height === 0 ? 1 : Math.max(0, (image.height - 1 - lastInkRow) / image.height);

  return {
    pageNumber,
    isBlank,
    inkCoverageRatio,
    bottomWhitespaceRatio,
  };
}

function previewUnavailableWarning(message: string): DiagnosticWarning {
  return createWarning("PREVIEW_UNAVAILABLE", "info", message);
}

export async function generatePdfPreviewsAndReview(
  artifactPath: string,
  request: ValidatedExportRequest,
  actualPageCount: number,
  persistPreviews: boolean,
): Promise<PdfReviewResult> {
  const warnings: DiagnosticWarning[] = [];
  const pageAnalyses: PageVisualAnalysis[] = [];

  const available = isPdfRasterizerAvailable();
  if (!available) {
    if (persistPreviews) {
      warnings.push(
        previewUnavailableWarning(
          "Preview generation for flow/css-print PDFs requires the pdftoppm binary.",
        ),
      );
    }

    return { previewPaths: [], pageAnalyses, warnings };
  }

  const previewPaths = persistPreviews ? resolvePreviewPaths(request, actualPageCount) : [];
  const tempDirectory = mkdtempSync(join(tmpdir(), "web-export-pdf-review-"));

  try {
    for (let pageNumber = 1; pageNumber <= actualPageCount; pageNumber += 1) {
      const analysisPrefix = join(tempDirectory, `analysis-${pageNumber}`);
      const analysisRun = runRasterizer([
        "-gray",
        "-r",
        String(ANALYSIS_DPI),
        "-f",
        String(pageNumber),
        "-l",
        String(pageNumber),
        "-singlefile",
        artifactPath,
        analysisPrefix,
      ]);

      if (!analysisRun.ok) {
        warnings.push(
          createWarning(
            "LAYOUT_REVIEW_FAILED",
            "warning",
            "Low-resolution PDF review failed; layout diagnostics are incomplete.",
            { pageNumber, cause: analysisRun.stderr },
          ),
        );
        break;
      }

      const analysisBuffer = readFileSync(`${analysisPrefix}.pgm`);
      pageAnalyses.push(analyzePgmBuffer(analysisBuffer, pageNumber));

      if (persistPreviews) {
        const previewPrefix = join(tempDirectory, `preview-${pageNumber}`);
        const previewRun = runRasterizer([
          "-png",
          "-f",
          String(pageNumber),
          "-l",
          String(pageNumber),
          "-singlefile",
          artifactPath,
          previewPrefix,
        ]);

        if (!previewRun.ok) {
          warnings.push(
            previewUnavailableWarning(
              "Preview generation failed while rasterizing the PDF pages.",
            ),
          );
          return { previewPaths: [], pageAnalyses, warnings };
        }

        renameSync(`${previewPrefix}.png`, previewPaths[pageNumber - 1]);
      }
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  return {
    previewPaths,
    pageAnalyses,
    warnings,
  };
}
