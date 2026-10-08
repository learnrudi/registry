import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { BrowserContext } from 'playwright';

const DOCUMENT_ORIGIN = 'https://rudi-document.invalid';
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MIME: Record<string, string> = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
};

/** Render from a virtual origin: Chromium never receives host file URLs or network access. */
export async function prepareDocumentContext(context: BrowserContext, inputPath: string): Promise<string> {
  const input = realpathSync(inputPath);
  const root = dirname(input);
  let bytes = 0;
  let requests = 0;
  await context.setOffline(true);
  await context.addInitScript(() => {
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
    }
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    try {
      const url = new URL(route.request().url());
      if (url.origin !== DOCUMENT_ORIGIN || route.request().method() !== 'GET' || ++requests > 512) {
        await route.abort('blockedbyclient'); return;
      }
      const file = realpathSync(resolve(root, '.' + decodeURIComponent(url.pathname)));
      const pathWithinRoot = relative(root, file);
      const contentType = MIME[extname(file).toLowerCase()];
      const stat = statSync(file);
      if (isAbsolute(pathWithinRoot) || pathWithinRoot === '..' || pathWithinRoot.startsWith('..' + sep) || !contentType || !stat.isFile() || stat.nlink !== 1 || stat.size > MAX_ASSET_BYTES || bytes + stat.size > MAX_DOCUMENT_BYTES) {
        await route.abort('blockedbyclient'); return;
      }
      const body = readFileSync(file);
      bytes += body.length;
      if (body.length > MAX_ASSET_BYTES || bytes > MAX_DOCUMENT_BYTES) { await route.abort('blockedbyclient'); return; }
      await route.fulfill({ status: 200, contentType, body, headers: {
        'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
        'X-Content-Type-Options': 'nosniff',
      } });
    } catch { await route.abort('blockedbyclient'); }
  });
  return `${DOCUMENT_ORIGIN}/${encodeURIComponent(basename(input))}`;
}
