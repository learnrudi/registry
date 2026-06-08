import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const filesModuleUrl = pathToFileURL(path.resolve('src/lib/files.js')).href;

async function importFilesModule(env) {
  const previousVideoStateDir = process.env.RUDI_VIDEO_EDITOR_STATE_DIR;
  const previousRudiHome = process.env.RUDI_HOME;

  if ('RUDI_VIDEO_EDITOR_STATE_DIR' in env) {
    process.env.RUDI_VIDEO_EDITOR_STATE_DIR = env.RUDI_VIDEO_EDITOR_STATE_DIR;
  } else {
    delete process.env.RUDI_VIDEO_EDITOR_STATE_DIR;
  }

  if ('RUDI_HOME' in env) {
    process.env.RUDI_HOME = env.RUDI_HOME;
  } else {
    delete process.env.RUDI_HOME;
  }

  try {
    return await import(`${filesModuleUrl}?case=${Date.now()}-${Math.random()}`);
  } finally {
    if (previousVideoStateDir === undefined) {
      delete process.env.RUDI_VIDEO_EDITOR_STATE_DIR;
    } else {
      process.env.RUDI_VIDEO_EDITOR_STATE_DIR = previousVideoStateDir;
    }

    if (previousRudiHome === undefined) {
      delete process.env.RUDI_HOME;
    } else {
      process.env.RUDI_HOME = previousRudiHome;
    }
  }
}

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rudi-video-files-'));
  try {
    return await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('uses RUDI_VIDEO_EDITOR_STATE_DIR as the stack state root', async () => {
  await withTempDir(async (tempDir) => {
    const stateRoot = path.join(tempDir, 'state-root');
    const files = await importFilesModule({
      RUDI_VIDEO_EDITOR_STATE_DIR: stateRoot
    });

    assert.equal(files.stateRoot, path.resolve(stateRoot));
    assert.equal(files.runsRoot, path.join(path.resolve(stateRoot), 'runs'));
  });
});

test('uses RUDI_HOME when no stack-specific state root is set', async () => {
  await withTempDir(async (tempDir) => {
    const rudiHome = path.join(tempDir, 'home');
    const files = await importFilesModule({
      RUDI_HOME: rudiHome
    });

    assert.equal(
      files.stateRoot,
      path.join(path.resolve(rudiHome), 'state', 'stacks', 'video-editor')
    );
    assert.equal(
      files.runsRoot,
      path.join(path.resolve(rudiHome), 'state', 'stacks', 'video-editor', 'runs')
    );
  });
});

test('resolveRunDir only resolves slug lookups from state runs', async () => {
  await withTempDir(async (tempDir) => {
    const stateRoot = path.join(tempDir, 'state-root');
    const files = await importFilesModule({
      RUDI_VIDEO_EDITOR_STATE_DIR: stateRoot
    });

    const stateRun = path.join(files.runsRoot, 'shared-slug');
    const installLocalRunsRoot = path.join(files.videoAgentRoot, 'runs');
    const installLocalOnlyRun = path.join(
      installLocalRunsRoot,
      'install-local-only-test-run'
    );

    try {
      await fs.mkdir(stateRun, { recursive: true });
      await fs.mkdir(installLocalOnlyRun, { recursive: true });

      assert.equal(await files.resolveRunDir('shared-slug'), stateRun);
      await assert.rejects(
        () => files.resolveRunDir('install-local-only-test-run'),
        /Run not found: install-local-only-test-run/
      );
    } finally {
      await fs.rm(installLocalOnlyRun, {
        recursive: true,
        force: true
      });
    }
  });
});
