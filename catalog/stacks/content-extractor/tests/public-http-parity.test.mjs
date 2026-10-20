import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

// Each stack is independently installable. Compare every installed sibling;
// the canonical Registry catalog/stacks layout must still contain all copies.
test('independently packaged public HTTP boundaries stay byte-identical', async context => {
  const root = new URL('../../', import.meta.url);
  const paths = ['content-extractor/src/public-http.js', 'audio-tools/src/public-http.js',
    'newsletter-extractor/src/public-http.js', 'social-media-publisher/src/security/public-http.js'];
  const present = await Promise.all(paths.map(path =>
    access(new URL(`${path.split('/')[0]}/`, root)).then(() => true, error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    })));
  if (root.pathname.endsWith('/catalog/stacks/')) {
    assert.ok(present.every(Boolean), 'Every Registry transport stack must exist');
  }
  const installed = paths.filter((_, index) => present[index]);
  const contents = await Promise.all(installed.map(path => readFile(new URL(path, root), 'utf8')));
  if (installed.length === 1) { context.skip('Standalone package has no sibling stacks'); return; }
  for (const [index, source] of contents.entries()) assert.equal(source, contents[0], installed[index]);
});
