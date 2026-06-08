import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_OUTPUT_DIR, STATE_DIR } from "../src/template-composer/constants.js";
import { outputMetadataPath } from "../src/template-composer/outputs.js";
import {
  getVideoRenderJob,
  listVideoTemplates,
  readOutputMetadataForTests,
  renderVideoTemplate,
  resetRenderRuntimeForTests,
  setRenderRuntimeForTests,
  setVideoValidatorForTests,
} from "../src/template-composer/tools.js";
import { resetRenderJobsForTests, waitForRenderJobForTests } from "../src/template-composer/render_jobs.js";
import { ToolError } from "../src/template-composer/errors.js";

function uniqueOutput(name: string): string {
  return join(DEFAULT_OUTPUT_DIR, `video-editor-template-test-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);
}

function uniqueAsset(name: string): string {
  return join(DEFAULT_OUTPUT_DIR, `video-editor-template-test-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
}

function cleanup(path: string): void {
  rmSync(path, { force: true });
  rmSync(outputMetadataPath(path), { force: true });
}

test.afterEach(() => {
  resetRenderRuntimeForTests();
  resetRenderJobsForTests();
});

test.after(() => {
  rmSync(DEFAULT_OUTPUT_DIR, { recursive: true, force: true });
  rmSync(STATE_DIR, { recursive: true, force: true });
  const testRoot = dirname(DEFAULT_OUTPUT_DIR);
  if (basename(testRoot) === ".test-rudi") {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test("listVideoTemplates returns the initial Remotion template", () => {
  const result = listVideoTemplates();

  assert.equal(result.ok, true);
  const templates = result.templates as Array<Record<string, unknown>>;
  assert.equal(templates.length, 5);
  const statCard = templates.find((template) => template.template_id === "stat-card-short");
  const playbook = templates.find((template) => template.template_id === "playbook-story");
  const quoteReel = templates.find((template) => template.template_id === "quote-reel");
  const productDemo = templates.find((template) => template.template_id === "product-demo-sequence");
  const beforeAfter = templates.find((template) => template.template_id === "before-after-demo");
  assert.deepEqual(statCard?.formats, ["story", "landscape", "square", "portrait"]);
  assert.deepEqual(playbook?.allowed_duration_seconds, [30, 45, 60, 90]);
  assert.deepEqual(quoteReel?.allowed_duration_seconds, [10, 15, 30]);
  assert.equal(productDemo?.default_style, "launch");
  assert.equal(beforeAfter?.default_style, "studio");
  assert.deepEqual(beforeAfter?.allowed_duration_seconds, [10, 15, 30]);
  const productAssets = productDemo?.asset_schema as { properties: Record<string, unknown> };
  assert.deepEqual(Object.keys(productAssets.properties), [
    "logo",
    "hero_image",
    "screenshot_1",
    "screenshot_2",
    "screenshot_3",
    "screenshot_4",
    "screenshot_5",
  ]);
  const beforeAfterAssets = beforeAfter?.asset_schema as { properties: Record<string, unknown> };
  assert.deepEqual(Object.keys(beforeAfterAssets.properties), ["before_image", "after_image", "logo"]);
});

test("renderVideoTemplate rejects unsupported duration overrides before rendering", async () => {
  await assert.rejects(
    () =>
      renderVideoTemplate({
        template_id: "stat-card-short",
        duration_seconds: 30,
        data: {
          eyebrow: "Market",
          headline: "A useful headline",
          stat: "77%",
          caption: "A useful caption.",
        },
      }),
    (error) => error instanceof ToolError && error.error_kind === "validation"
  );
});

test("renderVideoTemplate validates playbook-story sections", async () => {
  await assert.rejects(
    () =>
      renderVideoTemplate({
        template_id: "playbook-story",
        data: {
          title: "Workflow playbook",
          sections: [
            {
              eyebrow: "Move 1",
              headline: "Map the work",
            },
          ],
        },
      }),
    (error) => error instanceof ToolError && error.error_kind === "validation"
  );
});

test("renderVideoTemplate rejects unknown styles before rendering", async () => {
  await assert.rejects(
    () =>
      renderVideoTemplate({
        template_id: "quote-reel",
        style: "unknown-style",
        data: {
          quote: "A useful quote.",
          speaker: "RUDI",
        },
      }),
    (error) => error instanceof ToolError && error.error_kind === "validation"
  );
});

test("renderVideoTemplate rejects unknown product demo asset keys", async () => {
  await assert.rejects(
    () =>
      renderVideoTemplate({
        template_id: "product-demo-sequence",
        assets: {
          screenshot_extra: "/tmp/not-read.png",
        },
        data: {
          product: "RUDI",
          promise: "A useful product promise.",
          steps: [
            { label: "One", headline: "First useful step" },
            { label: "Two", headline: "Second useful step" },
          ],
        },
      }),
    (error) => error instanceof ToolError && error.error_kind === "validation"
  );
});

test("renderVideoTemplate rejects unknown before-after asset keys", async () => {
  await assert.rejects(
    () =>
      renderVideoTemplate({
        template_id: "before-after-demo",
        assets: {
          screenshot_1: "/tmp/not-read.png",
        },
        data: {
          title: "A useful before after title",
          before_label: "Before",
          after_label: "After",
        },
      }),
    (error) => error instanceof ToolError && error.error_kind === "validation"
  );
});

test("renderVideoTemplate rejects output paths outside ~/.rudi/outputs", async () => {
  await assert.rejects(
    () =>
      renderVideoTemplate({
        template_id: "stat-card-short",
        data: {
          eyebrow: "Market",
          headline: "A useful headline",
          stat: "77%",
          caption: "A useful caption.",
        },
        out_path: "/tmp/rudi-video-editor-template-outside.mp4",
      }),
    (error) => error instanceof ToolError && error.error_kind === "validation"
  );
});

test("renderVideoTemplate rejects existing output paths", async () => {
  const outPath = uniqueOutput("existing");
  mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  writeFileSync(outPath, "already here");
  try {
    await assert.rejects(
      () =>
        renderVideoTemplate({
          template_id: "stat-card-short",
          data: {
            eyebrow: "Market",
            headline: "A useful headline",
            stat: "77%",
            caption: "A useful caption.",
          },
          out_path: outPath,
        }),
      (error) => error instanceof ToolError && error.error_kind === "validation"
    );
  } finally {
    cleanup(outPath);
  }
});

test("renderVideoTemplate creates a job and writes metadata after fake render success", async () => {
  const outPath = uniqueOutput("success");
  setRenderRuntimeForTests(async ({ outputPath, onProgress }) => {
    onProgress(42);
    writeFileSync(outputPath, Buffer.from("fake mp4"));
    return { remotion_version: "test-remotion" };
  });
  setVideoValidatorForTests(async (_videoPath, format, expectedDurationSeconds) => {
    assert.equal(format, "landscape");
    assert.equal(expectedDurationSeconds, 10);
    return {
      bytes: 8,
      width: 1920,
      height: 1080,
      duration_seconds: 10,
      codec: "h264",
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };
  });

  try {
    const initial = await renderVideoTemplate({
      template_id: "stat-card-short",
      format: "landscape",
      style: "dashboard",
      duration_seconds: 10,
      data: {
        eyebrow: "Market",
        headline: "A useful headline",
        stat: "77%",
        caption: "A useful caption.",
      },
      out_path: outPath,
    });

    assert.equal(initial.ok, true);
    const jobId = initial.job_id as string;
    const completed = await waitForRenderJobForTests(jobId);
    assert.equal(completed.status, "completed");
    assert.equal(completed.progress, 100);

    const jobResult = getVideoRenderJob({ job_id: jobId });
    assert.equal(jobResult.ok, true);
    const metadata = readOutputMetadataForTests(outputMetadataPath(outPath)) as Record<string, unknown>;
    assert.equal(metadata.schema, "rudi.video-editor.template-output.v1");
    assert.equal(metadata.template_id, "stat-card-short");
    assert.equal(metadata.format, "landscape");
    assert.equal(metadata.style, "dashboard");
    assert.equal(metadata.duration_seconds, 10);
    assert.equal(metadata.remotion_version, "test-remotion");
    assert.match(String(metadata.input_hash), /^sha256:/);
  } finally {
    cleanup(outPath);
  }
});

test("renderVideoTemplate passes validated product demo assets to the render runtime", async () => {
  const outPath = uniqueOutput("asset-success");
  const assetPath = uniqueAsset("logo");
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  writeFileSync(assetPath, pngBytes);
  let seenAssetPath = "";
  setRenderRuntimeForTests(async ({ request, outputPath, onProgress }) => {
    seenAssetPath = request.assets.logo;
    onProgress(42);
    writeFileSync(outputPath, Buffer.from("fake mp4"));
    return { remotion_version: "test-remotion" };
  });
  setVideoValidatorForTests(async (_videoPath, format, expectedDurationSeconds) => {
    assert.equal(format, "landscape");
    assert.equal(expectedDurationSeconds, 30);
    return {
      bytes: 8,
      width: 1920,
      height: 1080,
      duration_seconds: 30,
      codec: "h264",
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    };
  });

  try {
    const initial = await renderVideoTemplate({
      template_id: "product-demo-sequence",
      format: "landscape",
      duration_seconds: 30,
      assets: {
        logo: assetPath,
        screenshot_1: assetPath,
      },
      data: {
        product: "RUDI",
        promise: "A useful product promise.",
        steps: [
          { label: "One", headline: "First useful step" },
          { label: "Two", headline: "Second useful step" },
        ],
      },
      out_path: outPath,
    });

    assert.equal(initial.ok, true);
    const completed = await waitForRenderJobForTests(initial.job_id as string);
    assert.equal(completed.status, "completed");
    assert.equal(seenAssetPath, assetPath);
  } finally {
    cleanup(outPath);
    rmSync(assetPath, { force: true });
  }
});
