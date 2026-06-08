import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const constantsUrl = pathToFileURL(resolve("src/template-composer/constants.ts")).href;

async function importConstants(env: Record<string, string | undefined>) {
  const previous = {
    RUDI_HOME: process.env.RUDI_HOME,
    RUDI_VIDEO_EDITOR_OUTPUT_DIR: process.env.RUDI_VIDEO_EDITOR_OUTPUT_DIR,
    RUDI_VIDEO_EDITOR_STATE_DIR: process.env.RUDI_VIDEO_EDITOR_STATE_DIR,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await import(`${constantsUrl}?case=${Date.now()}-${Math.random()}`);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withTempDir(fn: (tempDir: string) => Promise<void>) {
  const tempDir = await mkdtemp(join(tmpdir(), "rudi-video-template-paths-"));
  try {
    await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("template composer defaults outputs and state under RUDI_HOME", async () => {
  await withTempDir(async (tempDir) => {
    const rudiHome = join(tempDir, "home");
    const constants = await importConstants({
      RUDI_HOME: rudiHome,
      RUDI_VIDEO_EDITOR_OUTPUT_DIR: undefined,
      RUDI_VIDEO_EDITOR_STATE_DIR: undefined,
    });

    assert.equal(constants.DEFAULT_OUTPUT_DIR, join(resolve(rudiHome), "outputs"));
    assert.equal(
      constants.STATE_DIR,
      join(resolve(rudiHome), "state", "stacks", "video-editor", "template-composer")
    );
    assert.equal(constants.JOBS_DIR, join(constants.STATE_DIR, "jobs"));
    assert.equal(constants.BUNDLE_DIR, join(constants.STATE_DIR, "bundle"));
  });
});

test("template composer honors explicit output and stack state roots", async () => {
  await withTempDir(async (tempDir) => {
    const outputRoot = join(tempDir, "custom-outputs");
    const stateRoot = join(tempDir, "custom-state");
    const constants = await importConstants({
      RUDI_HOME: join(tempDir, "ignored-home"),
      RUDI_VIDEO_EDITOR_OUTPUT_DIR: outputRoot,
      RUDI_VIDEO_EDITOR_STATE_DIR: stateRoot,
    });

    assert.equal(constants.DEFAULT_OUTPUT_DIR, resolve(outputRoot));
    assert.equal(constants.STATE_DIR, join(resolve(stateRoot), "template-composer"));
  });
});
