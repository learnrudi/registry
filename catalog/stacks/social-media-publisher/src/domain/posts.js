import { recordAuditEvent } from '../db/repositories/audit-events.js';
import {
  completePublishAttempt,
  createPostRecord,
  findPostById,
  findPublishJobById,
  insertPublishJob,
  listMediaAssetsForPostAttach,
  listPostMedia,
  listPostTargets,
  listPublishAttemptsForPost,
  listSocialAssetsForPublish,
  queuePostTargets,
  updatePostStatus,
  upsertPostTarget,
  upsertPostMedia,
} from '../db/repositories/posts.js';
import { badRequest, conflict, notFound } from './errors.js';
import {
  derivePostStatusFromTargetStatuses,
  POST_STATUSES,
  TARGET_STATUSES,
} from './states.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 240;
const MAX_BODY_LENGTH = 100_000;
const MAX_TARGETS_PER_POST = 50;
const MAX_MEDIA_PER_POST = 20;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertUuid(value, fieldName) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw badRequest('invalid_uuid', `${fieldName} must be a UUID`, { field: fieldName });
  }

  return value;
}

function normalizeOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw badRequest('invalid_string', `${fieldName} must be a string`, { field: fieldName });
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest('string_too_long', `${fieldName} is too long`, {
      field: fieldName,
      max_length: maxLength,
    });
  }

  return trimmed || null;
}

function normalizeBody(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw badRequest('invalid_string', 'body must be a string', { field: 'body' });
  }

  if (value.length > MAX_BODY_LENGTH) {
    throw badRequest('string_too_long', 'body is too long', {
      field: 'body',
      max_length: MAX_BODY_LENGTH,
    });
  }

  return value;
}

function normalizeMetadata(value) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw badRequest('invalid_metadata', 'metadata must be an object', { field: 'metadata' });
  }

  return value;
}

function normalizeOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw badRequest('invalid_datetime', `${fieldName} must be an ISO datetime string`, { field: fieldName });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest('invalid_datetime', `${fieldName} must be a valid ISO datetime`, { field: fieldName });
  }

  return parsed;
}

function normalizeUuidArray(value, fieldName, maxItems) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw badRequest('invalid_array', `${fieldName} must be an array`, { field: fieldName });
  }

  if (value.length > maxItems) {
    throw badRequest('too_many_items', `${fieldName} has too many items`, {
      field: fieldName,
      max_items: maxItems,
    });
  }

  return [...new Set(value.map((item) => assertUuid(item, fieldName)))];
}

function getMissingIds(requestedIds, foundRows) {
  const found = new Set(foundRows.map((row) => row.id));
  return requestedIds.filter((id) => !found.has(id));
}

function getTargetValidationErrors(asset) {
  const errors = [];

  if (!asset.active) {
    errors.push({ code: 'asset_inactive', message: 'Asset is inactive' });
  }

  if (asset.status !== 'healthy') {
    errors.push({ code: 'asset_not_healthy', message: `Asset status is ${asset.status}` });
  }

  if (asset.connection_status !== 'healthy') {
    errors.push({
      code: 'connection_not_healthy',
      message: `Connection status is ${asset.connection_status}`,
    });
  }

  if (!asset.has_active_token) {
    errors.push({ code: 'missing_active_token', message: 'Asset does not have an active token' });
  }

  return errors;
}

async function attachMedia(client, input) {
  const mediaAssetIds = normalizeUuidArray(input.mediaAssetIds, 'media_asset_ids', MAX_MEDIA_PER_POST);
  if (mediaAssetIds.length === 0) {
    return [];
  }

  const mediaAssets = await listMediaAssetsForPostAttach(client, {
    organizationId: input.organizationId,
    mediaAssetIds,
  });
  const missingIds = getMissingIds(mediaAssetIds, mediaAssets);
  if (missingIds.length > 0) {
    throw badRequest('media_not_found', 'One or more media assets were not found', {
      media_asset_ids: missingIds,
    });
  }

  const unavailable = mediaAssets.filter((media) => media.status !== 'ready');
  if (unavailable.length > 0) {
    throw conflict('media_not_ready', 'One or more media assets are not ready', {
      media_asset_ids: unavailable.map((media) => media.id),
    });
  }

  const byId = new Map(mediaAssets.map((media) => [media.id, media]));
  const attached = [];
  for (const [index, mediaAssetId] of mediaAssetIds.entries()) {
    attached.push(await upsertPostMedia(client, {
      organizationId: input.organizationId,
      postId: input.postId,
      mediaAssetId,
      sortOrder: index,
      metadata: {
        media_kind: byId.get(mediaAssetId)?.media_kind,
      },
    }));
  }

  return attached;
}

