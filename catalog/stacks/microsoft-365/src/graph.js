import { randomUUID } from 'node:crypto';
import { SafeError } from './contracts.js';

export const GRAPH = 'https://graph.microsoft.com';
const ID = '[A-Za-z0-9_+=-]{1,2048}';
const ENDPOINT = new RegExp(`^/me(?:/messages(?:/${ID}(?:/attachments(?:/${ID})?)?)?)?$`);
const MAX_JSON = 2 * 1024 * 1024;

export function identifier(value) {
  if (typeof value !== 'string' || !new RegExp(`^${ID}$`).test(value)) throw new SafeError('INPUT', 'Invalid message or attachment ID.');
  return encodeURIComponent(value);
}

function endpointUrl(endpoint) {
  // IDs are encoded exactly once by identifier; encoded path separators/dots are never allowed.
  if (!ENDPOINT.test(decodeURIComponent(endpoint)) || /%2f|%5c|%2e/i.test(endpoint)) {
    throw new SafeError('INPUT', 'Only fixed signed-in-user Outlook endpoints are supported.');
  }
  return new URL(`/v1.0${endpoint}`, GRAPH);
}

export function continuation(endpoint, parameters, link) {
  let next;
  let decodedPath;
  const expected = endpointUrl(endpoint);
  try { next = new URL(link); decodedPath = decodeURIComponent(next.pathname); }
  catch { throw new SafeError('CONTINUATION', 'Invalid continuation.'); }
  const fixedKeys = Object.keys(parameters);
  const keys = [...next.searchParams.keys()];
  if (next.origin !== GRAPH || next.username || next.password || next.hash ||
      decodedPath !== decodeURIComponent(expected.pathname) || /%2f|%5c|%2e/i.test(next.pathname) || link.length > 16000 ||
      keys.some(key => ![...fixedKeys, '$skip', '$skiptoken'].includes(key)) ||
      keys.some(key => next.searchParams.getAll(key).length !== 1) ||
      fixedKeys.some(key => next.searchParams.get(key) !== String(parameters[key])) ||
      (next.searchParams.has('$skip') && !/^\d{1,10}$/.test(next.searchParams.get('$skip')))) {
    throw new SafeError('CONTINUATION', 'Rejected continuation outside the current mailbox, endpoint or query.');
  }
  return next;
}

export class GraphClient {
  constructor(token, { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.token = token;
    this.fetch = fetchImpl;
    this.sleep = sleep;
  }

  async get(endpoint, parameters = {}, nextLink = null, maxBytes = MAX_JSON) {
    const url = nextLink ? continuation(endpoint, parameters, nextLink) : endpointUrl(endpoint);
    if (!nextLink) for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    if (typeof this.token !== 'string' || !this.token) throw new SafeError('AUTH_REQUIRED', 'Authenticate the named account first.');
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await this.fetch(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', Prefer: 'outlook.body-content-type="text"', 'client-request-id': randomUUID() } });
      } catch { throw new SafeError('GRAPH_UNAVAILABLE', 'Microsoft Graph request failed or timed out.'); }
      if (response.status !== 200) {
        await response.body?.cancel();
        const delay = retryDelay(response.headers.get('retry-after'), attempt);
        if ([429, 503, 504].includes(response.status) && attempt < 2 && delay !== null) {
          await this.sleep(delay);
          continue;
        }
        throw new SafeError(`GRAPH_HTTP_${response.status}`, `Microsoft Graph returned HTTP ${response.status}; no response body was retained.`);
      }
      return readJson(response, maxBytes);
    }
  }
}

function retryDelay(header, attempt) {
  if (!header) return 250 * (attempt + 1);
  const seconds = /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 2 ? seconds * 1000 : null;
}

export async function readJson(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new SafeError('PAYLOAD_LIMIT', 'Graph response exceeds the size limit. Narrow the request.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SafeError('GRAPH_PAYLOAD', 'Graph returned an empty response.');
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new SafeError('PAYLOAD_LIMIT', 'Graph response exceeds the size limit. Narrow the request.');
      parts.push(value);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { throw new SafeError('GRAPH_PAYLOAD', 'Graph returned invalid JSON.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SafeError('GRAPH_PAYLOAD', 'Graph returned an invalid object.');
    return data;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SafeError) throw error;
    throw new SafeError('GRAPH_UNAVAILABLE', 'Microsoft Graph response failed or timed out.');
  } finally { reader.releaseLock(); }
}
