import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireBrowserSession, navigateAndWait } from '../dist/browser.js';
import { validateExportRequest } from '../dist/validate.js';

test('local Chromium renders a document with its native sandbox enabled', async () => {
  const root = mkdtempSync(join(tmpdir(), 'render-startup-'));
  let session;
  try {
    const input = join(root, 'document.html');
    writeFileSync(input, '<html><body><h1>Browser startup</h1></body></html>');
    const request = validateExportRequest({ input, output: join(root, 'out.png') }, 'png');
    try {
      session = await acquireBrowserSession(request);
    } catch (error) {
      // This fixture uses only a local browser. Include its native startup
      // diagnostic so CI distinguishes missing libraries from sandbox errors.
      assert.fail(`${error.message}\n${error.details?.cause ?? ''}`);
    }
    await navigateAndWait(session, request);
    assert.equal(await session.page.locator('h1').textContent(), 'Browser startup');
  } finally {
    await session?.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test('active HTML cannot reach loopback services during rendering', { skip: process.env.RUDI_VERIFY_OFFLINE === '1' ? 'Host listener fixture is forbidden by the offline verifier; run npm test outside it for browser egress proof.' : false }, async () => {
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.end('private'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = mkdtempSync(join(tmpdir(), 'render-security-'));
  let session;
  try {
    const input = join(root, 'document.html');
    writeFileSync(input, `<html><body><img src="http://127.0.0.1:${server.address().port}/secret"><script>document.body.dataset.ready='yes'</script></body></html>`);
    const request = validateExportRequest({ input, output: join(root, 'out.png') }, 'png');
    session = await acquireBrowserSession(request);
    await navigateAndWait(session, request);
    assert.equal(await session.page.getAttribute('body', 'data-ready'), 'yes');
    assert.equal(requests, 0, 'rendering must make no host-network requests');
  } finally {
    await session?.release();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});

test('a caller cannot select an unapproved remote browser endpoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'render-endpoint-'));
  const previous = process.env.RUDI_WEB_EXPORT_BROWSER_ENDPOINT;
  delete process.env.RUDI_WEB_EXPORT_BROWSER_ENDPOINT;
  try {
    const input = join(root, 'document.html'); writeFileSync(input, '<html></html>');
    assert.throws(() => validateExportRequest({ input, browser_ws_endpoint: 'http://127.0.0.1:9222' }, 'png'), /operator-approved/);
  } finally {
    if (previous !== undefined) process.env.RUDI_WEB_EXPORT_BROWSER_ENDPOINT = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
