import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateExportRequest } from '../dist/validate.js';

test('custom artboard size is bounded before browser allocation', () => {
  const root = mkdtempSync(join(tmpdir(), 'render-budget-'));
  try {
    const input = join(root, 'document.html'); writeFileSync(input, '<html></html>');
    assert.throws(() => validateExportRequest({ input, artboard_size: [100000, 100000] }, 'png'), /budget|maximum|limit/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('DOM-derived artboards are budgeted before screenshots or PDF allocation', async () => {
  const { renderArtboardPng, renderArtboardPdf } = await import('../dist/render-art.js');
  const root = mkdtempSync(join(tmpdir(), 'art-budget-'));
  try {
    const input = join(root, 'document.html'); writeFileSync(input, '<html></html>');
    const request = validateExportRequest({ input, output: join(root, 'out'), mode: 'artboard' }, 'png');
    let allocations = 0;
    const page = {
      $$eval: async () => [{ index: 0, width: 20000, height: 20 }],
      evaluate: async () => ({ bodyStyle: null, htmlStyle: null, targetStyle: null }),
      waitForTimeout: async () => {}, emulateMedia: async () => {},
      context: () => ({ newCDPSession: async () => ({ send: async () => {} }) }),
      screenshot: async () => { allocations++; return Buffer.alloc(1); },
      pdf: async () => { allocations++; return Buffer.alloc(1); },
    };
    await assert.rejects(() => renderArtboardPng(page, request), /budget/);
    assert.equal(allocations, 0);
    await assert.rejects(() => renderArtboardPdf(page, { ...request, format: 'pdf' }), /budget/);
    assert.equal(allocations, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('flow dimensions are checked before requesting a full-page raster', async () => {
  const { renderFlowPng } = await import('../dist/render-flow.js');
  let allocations = 0;
  const page = {
    evaluate: async () => ({ width: 20000, height: 20, pageSizes: [], breaks: 0 }),
    context: () => ({ newCDPSession: async () => ({ send: async () => {} }) }),
    screenshot: async () => { allocations++; return Buffer.alloc(1); },
  };
  await assert.rejects(() => renderFlowPng(page, { format: 'png', inputStem: 'test', outputTarget: '/unused.png', outputProvided: true, scale: 1 }), /budget/);
  assert.equal(allocations, 0);
});

test('CSS print dimensions cannot bypass the PDF render budget', async () => {
  const { renderFlowPdf } = await import('../dist/render-flow.js');
  const { PDFDocument } = await import('pdf-lib');
  const root = mkdtempSync(join(tmpdir(), 'print-budget-'));
  try {
    const input = join(root, 'document.html'); writeFileSync(input, '<html></html>');
    const request = validateExportRequest({ input, output: join(root, 'out.pdf') }, 'pdf');
    const pdf = await PDFDocument.create(); pdf.addPage();
    let allocations = 0;
    const page = {
      evaluate: async () => ({ width: 100, height: 100, pageSizes: ['20000px 20px'] }),
      emulateMedia: async () => {},
      context: () => ({ newCDPSession: async () => ({ send: async () => {} }) }),
      pdf: async () => { allocations++; return Buffer.from(await pdf.save()); },
    };
    await assert.rejects(() => renderFlowPdf(page, request, { resolvedMode: 'css-print' }), /budget/);
    assert.equal(allocations, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PNG output bytes are checked before writing an oversized result', async () => {
  const { renderArtboardPng } = await import('../dist/render-art.js');
  const page = {
    $$eval: async () => [{ index: 0, width: 10, height: 10 }],
    context: () => ({ newCDPSession: async () => ({ send: async () => {} }) }),
    evaluate: async () => ({ bodyStyle: null, htmlStyle: null, targetStyle: null }),
    waitForTimeout: async () => {},
    screenshot: async () => ({ length: 128 * 1024 * 1024 + 1 }),
  };
  await assert.rejects(() => renderArtboardPng(page, { scale: 1, inputStem: 'test', outputTarget: '/unused.png', outputProvided: true }), /budget/);
});
