import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

// Each stack is independently installable. Repository runs enforce byte parity;
// standalone-package runs have no sibling catalog and retain behavioral tests.
test('independently packaged public HTTP boundaries stay byte-identical', async context => {
  const root = new URL('../../', import.meta.url);
  const paths = ['content-extractor/src/public-http.js', 'audio-tools/src/public-http.js',
    'newsletter-extractor/src/public-http.js', 'social-media-publisher/src/security/public-http.js'];
  const present = await Promise.all(paths.map(path => access(new URL(path, root)).then(() => true, () => false)));
  if (!present.slice(1).some(Boolean)) { context.skip('Standalone package has no sibling stacks'); return; }
  assert.ok(present.every(Boolean), 'Every sibling transport copy must exist');
  const contents = await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')));
  for (const [index, source] of contents.entries()) assert.equal(source, contents[0], paths[index]);
});