export async function createDraft(client, input) {
  const title = normalizeOptionalString(input.title, 'title', MAX_TITLE_LENGTH);
  const body = normalizeBody(input.body);
  const metadata = normalizeMetadata(input.metadata);
  const scheduledAt = normalizeOptionalDate(input.scheduledAt, 'scheduled_at');

  const post = await createPostRecord(client, {
    organizationId: input.organizationId,
    createdByUserId: input.actorUserId,
    title,
    body,
    scheduledAt,
    metadata,
  });

  const media = await attachMedia(client, {
    organizationId: input.organizationId,
    postId: post.id,
    mediaAssetIds: input.mediaAssetIds,
  });

  const targets = await attachTargets(client, {
    organizationId: input.organizationId,
    postId: post.id,
    socialAssetIds: input.targetAssetIds,
    scheduledAt,
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    audit: false,
  });

  await recordAuditEvent(client, {
    organizationId: input.organizationId,
    actorType: input.actorUserId ? 'user' : 'system',
    actorUserId: input.actorUserId,
    action: 'post.create_draft',
    entityType: 'post',
    entityId: post.id,
    requestId: input.requestId,
    metadata: {
      target_count: targets.length,
      media_count: media.length,
    },
  });

  return getPostAggregate(client, {
    organizationId: input.organizationId,
    postId: post.id,
  });
}

