import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// A DOM fixture that makes unsafe HTML sinks an immediate test failure.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; }
  set innerHTML(value) { throw new Error(`Unsafe HTML sink: ${value}`); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  classList = { toggle() {}, remove() {}, add() {} };
}

function loadFrontend() {
  const html = readFileSync(new URL('../frontend/rudi_search.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    ?? readFileSync(new URL('../frontend/rudi_search.js', import.meta.url), 'utf8');
  const elements = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element('div'));
  const requests = [];
  const document = {
    createElement: tag => new Element(tag),
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, new Element('div'));
      return elements.get(id);
    },
  };
  const context = vm.createContext({ document, URLSearchParams, console, Set,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => url.includes('search') ? [] : {} };
    },
  });
  vm.runInContext(script, context);
  return { context, elements, requests };
}

function allElements(element) {
  return [element, ...element.children.flatMap(allElements)];
}

test('metadata is rendered as text and file click retains its literal path', () => {
  const { context, elements } = loadFrontend();
  const payload = '<img src=x onerror="globalThis.compromised=true">';
  const path = "');globalThis.compromised=true;//";
  let clicked;
  context.openFile = value => { clicked = value; };
  context.displayResults([{ original_name: payload, summary: payload, category: payload,
    file_type: payload, file_path: path, modified: '2026-10-08', size_bytes: 4 }]);
  const nodes = allElements(elements.get('results'));
  assert.ok(nodes.some(node => node.textContent.includes(payload)));
  assert.ok(nodes.every(node => !String(node.className).includes(payload)));
  nodes.find(node => node.className === 'result-card').listeners.click();
  assert.equal(clicked, path);
  assert.equal(context.compromised, undefined);
});

test('browser API requests use a user-entered bearer token only in the header', async () => {
  const { context, elements, requests } = loadFrontend();
  assert.equal(requests.length, 0, 'No API request before user connects');
  elements.get('apiToken').value = 'test-only-token';
  await context.connectApi();
  elements.get('searchInput').value = 'hello';
  await context.performSearch();
  assert.equal(elements.get('apiToken').value, '');
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.ok(request.url.startsWith('/api/'));
    assert.ok(!request.url.includes('test-only-token'));
    assert.equal(request.options.headers.Authorization, 'Bearer test-only-token');
  }
});
