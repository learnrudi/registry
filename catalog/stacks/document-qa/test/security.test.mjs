import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { screenshotHtmlPages } from '../dist/index.js';

test('document QA rejects files outside operator-approved roots before rendering', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-security-'));
  const old = process.env.RUDI_DOCUMENT_QA_ROOTS;
  try {
    const approved = join(root, 'approved'); mkdirSync(approved);
    process.env.RUDI_DOCUMENT_QA_ROOTS = approved;
    const outside = join(root, 'private.html'); writeFileSync(outside, '<html><body>private</body></html>');
    await assert.rejects(() => screenshotHtmlPages(outside, join(root, 'screens')), /approved root/);
    const linked = join(approved, 'linked.html'); symlinkSync(outside, linked);
    await assert.rejects(() => screenshotHtmlPages(linked, join(root, 'screens')), /approved root/);
  } finally {
    if (old === undefined) delete process.env.RUDI_DOCUMENT_QA_ROOTS; else process.env.RUDI_DOCUMENT_QA_ROOTS = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test('approved document scripts cannot contact the host network', { skip: process.env.RUDI_VERIFY_OFFLINE === '1' ? 'Host listener fixture is forbidden by the offline verifier; run npm test outside it for browser egress proof.' : false }, async () => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.end('private'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = mkdtempSync(join(tmpdir(), 'qa-network-'));
  const old = process.env.RUDI_DOCUMENT_QA_ROOTS;
  process.env.RUDI_DOCUMENT_QA_ROOTS = root;
  try {
    const input = join(root, 'document.html');
    writeFileSync(input, `<html><body>Document<img src="http://127.0.0.1:${server.address().port}/private"></body></html>`);
    const screenshots = await screenshotHtmlPages(input, join(root, 'screens'));
    assert.equal(screenshots.length, 1);
    assert.equal(requests, 0);
  } finally {
    if (old === undefined) delete process.env.RUDI_DOCUMENT_QA_ROOTS; else process.env.RUDI_DOCUMENT_QA_ROOTS = old;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});
