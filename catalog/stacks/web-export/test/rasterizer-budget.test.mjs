import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { generatePdfPreviewsAndReview } from '../dist/review-pdf.js';

async function withRasterizer(script, callback) {
  const root = mkdtempSync(join(tmpdir(), 'rasterizer-budget-'));
  const previousPath = process.env.PATH;
  try {
    const pdf = await PDFDocument.create(); pdf.addPage([72, 72]);
    const artifact = join(root, 'input.pdf'); writeFileSync(artifact, await pdf.save());
    writeFileSync(join(root, 'pdftoppm'), `#!${process.execPath}\n${script}`, { mode: 0o755 });
    process.env.PATH = root + delimiter + previousPath;
    await callback(artifact, root);
  } finally {
    process.env.PATH = previousPath;
    rmSync(root, { recursive: true, force: true });
  }
}

test('rasterization cannot outlive the shared operation deadline', async () => {
  await withRasterizer(`if(process.argv.includes('-v'))process.exit(0);
setTimeout(()=>require('node:fs').writeFileSync(process.argv.at(-1)+'.pgm',Buffer.from('P5\\n1 1\\n255\\n\\xff','latin1')),600);`, async (artifact, root) => {
    const started = Date.now();
    const request = { deadlineAt: started + 250, outputBytes: 0, dpi: 150, scale: 1, outputTarget: join(root, 'output.pdf') };
    await assert.rejects(() => generatePdfPreviewsAndReview(artifact, request, 1, false), /deadline|time budget/);
    assert.ok(Date.now() - started < 1500, 'child must terminate promptly');
  });
});

test('temporary analysis and persisted previews share the output byte budget', async () => {
  const script = `if(process.argv.includes('-v'))process.exit(0);
const fs=require('node:fs'),prefix=process.argv.at(-1);
if(process.argv.includes('-png'))fs.writeFileSync(prefix+'.png',Buffer.alloc(20));
else fs.writeFileSync(prefix+'.pgm',Buffer.from('P5\\n1 1\\n255\\n\\xff','latin1'));`;
  for (const [remaining, preview] of [[10, false], [24, true]]) {
    await withRasterizer(script, async (artifact, root) => {
      const request = { deadlineAt: Date.now() + 3000, outputBytes: 128 * 1024 * 1024 - remaining, dpi: 150, scale: 1, inputStem: 'output', outputProvided: true, outputTarget: join(root, 'output.pdf') };
      await assert.rejects(() => generatePdfPreviewsAndReview(artifact, request, 1, preview), /output.*budget|128 MiB/);
    });
  }
});
