#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '../src/config/env.js';
import { closePool, getDatabasePool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import { resolveBootstrapOrganization, resolveBootstrapUser } from '../src/domain/assets.js';
import { registerExternalMedia } from '../src/domain/media.js';
import { createDraft, enqueuePublish, getPublishJob } from '../src/domain/posts.js';
import { runPublishWorkerOnce } from '../src/workers/publish-worker.js';

const MAX_BATCH_ITEMS = 50;
const DEFAULT_VIDEO_MIME_TYPE = 'video/mp4';
const DEFAULT_THUMBNAIL_MIME_TYPE = 'image/jpeg';
const VALID_PRIVACY_STATUSES = new Set(['private', 'unlisted', 'public']);

function getOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const manifestPath = getOption(argv, '--manifest');
  const live = argv.includes('--live');
  const cleanupDb = argv.includes('--cleanup-db');

  if (!manifestPath) {
    throw new Error('--manifest is required');
  }

  if (live && cleanupDb) {
    throw new Error('--cleanup-db is only allowed for dry-run batch jobs');
  }

  return {
    manifestPath,
    assetId: getOption(argv, '--asset-id'),
    live,
    dryRun: !live,
    enqueueOnly: argv.includes('--enqueue-only'),
    keep: argv.includes('--keep') || live,
    cleanupDb,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertHttpsUrl(value, fieldName, index) {
  if (typeof value !== 'string') {
    throw new Error(`items[${index}].${fieldName} must be a string`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`items[${index}].${fieldName} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`items[${index}].${fieldName} must use HTTPS`);
  }

  return parsed.toString();
}

function readString(raw, fieldNames, index, { required = false, defaultValue = '', maxLength } = {}) {
  const fieldName = fieldNames.find((name) => Object.prototype.hasOwnProperty.call(raw, name));
  const value = fieldName ? raw[fieldName] : undefined;

  if ((value === undefined || value === null || value === '') && required) {
    throw new Error(`items[${index}].${fieldNames[0]} is required`);
  }

  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== 'string') {
    throw new Error(`items[${index}].${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new Error(`items[${index}].${fieldName} is required`);
  }

  if (maxLength && trimmed.length > maxLength) {
    throw new Error(`items[${index}].${fieldName} is too long`);
  }

  return trimmed;
}

function readTags(raw, index) {
  if (!Object.prototype.hasOwnProperty.call(raw, 'tags')) {
    return [];
  }

  if (Array.isArray(raw.tags)) {
    return raw.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof raw.tags === 'string') {
    return raw.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }

  throw new Error(`items[${index}].tags must be an array or comma-separated string`);
}

function readBoolean(raw, fieldNames) {
  const fieldName = fieldNames.find((name) => Object.prototype.hasOwnProperty.call(raw, name));
  if (!fieldName) {
    return undefined;
  }

  return raw[fieldName] === true;
}

function readPositiveInteger(raw, fieldNames, index) {
  const fieldName = fieldNames.find((name) => Object.prototype.hasOwnProperty.call(raw, name));
  if (!fieldName || raw[fieldName] === undefined || raw[fieldName] === null || raw[fieldName] === '') {
    return null;
  }

  const parsed = Number(raw[fieldName]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`items[${index}].${fieldName} must be a positive integer`);
  }

  return parsed;
}

function normalizePrivacy(raw, index) {
  const privacy = readString(raw, ['privacy', 'privacy_status', 'privacyStatus'], index, {
    defaultValue: 'private',
  }).toLowerCase();

  if (!VALID_PRIVACY_STATUSES.has(privacy)) {
    throw new Error(`items[${index}].privacy must be private, unlisted, or public`);
  }

  return privacy;
}

function normalizeBatchItem(raw, index) {
  if (!isPlainObject(raw)) {
    throw new Error(`items[${index}] must be an object`);
  }

  const title = readString(raw, ['title'], index, { required: true, maxLength: 100 });
  const description = readString(raw, ['description', 'body'], index, { defaultValue: '', maxLength: 5_000 });
  const videoUrl = readString(raw, ['video_url', 'videoUrl', 'media_url', 'mediaUrl', 'url'], index, { required: true });
  const thumbnailUrl = readString(raw, ['thumbnail_url', 'thumbnailUrl'], index, { defaultValue: '' });
  const privacy = normalizePrivacy(raw, index);
  const categoryId = readString(raw, ['category_id', 'categoryId', 'category'], index, { defaultValue: '22' });
  const publishAt = readString(raw, ['publish_at', 'publishAt'], index, { defaultValue: '' });

  if (publishAt) {
    const parsed = Date.parse(publishAt);
    if (!Number.isFinite(parsed)) {
      throw new Error(`items[${index}].publish_at must be a valid ISO datetime`);
    }

    if (privacy !== 'private') {
      throw new Error(`items[${index}].publish_at requires privacy private`);
    }
  }

  const video = {
    sourceUrl: assertHttpsUrl(videoUrl, 'video_url', index),
    mediaKind: 'video',
    mimeType: readString(raw, ['video_mime_type', 'videoMimeType', 'mime_type', 'mimeType'], index, {
      defaultValue: DEFAULT_VIDEO_MIME_TYPE,
    }).toLowerCase(),
    bytes: readPositiveInteger(raw, ['video_bytes', 'videoBytes', 'bytes'], index),
  };

  const thumbnail = thumbnailUrl ? {
    sourceUrl: assertHttpsUrl(thumbnailUrl, 'thumbnail_url', index),
    mediaKind: 'image',
    mimeType: readString(raw, ['thumbnail_mime_type', 'thumbnailMimeType'], index, {
      defaultValue: DEFAULT_THUMBNAIL_MIME_TYPE,
    }).toLowerCase(),
    bytes: readPositiveInteger(raw, ['thumbnail_bytes', 'thumbnailBytes'], index),
  } : null;

  const tags = readTags(raw, index);
  const madeForKids = readBoolean(raw, ['made_for_kids', 'madeForKids', 'self_declared_made_for_kids']);

  return {
    index,
    title,
    description,
    mediaItems: thumbnail ? [video, thumbnail] : [video],
    metadata: {
      youtube: {
        title,
        description,
        privacy,
        tags,
        category_id: categoryId,
        ...(publishAt ? { publish_at: new Date(publishAt).toISOString() } : {}),
        ...(madeForKids !== undefined ? { made_for_kids: madeForKids } : {}),
      },
      batch: {
        source: 'youtube-batch-publish',
        item_index: index,
      },
    },
  };
}

async function readManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath);
  const payload = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  const items = Array.isArray(payload) ? payload : payload.items;

  if (!Array.isArray(items)) {
    throw new Error('Manifest must be an array or an object with an items array');
  }

  if (items.length === 0) {
    throw new Error('Manifest must include at least one item');
  }

  if (items.length > MAX_BATCH_ITEMS) {
    throw new Error(`Manifest cannot include more than ${MAX_BATCH_ITEMS} items`);
  }

  return {
    absolutePath,
    items: items.map((item, index) => normalizeBatchItem(item, index)),
  };
}

async function findYouTubeAsset(client, input) {
  if (input.assetId) {
    const result = await client.query(
      `
        select id, platform, name
        from social_assets
        where organization_id = $1
          and id = $2
          and platform = 'youtube'
      `,
      [input.organizationId, input.assetId],
    );

    return result.rows[0] ?? null;
  }

  const result = await client.query(
    `
      select id, platform, name
      from social_assets
      where organization_id = $1
        and platform = 'youtube'
        and active = true
        and status = 'healthy'
      order by lower(name) asc
      limit 1
    `,
    [input.organizationId],
  );

  return result.rows[0] ?? null;
}

async function createBatchJobs(pool, config, args, manifest, requestId) {
  return withTransaction(pool, async (client) => {
    const organization = await resolveBootstrapOrganization(client, config);
    const user = await resolveBootstrapUser(client, config, organization.id);
    const asset = await findYouTubeAsset(client, {
      organizationId: organization.id,
      assetId: args.assetId,
    });

    if (!asset) {
      throw new Error('No active healthy YouTube asset found for batch publish');
    }

    const jobs = [];
    const mediaAssetIds = [];

    for (const item of manifest.items) {
      const itemMediaAssetIds = [];

      for (const mediaItem of item.mediaItems) {
        const media = await registerExternalMedia(client, {
          organizationId: organization.id,
          actorUserId: user?.id ?? null,
          requestId,
          sourceType: 'external_url',
          sourceUrl: mediaItem.sourceUrl,
          mediaKind: mediaItem.mediaKind,
          mimeType: mediaItem.mimeType,
          bytes: mediaItem.bytes,
          metadata: {
            batch_request_id: requestId,
            batch_index: item.index,
            youtube_batch: true,
          },
        });

        itemMediaAssetIds.push(media.id);
        mediaAssetIds.push(media.id);
      }

      const draft = await createDraft(client, {
        organizationId: organization.id,
        actorUserId: user?.id ?? null,
        requestId,
        title: item.title,
        body: item.description,
        targetAssetIds: [asset.id],
        mediaAssetIds: itemMediaAssetIds,
        metadata: {
          ...item.metadata,
          manifest: {
            path: manifest.absolutePath,
          },
        },
      });

      const publish = await enqueuePublish(client, {
        organizationId: organization.id,
        postId: draft.post.id,
        actorUserId: user?.id ?? null,
        requestId,
        idempotencyKey: `${requestId}:publish:${item.index}`,
        dryRun: args.dryRun,
      });

      jobs.push({
        index: item.index,
        title: item.title,
        postId: draft.post.id,
        publishJobId: publish.job.id,
        mediaAssetIds: itemMediaAssetIds,
      });
    }

    return {
      organizationId: organization.id,
      asset,
      jobs,
      mediaAssetIds,
    };
  });
}

async function cleanupBatchData(pool, input) {
  await withTransaction(pool, async (client) => {
    if (input.postIds.length > 0) {
      await client.query(
        'delete from posts where organization_id = $1 and id = any($2::uuid[])',
        [input.organizationId, input.postIds],
      );
    }

    if (input.mediaAssetIds.length > 0) {
      await client.query(
        'delete from media_assets where organization_id = $1 and id = any($2::uuid[])',
        [input.organizationId, input.mediaAssetIds],
      );
    }

    await client.query(
      'delete from audit_events where organization_id = $1 and request_id = $2',
      [input.organizationId, input.requestId],
    );
  });
}

async function runBatchJobs(pool, config, batch, requestId) {
  const results = [];

  for (const job of batch.jobs) {
    const worker = await runPublishWorkerOnce(config, {
      publishJobId: job.publishJobId,
      workerId: `youtube-batch:${process.pid}:${job.index}`,
    });
    const final = await withTransaction(pool, async (client) => getPublishJob(client, {
      organizationId: batch.organizationId,
      publishJobId: job.publishJobId,
    }));

    results.push({
      index: job.index,
      title: job.title,
      post_id: job.postId,
      publish_job_id: job.publishJobId,
      worker_claimed: worker.claimed,
      job_status: final.job.status,
      post_status: final.aggregate.post.status,
      target_statuses: final.aggregate.targets.map((target) => ({
        id: target.id,
        platform: target.platform,
        status: target.status,
        error_code: target.last_error_code,
        platform_post_id: target.platform_post_id,
        permalink_url: target.permalink_url,
      })),
      attempt_statuses: final.aggregate.attempts.map((attempt) => ({
        id: attempt.id,
        platform: attempt.platform,
        status: attempt.status,
        error_code: attempt.error_code,
      })),
      request_id: requestId,
    });
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readManifest(args.manifestPath);
  const requestId = `youtube-batch:${Date.now()}:${randomUUID()}`;
  const config = getConfig();
  const pool = getDatabasePool(config);
  let batch;

  try {
    batch = await createBatchJobs(pool, config, args, manifest, requestId);
    const results = args.enqueueOnly ? [] : await runBatchJobs(pool, config, batch, requestId);

    console.log(JSON.stringify({
      request_id: requestId,
      live: args.live,
      dry_run: args.dryRun,
      enqueue_only: args.enqueueOnly,
      kept: args.keep,
      manifest: manifest.absolutePath,
      asset: {
        id: batch.asset.id,
        platform: batch.asset.platform,
        name: batch.asset.name,
      },
      job_count: batch.jobs.length,
      jobs: batch.jobs.map((job) => ({
        index: job.index,
        title: job.title,
        post_id: job.postId,
        publish_job_id: job.publishJobId,
      })),
      results,
    }, null, 2));
  } finally {
    if (batch && !args.keep) {
      await cleanupBatchData(pool, {
        organizationId: batch.organizationId,
        postIds: batch.jobs.map((job) => job.postId),
        mediaAssetIds: batch.mediaAssetIds,
        requestId,
      });
    }

    await closePool();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'youtube_batch_publish_failed',
    code: error.code ?? 'youtube_batch_publish_failed',
    message: error.message,
  }));
  process.exit(1);
});
