import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  errorMessage,
  getConfigStatus,
  redactSecrets,
  sanitizeCloudinaryResult,
  uploadVideo,
} from "../dist/core.js";

test("config status reports presence without exposing secrets", () => {
  const status = getConfigStatus({
    CLOUDINARY_CLOUD_NAME: "demo-cloud",
    CLOUDINARY_API_KEY: "api-key-value",
    CLOUDINARY_API_SECRET: "api-secret-value",
  });

  assert.equal(status.configured, true);
  assert.equal(status.cloud_name, "demo-cloud");
  assert.equal(status.api_key_present, true);
  assert.equal(status.api_secret_present, true);
  assert.deepEqual(status.missing, []);
  assert.equal(JSON.stringify(status).includes("api-key-value"), false);
  assert.equal(JSON.stringify(status).includes("api-secret-value"), false);
});

test("dry-run upload validates local video and returns planned public id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cloudinary-stack-"));
  const filePath = join(dir, "clip.mp4");
  writeFileSync(filePath, Buffer.from("fake mp4 bytes"));

  try {
    const result = await uploadVideo({
      file_path: filePath,
      folder: "brand/shortform/2026/story",
      public_id: "clip-final",
      tags: ["shortform", "test"],
    });

    assert.equal(result.dry_run, true);
    assert.equal(result.upload.public_id, "brand/shortform/2026/story/clip-final");
    assert.equal(result.upload.resource_type, "video");
    assert.equal(result.file.basename, "clip.mp4");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upload rejects relative paths", async () => {
  await assert.rejects(
    () =>
      uploadVideo({
        file_path: "clip.mp4",
        folder: "brand/shortform/2026/story",
        public_id: "clip-final",
      }),
    /absolute local path/
  );
});

test("cloudinary result sanitizer omits signature and api key fields", () => {
  const result = sanitizeCloudinaryResult({
    public_id: "folder/clip",
    secure_url: "https://res.cloudinary.com/demo/video/upload/v1/folder/clip.mp4",
    signature: "signature-value",
    api_key: "key-value",
    bytes: 100,
  });

  assert.deepEqual(result, {
    public_id: "folder/clip",
    bytes: 100,
    secure_url: "https://res.cloudinary.com/demo/video/upload/v1/folder/clip.mp4",
  });
});

test("error message preserves plain object provider errors", () => {
  assert.equal(errorMessage({ message: "upload failed" }), "upload failed");
  assert.equal(errorMessage({ error: { message: "quota exceeded" } }), '{"error":{"message":"quota exceeded"}}');
});

test("redaction removes cloudinary credentials from messages", () => {
  const message = "failed for cloudinary://key:secret@example and secret";
  const redacted = redactSecrets(message, {
    CLOUDINARY_API_KEY: "key",
    CLOUDINARY_API_SECRET: "secret",
    CLOUDINARY_URL: "cloudinary://key:secret@example",
  });

  assert.equal(redacted.includes("secret"), false);
  assert.equal(redacted.includes("cloudinary://key:"), false);
});
