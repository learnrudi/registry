import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireBrowserSession, navigateAndWait } from '../dist/browser.js';
import { validateExportRequest } from '../dist/validate.js';
import { renderFlowPdf } from '../dist/render-flow.js';
import { PDFDocument } from 'pdf-lib';

async function withDocument(html, callback, assets = {}) {
  const root = mkdtempSync(join(tmpdir(), 'print-security-'));
  let session;
  try {
    const input = join(root, 'document.html');
    writeFileSync(input, html);
    for (const [name, content] of Object.entries(assets)) writeFileSync(join(root, name), content);
    const request = validateExportRequest({ input, output: join(root, 'out.pdf') }, 'pdf');
    session = await acquireBrowserSession(request);
    await navigateAndWait(session, request);
    await callback(session.page, request);
  } finally {
    await session?.release();
    rmSync(root, { recursive: true, force: true });
  }
}

const cssPrint = { resolvedMode: 'css-print' };

test('imported and adopted print styles are checked before PDF allocation', async () => {
  for (const html of [
    '<style>@import "print.css";</style><body class="page">fixture</body>',
    '<body class="page">fixture<script>const s=new CSSStyleSheet();s.replaceSync("@page{size:20000px 20px}");document.adoptedStyleSheets=[s]</script></body>',
  ]) {
    await withDocument(html, async (page, request) => {
      let allocations = 0;
      page.pdf = async () => { allocations++; throw new Error('unexpected PDF allocation'); };
      await assert.rejects(() => renderFlowPdf(page, request, cssPrint), /budget/);
      assert.equal(allocations, 0);
    }, { 'print.css': '@page { size:20000px 20px }' });
  }
});

test('beforeprint layout runs once and is frozen before budget validation', async () => {
  await withDocument('<style>@page{size:100px 100px}</style><body>fixture<script>addEventListener("beforeprint",()=>document.styleSheets[0].cssRules[0].style.setProperty("size","20000px 20px"))</script></body>', async (page, request) => {
    let allocations = 0;
    page.pdf = async () => { allocations++; throw new Error('unexpected PDF allocation'); };
    await assert.rejects(() => renderFlowPdf(page, request, cssPrint), /budget/);
    assert.equal(allocations, 0);
  });
  await withDocument('<style>@page{size:100px 100px}</style><body>fixture<script>window.printCount=0;addEventListener("beforeprint",()=>{window.printCount++;document.styleSheets[0].cssRules[0].style.setProperty("size","200px 300px")})</script></body>', async (page, request) => {
    const result = await renderFlowPdf(page, request, cssPrint);
    const pdf = await PDFDocument.load(readFileSync(result.artifactPaths[0]));
    assert.equal(await page.evaluate(() => window.printCount), 1);
    assert.equal(pdf.getPages()[0].getWidth(), 150);
    assert.ok(Math.abs(pdf.getPages()[0].getHeight() - 225) < 0.5);
  });
});

test('forced print breaks cannot exceed aggregate pixels or silently truncate pages', async () => {
  const html = '<style>@page{size:2000px 3000px}p{break-after:page;height:1px}p:last-child{break-after:auto}</style><body>' + Array.from({ length: 20 }, (_, i) => `<p>Page ${i + 1}</p>`).join('') + '</body>';
  await withDocument(html, async (page, request) => {
    const originalPdf = page.pdf.bind(page);
    let requestedLastPage;
    page.pdf = async options => {
      requestedLastPage = Number(options.pageRanges.split('-')[1]);
      return originalPdf(options);
    };
    await assert.rejects(() => renderFlowPdf(page, request, cssPrint), /budget/);
    // At most 13 such pages fit, plus one sentinel to reject rather than truncate.
    assert.equal(requestedLastPage, 14);
  });
});

test('PNG rendering preserves a stable ready layout across timers and animations', async () => {
  const { renderFlowPng } = await import('../dist/render-flow.js');
  await withDocument('<style>@keyframes resize{from{height:10px}to{height:100px}}#animated{animation:resize 1s infinite alternate}</style><body><div id="timed">ready</div><div id="animated">layout</div><script>let size=10;setInterval(()=>document.getElementById("timed").style.height=(size++%100+10)+"px",10)</script></body>', async (page, request) => {
    request.format = 'png';
    request.outputTarget = request.outputTarget.replace(/pdf$/, 'png');
    const originalScreenshot = page.screenshot.bind(page);
    let before;
    let after;
    page.screenshot = async options => {
      const measure = () => ['timed', 'animated'].map(id => document.getElementById(id).getBoundingClientRect().height);
      before = await page.evaluate(measure);
      await new Promise(resolve => setTimeout(resolve, 150));
      after = await page.evaluate(measure);
      return originalScreenshot(options);
    };
    await renderFlowPng(page, request);
    assert.deepEqual(after, before);
  });
});
