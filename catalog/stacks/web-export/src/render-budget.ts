import { RenderError } from './types.js';
import type { ValidatedExportRequest } from './types.js';

export const MAX_RENDER_DIMENSION = 16384;
export const MAX_RENDER_PAGES = 100;
export const MAX_PAGE_PIXELS = 40_000_000;
export const MAX_TOTAL_PIXELS = 200_000_000;
export const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

export function assertRenderBudget(metrics: Array<{ width: number; height: number }>, scale = 1): void {
  let pixels = 0;
  if (metrics.length > MAX_RENDER_PAGES) throw new RenderError('RENDER_BUDGET_EXCEEDED', 'Render page count exceeds the 100-page limit.');
  for (const metric of metrics) {
    const area = metric.width * metric.height * scale * scale;
    pixels += area;
    if (!Number.isFinite(area) || metric.width <= 0 || metric.height <= 0 || metric.width > MAX_RENDER_DIMENSION || metric.height > MAX_RENDER_DIMENSION || area > MAX_PAGE_PIXELS || pixels > MAX_TOTAL_PIXELS) {
      throw new RenderError('RENDER_BUDGET_EXCEEDED', 'Render dimensions or aggregate pixel budget exceeded.');
    }
  }
}

export function assertOutputBudget(bytes: number): void {
  if (bytes > MAX_OUTPUT_BYTES) throw new RenderError('RENDER_BUDGET_EXCEEDED', 'Rendered output exceeds the 128 MiB budget.');
}

export function remainingRenderMs(request?: Pick<ValidatedExportRequest, 'deadlineAt'>): number {
  const remaining = (request?.deadlineAt ?? Date.now() + 60_000) - Date.now();
  if (remaining <= 0) throw new RenderError('RENDER_BUDGET_EXCEEDED', 'Render operation exceeded its time budget deadline.');
  return remaining;
}

export function consumeOutputBudget(request: ValidatedExportRequest, bytes: number): void {
  remainingRenderMs(request);
  const total = (request.outputBytes ?? 0) + bytes;
  assertOutputBudget(total);
  request.outputBytes = total;
}

export async function assertFlowBudget(page: import('playwright').Page, request: import('./types.js').ValidatedExportRequest): Promise<number> {
  const metrics = await page.evaluate(() => {
    const pageSizes: string[] = [];
    const visited = new Set<CSSStyleSheet>();
    const visitSheet = (sheet: CSSStyleSheet) => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      visit(sheet.cssRules);
    };
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.PAGE_RULE) pageSizes.push((rule as CSSPageRule).style.getPropertyValue('size'));
        if (rule.type === CSSRule.IMPORT_RULE) {
          const imported = (rule as CSSImportRule).styleSheet;
          if (imported) visitSheet(imported);
        }
        if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]) visitSheet(sheet);
    return {
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), pageSizes,
    };
  });
  const cssSizes = (metrics.pageSizes ?? []).map(size => assertCssPageSize(size, Math.max(request.scale, request.dpi / 96))).filter((size): size is { width: number; height: number } => size !== undefined);
  if (request.format === 'png') { assertRenderBudget([metrics], request.scale); return 1; }
  const width = Math.max(request.pageSize.width * (request.pageSize.unit === 'in' ? 96 : 1), ...cssSizes.map(size => size.width));
  const defaultHeight = request.pageSize.height * (request.pageSize.unit === 'in' ? 96 : 1);
  const height = Math.max(defaultHeight, ...cssSizes.map(size => size.height));
  const scale = Math.max(request.scale, request.dpi / 96);
  assertRenderBudget([{ width, height }], scale);
  // Forced CSS page breaks are not reflected by scrollHeight. Bound Chromium's
  // allocation independently, reserving one sentinel page to detect truncation.
  const maxPages = Math.min(MAX_RENDER_PAGES, Math.floor(MAX_TOTAL_PIXELS / (width * height * scale * scale)));
  const pages = Math.ceil(metrics.height / Math.min(defaultHeight, ...cssSizes.map(size => size.height)));
  if (pages > maxPages || metrics.width > MAX_RENDER_DIMENSION || metrics.width * metrics.height > MAX_TOTAL_PIXELS) {
    throw new RenderError('RENDER_BUDGET_EXCEEDED', 'Flow document exceeds the render budget.');
  }
  return maxPages;
}

function assertCssPageSize(value: string, scale: number): { width: number; height: number } | undefined {
  const size = value.trim().toLowerCase();
  if (!size || ['auto', 'portrait', 'landscape'].includes(size)) return;
  const presets: Record<string, [number, number]> = { letter: [816, 1056], legal: [816, 1344], ledger: [1632, 1056], a3: [1123, 1587], a4: [794, 1123], a5: [559, 794], a6: [397, 559], b4: [945, 1334], b5: [665, 945] };
  const [preset, orientation] = size.split(/\s+/);
  if (presets[preset] && (!orientation || ['portrait', 'landscape'].includes(orientation))) {
    const [a, b] = presets[preset];
    const dimensions = orientation === 'landscape' ? { width: Math.max(a, b), height: Math.min(a, b) } : { width: a, height: b };
    assertRenderBudget([dimensions], scale);
    return dimensions;
  }
  const parts = size.split(/\s+/);
  const units: Record<string, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 };
  const dimensions = parts.map(part => {
    const match = /^(\d+(?:\.\d+)?)(px|in|cm|mm|pt|pc)$/.exec(part);
    return match ? Number(match[1]) * units[match[2]] : NaN;
  });
  if (dimensions.length < 1 || dimensions.length > 2) throw new RenderError('RENDER_BUDGET_EXCEEDED', 'CSS page size cannot be verified against render budget.');
  const result = { width: dimensions[0], height: dimensions[1] ?? dimensions[0] };
  assertRenderBudget([result], scale);
  return result;
}
