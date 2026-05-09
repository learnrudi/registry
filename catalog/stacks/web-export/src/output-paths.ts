import { existsSync, mkdirSync, statSync } from "fs";
import { basename, dirname, extname, join } from "path";

import type { ValidatedExportRequest } from "./types.js";

function ensureDirectory(path: string) {
  mkdirSync(path, { recursive: true });
}

function isExistingDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

export function resolveMergedPdfPath(request: ValidatedExportRequest): string {
  if (extname(request.outputTarget).toLowerCase() === ".pdf") {
    ensureDirectory(dirname(request.outputTarget));
    return request.outputTarget;
  }

  if (isExistingDirectory(request.outputTarget)) {
    return join(request.outputTarget, `${request.inputStem}.pdf`);
  }

  if (request.outputProvided) {
    ensureDirectory(dirname(request.outputTarget));
    return `${request.outputTarget}.pdf`;
  }

  ensureDirectory(dirname(request.outputTarget));
  return request.outputTarget;
}

export function resolveFlowPngPath(request: ValidatedExportRequest): string {
  if (extname(request.outputTarget).toLowerCase() === ".png") {
    ensureDirectory(dirname(request.outputTarget));
    return request.outputTarget;
  }

  if (isExistingDirectory(request.outputTarget)) {
    return join(request.outputTarget, `${request.inputStem}.png`);
  }

  if (request.outputProvided) {
    ensureDirectory(dirname(request.outputTarget));
    return `${request.outputTarget}.png`;
  }

  ensureDirectory(dirname(request.outputTarget));
  return request.outputTarget;
}

function resolveMultiArtifactBase(
  request: ValidatedExportRequest,
  extension: ".pdf" | ".png",
): { directory: string; stem: string } {
  if (extname(request.outputTarget).toLowerCase() === extension) {
    return {
      directory: dirname(request.outputTarget),
      stem: basename(request.outputTarget, extension),
    };
  }

  if (isExistingDirectory(request.outputTarget)) {
    return {
      directory: request.outputTarget,
      stem: request.inputStem,
    };
  }

  if (request.outputProvided) {
    ensureDirectory(request.outputTarget);
    return {
      directory: request.outputTarget,
      stem: request.inputStem,
    };
  }

  ensureDirectory(dirname(request.outputTarget));
  return {
    directory: dirname(request.outputTarget),
    stem: basename(request.outputTarget, extname(request.outputTarget)),
  };
}

export function resolveArtboardPngPaths(
  request: ValidatedExportRequest,
  pageCount: number,
): string[] {
  const { directory, stem } = resolveMultiArtifactBase(request, ".png");
  ensureDirectory(directory);

  return Array.from({ length: pageCount }, (_, index) =>
    join(directory, `${stem}-page-${String(index + 1).padStart(2, "0")}.png`),
  );
}

export function resolveArtboardPdfPaths(
  request: ValidatedExportRequest,
  pageCount: number,
): { mergedPath: string; splitPaths: string[] } {
  const mergedPath = resolveMergedPdfPath(request);
  const { directory, stem } = resolveMultiArtifactBase(request, ".pdf");
  ensureDirectory(directory);

  return {
    mergedPath,
    splitPaths: Array.from({ length: pageCount }, (_, index) =>
      join(directory, `${stem}-page-${String(index + 1).padStart(2, "0")}.pdf`),
    ),
  };
}

export function resolvePreviewPaths(
  request: ValidatedExportRequest,
  pageCount: number,
): string[] {
  const targetExtension = extname(request.outputTarget).toLowerCase();
  const targetIsFile = targetExtension === ".pdf" || targetExtension === ".png";
  const parentDirectory = targetIsFile
    ? dirname(request.outputTarget)
    : isExistingDirectory(request.outputTarget)
      ? request.outputTarget
      : dirname(request.outputTarget);
  const stem = targetIsFile
    ? basename(request.outputTarget, targetExtension)
    : basename(request.outputTarget, extname(request.outputTarget)) || request.inputStem;
  const directory = join(parentDirectory, `${stem}-previews`);
  ensureDirectory(directory);

  return Array.from({ length: pageCount }, (_, index) =>
    join(directory, `page-${String(index + 1).padStart(2, "0")}.png`),
  );
}
