import { readFileSync, statSync } from "fs";

import { PDFDocument } from "pdf-lib";

import type { PageDimension, VerificationResult } from "./types.js";
import { VerificationError } from "./types.js";

function parsePngDimensions(buffer: Buffer): PageDimension {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new VerificationError("INVALID_PNG", "Artifact is not a valid PNG file.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function verifyPdfArtifacts(paths: string[]): Promise<VerificationResult> {
  if (paths.length === 0) {
    throw new VerificationError("MISSING_ARTIFACT", "No PDF artifacts were produced.");
  }

  let actualPageCount = 0;
  let fileSizeBytes = 0;
  const pageDimensions: PageDimension[] = [];

  for (const path of paths) {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size === 0) {
      throw new VerificationError("INVALID_ARTIFACT", `Artifact is missing or zero bytes: ${path}`, {
        path,
      });
    }

    fileSizeBytes += stats.size;

    const pdf = await PDFDocument.load(readFileSync(path));
    actualPageCount += pdf.getPageCount();

    for (const page of pdf.getPages()) {
      pageDimensions.push({ width: page.getWidth(), height: page.getHeight() });
    }
  }

  return { artifactPaths: paths, actualPageCount, fileSizeBytes, pageDimensions };
}

export function verifyPngArtifacts(paths: string[]): VerificationResult {
  if (paths.length === 0) {
    throw new VerificationError("MISSING_ARTIFACT", "No PNG artifacts were produced.");
  }

  let fileSizeBytes = 0;
  const pageDimensions: PageDimension[] = [];

  for (const path of paths) {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size === 0) {
      throw new VerificationError("INVALID_ARTIFACT", `Artifact is missing or zero bytes: ${path}`, {
        path,
      });
    }

    fileSizeBytes += stats.size;
    pageDimensions.push(parsePngDimensions(readFileSync(path)));
  }

  return {
    artifactPaths: paths,
    actualPageCount: paths.length,
    fileSizeBytes,
    pageDimensions,
  };
}