export async function attachTargets(client, input) {
  const postId = assertUuid(input.postId, 'post_id');
  const post = await findPostById(client, {
    organizationId: input.organizationId,
    postId,
  });

  if (!post) {
    throw notFound('post_not_found', 'Post was not found', { post_id: postId });
  }

  const socialAssetIds = normalizeUuidArray(
    input.socialAssetIds,
    'social_asset_ids',
    MAX_TARGETS_PER_POST,
  );
  if (socialAssetIds.length === 0) {
    return [];
  }

  const assets = await listSocialAssetsForPublish(client, {
    organizationId: input.organizationId,
    socialAssetIds,
  });
  const missingIds = getMissingIds(socialAssetIds, assets);
  if (missingIds.length > 0) {
    throw badRequest('asset_not_found', 'One or more social assets were not found', {
      social_asset_ids: missingIds,
    });
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const targets = [];
  for (const socialAssetId of socialAssetIds) {
    const asset = byId.get(socialAssetId);
    const validationErrors = getTargetValidationErrors(asset);
    targets.push(await upsertPostTarget(client, {
      organizationId: input.organizationId,
      postId,
      socialAssetId,
      platform: asset.platform,
      status: validationErrors.length > 0 ? TARGET_STATUSES.FAILED : TARGET_STATUSES.VALID,
      scheduledAt: input.scheduledAt ?? null,
      validationErrors,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${socialAssetId}` : null,
      metadata: {
        asset_name: asset.name,
        asset_handle: asset.handle,
      },
    }));
  }

  if (input.audit !== false) {
    await recordAuditEvent(client, {
      organizationId: input.organizationId,
      actorType: input.actorUserId ? 'user' : 'system',
      actorUserId: input.actorUserId,
      action: 'post.attach_targets',
      entityType: 'post',
      entityId: postId,
      requestId: input.requestId,
      metadata: {
        target_count: targets.length,
      },
    });
  }

  return targets;
}

export async function getPostAggregate(client, input) {
  const postId = assertUuid(input.postId, 'post_id');
  const post = await findPostById(client, {
    organizationId: input.organizationId,
    postId,
  });

  if (!post) {
    throw notFound('post_not_found', 'Post was not found', { post_id: postId });
  }

  const targets = await listPostTargets(client, { organizationId: input.organizationId, postId });
  const media = await listPostMedia(client, { organizationId: input.organizationId, postId });
  const attempts = await listPublishAttemptsForPost(client, { organizationId: input.organizationId, postId });

  return {
    post,
    targets,
    media,
    attempts,
  };
}

export async function enqueuePublish(client, input) {
  const postId = assertUuid(input.postId, 'post_id');
  const idempotencyKey = normalizeOptionalString(input.idempotencyKey, 'idempotency_key', 200)
    ?? `post:${postId}:publish`;
  const runAfter = normalizeOptionalDate(input.runAfter, 'run_after') ?? new Date();
  const dryRun = input.dryRun === true;

  const post = await findPostById(client, {
    organizationId: input.organizationId,
    postId,
  });
  if (!post) {
    throw notFound('post_not_found', 'Post was not found', { post_id: postId });
  }

  if ([POST_STATUSES.PUBLISHED, POST_STATUSES.CANCELED].includes(post.status)) {
    throw conflict('post_not_publishable', `Post status ${post.status} cannot be published`, {
      post_id: postId,
      status: post.status,
    });
  }

  const existingTargets = await listPostTargets(client, {
    organizationId: input.organizationId,
    postId,
  });
  if (existingTargets.length === 0) {
    throw badRequest('post_has_no_targets', 'Post must have at least one target before publishing', {
      post_id: postId,
    });
  }

  await queuePostTargets(client, {
    organizationId: input.organizationId,
    postId,
  });

  const targetsAfterQueue = await listPostTargets(client, {
    organizationId: input.organizationId,
    postId,
  });
  const publishableTargets = targetsAfterQueue.filter((target) => [
    TARGET_STATUSES.QUEUED,
    TARGET_STATUSES.PUBLISHING,
    TARGET_STATUSES.PUBLISHED,
  ].includes(target.status));

  if (publishableTargets.length === 0) {
    throw conflict('post_has_no_publishable_targets', 'Post has no valid targets to publish', {
      post_id: postId,
      target_statuses: targetsAfterQueue.map((target) => ({
        id: target.id,
        status: target.status,
        validation_errors: target.validation_errors,
      })),
    });
  }

  const derivedStatus = derivePostStatusFromTargetStatuses(targetsAfterQueue);
  await updatePostStatus(client, {
    organizationId: input.organizationId,
    postId,
    status: derivedStatus === POST_STATUSES.PUBLISHED ? POST_STATUSES.PUBLISHED : POST_STATUSES.QUEUED,
  });

  const job = await insertPublishJob(client, {
    organizationId: input.organizationId,
    postId,
    requestedByUserId: input.actorUserId,
    idempotencyKey,
    runAfter,
    metadata: {
      request_id: input.requestId,
      dry_run: dryRun,
    },
  });

  await recordAuditEvent(client, {
    organizationId: input.organizationId,
    actorType: input.actorUserId ? 'user' : 'system',
    actorUserId: input.actorUserId,
    action: 'post.enqueue_publish',
    entityType: 'publish_job',
    entityId: job.id,
    requestId: input.requestId,
    metadata: {
      post_id: postId,
      dry_run: dryRun,
      idempotency_key: idempotencyKey,
    },
  });

  return {
    job,
    aggregate: await getPostAggregate(client, {
      organizationId: input.organizationId,
      postId,
    }),
  };
}

export async function getPublishJob(client, input) {
  const publishJobId = assertUuid(input.publishJobId, 'publish_job_id');
  const job = await findPublishJobById(client, {
    organizationId: input.organizationId,
    publishJobId,
  });

  if (!job) {
    throw notFound('publish_job_not_found', 'Publish job was not found', {
      publish_job_id: publishJobId,
    });
  }

  return {
    job,
    aggregate: await getPostAggregate(client, {
      organizationId: input.organizationId,
      postId: job.post_id,
    }),
  };
}

export async function deriveAndPersistPostStatus(client, input) {
  const targets = await listPostTargets(client, {
    organizationId: input.organizationId,
    postId: input.postId,
  });
  const status = derivePostStatusFromTargetStatuses(targets);

  await updatePostStatus(client, {
    organizationId: input.organizationId,
    postId: input.postId,
    status,
  });

  return status;
}

export async function markAttemptSucceeded(client, input) {
  await completePublishAttempt(client, {
    organizationId: input.organizationId,
    publishAttemptId: input.publishAttemptId,
    status: 'succeeded',
    retryable: false,
    platformResponse: input.platformResponse,
  });
}

export async function markAttemptFailed(client, input) {
  await completePublishAttempt(client, {
    organizationId: input.organizationId,
    publishAttemptId: input.publishAttemptId,
    status: 'failed',
    retryable: input.retryable,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    platformResponse: input.platformResponse,
  });
}
