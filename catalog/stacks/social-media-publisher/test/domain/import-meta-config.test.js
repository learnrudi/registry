import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getDefaultMetaConfigPaths } from '../../src/domain/import-meta-config.js';

function withEnv(overrides, callback) {
  const keys = [
    'SOCIAL_MEDIA_CONFIG_DIR',
    'META_PAGES_CONFIG_PATH',
    'INSTAGRAM_CONFIG_PATH',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }
  Object.assign(process.env, overrides);

  try {
    callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test('getDefaultMetaConfigPaths defaults to RUDI state outside the package install', () => {
  withEnv({}, () => {
    const base = path.join(homedir(), '.rudi', 'state', 'stacks', 'social-media-publisher', 'platforms');

    assert.deepEqual(getDefaultMetaConfigPaths(), {
      pagesConfigPath: path.join(base, 'meta', 'pages-config.json'),
      instagramConfigPath: path.join(base, 'meta', 'instagram', 'instagram-config.json'),
    });
  });
});

test('getDefaultMetaConfigPaths honors explicit local path overrides', () => {
  withEnv({
    SOCIAL_MEDIA_CONFIG_DIR: '/tmp/social-config',
    META_PAGES_CONFIG_PATH: '/tmp/pages.json',
    INSTAGRAM_CONFIG_PATH: '/tmp/instagram.json',
  }, () => {
    assert.deepEqual(getDefaultMetaConfigPaths(), {
      pagesConfigPath: '/tmp/pages.json',
      instagramConfigPath: '/tmp/instagram.json',
    });
  });
});
