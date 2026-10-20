// Portable public HTTP boundary. Keep copies byte-identical across consumer stacks.
import { BlockList, isIP } from 'node:net';

const denied = new BlockList();
for (const [network, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
  denied.addSubnet(network, bits, 'ipv4');
}
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [network, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  denied.addSubnet(network, bits, 'ipv6');
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

export function parsePublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use http or https');
  if (url.username || url.password) throw new Error('URL credentials are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)
      || (isIP(host) && !isPublicAddress(host))) {
    throw new Error('URL must use a public network destination');
  }
  return url;
}

import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

function nativeRequest(url, options, callback) {
  return (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, options, callback);
}

async function vettedAddress(url, resolve) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error('DNS must resolve only to public network addresses');
  }
  return addresses[0];
}

function requestOne(url, address, options, request) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', agent: false, family: address.family, autoSelectFamily: false,
      signal: options.signal,
      // The original hostname remains in Host/SNI and certificate verification.
      // The TCP connection uses this vetted address without a second DNS lookup.
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { ...options.headers, 'Accept-Encoding': 'identity' },
    }, async response => {
      try {
        const status = response.statusCode ?? 502;
        const chunks = [];
        if (status >= 200 && status < 300) {
          const encoding = response.headers['content-encoding'];
          if (encoding && encoding !== 'identity') throw new Error('Encoded HTTP responses are not supported');
          const advertised = Number(response.headers['content-length'] ?? 0);
          if (advertised > options.maxBytes) throw new Error(`Response exceeds ${options.maxBytes} bytes`);
          let size = 0;
          for await (const chunk of response) {
            size += chunk.length;
            if (size > options.maxBytes) throw new Error(`Response exceeds ${options.maxBytes} bytes`);
            chunks.push(Buffer.from(chunk));
          }
        } else {
          response.destroy();
        }
        const body = [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
        const result = new Response(body, { status, statusText: response.statusMessage, headers: response.headers });
        Object.defineProperty(result, 'url', { value: url.toString() });
        resolve(result);
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    req.once('error', reject);
    req.end();
  });
}

function withDeadline(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function createPublicFetcher({ resolve = lookup, request = nativeRequest } = {}) {
  return async function fetchPublic(rawUrl, options = {}) {
    const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 * 1024) {
      throw new Error('maxBytes must be between 1 and 536870912');
    }
    const timeoutMs = options.timeoutMs ?? 15000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
      throw new Error('timeoutMs must be between 1 and 120000');
    }
    const headers = new Headers(options.headers);
    if (headers.has('authorization') || headers.has('cookie') || headers.has('proxy-authorization')) {
      throw new Error('Public HTTP fetch does not accept credential headers');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Public HTTP timeout')), timeoutMs);
    const settings = { maxBytes, headers: Object.fromEntries(headers), signal: controller.signal };
    try {
      let url = parsePublicUrl(rawUrl);
      for (let redirects = 0; ; redirects += 1) {
        const address = await withDeadline(vettedAddress(url, resolve), controller.signal);
        const response = await withDeadline(requestOne(url, address, settings, request), controller.signal);
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        if (redirects >= 5) throw new Error('Too many HTTP redirects');
        const location = response.headers.get('location');
        if (!location) throw new Error('HTTP redirect has no location');
        url = parsePublicUrl(new URL(location, url).toString());
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

export const publicHttp = { fetch: createPublicFetcher() };
