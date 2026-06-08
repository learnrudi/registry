import { recordAuditEvent } from '../db/repositories/audit-events.js';
import { findMediaAssetById, insertMediaAsset } from '../db/repositories/media.js';
import { badRequest, notFound } from './errors.js';
import { assertUuid } from './posts.js';

const ALLOWED_SOURCE_TYPES = new Set(['cloudinary', 'external_url', 'r2', 's3']);
const ALLOWED_MEDIA_KINDS = new Set(['image', 'video', 'other']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const MAX_METADATA_KEYS = 50;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertHttpsUrl(value) {
  if (typeof value !== 'string') {
    throw badRequest('invalid_url', 'source_url must be a string', { field: 'source_url' });
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw badRequest('invalid_url', 'source_url must be a valid URL', { field: 'source_url' });
  }

  if (parsed.protocol !== 'https:') {
    throw badRequest('url_must_be_https', 'source_url must use HTTPS', { field: 'source_url' });
  }

  return parsed.toString();
}

function normalizeSourceType(value) {
  const sourceType = value ? String(value).toLowerCase() : 'external_url';

  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    throw badRequest('invalid_source_type', 'source_type is not supported', {
      field: 'source_type',
      allowed: [...ALLOWED_SOURCE_TYPES],
    });
  }

  return sourceType;
}

function normalizeMediaKind(value) {
  const mediaKind = value ? String(value).toLowerCase() : null;

  if (!ALLOWED_MEDIA_KINDS.has(mediaKind)) {
    throw badRequest('invalid_media_kind', 'media_kind is required and must be image, video, or other', {
      field: 'media_kind',
      allowed: [...ALLOWED_MEDIA_KINDS],
    });
  }

  return mediaKind;
}

function normalizeMimeType(value, mediaKind) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest('invalid_mime_type', 'mime_type is required', { field: 'mime_type' });
  }

  const mimeType = value.trim().toLowerCase();

  if (mediaKind === 'image' && !IMAGE_MIME_TYPES.has(mimeType)) {
    throw badRequest('unsupported_image_mime_type', 'Unsupported image MIME type', {
      field: 'mime_type',
      allowed: [...IMAGE_MIME_TYPES],
    });
  }

  if (mediaKind === 'video' && !VIDEO_MIME_TYPES.has(mimeType)) {
    throw badRequest('unsupported_video_mime_type', 'Unsupported video MIME type', {
      field: 'mime_type',
      allowed: [...VIDEO_MIME_TYPES],
    });
  }

  return mimeType;
}

function normalizePositiveInteger(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest('invalid_positive_integer', `${fieldName} must be a positive integer`, {
      field: fieldName,
    });
  }

  return parsed;
}

function normalizeNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw badRequest('invalid_non_negative_number', `${fieldName} must be a non-negative number`, {
      field: fieldName,
    });
  }

  return parsed;
}

function normalizeOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw badRequest('invalid_string', `${fieldName} must be a string`, { field: fieldName });
  }

  if (value.length > maxLength) {
    throw badRequest('string_too_long', `${fieldName} is too long`, {
      field: fieldName,
      max_length: maxLength,
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

  if (Object.keys(value).length > MAX_METADATA_KEYS) {
    throw badRequest('metadata_too_large', 'metadata has too many keys', {
      field: 'metadata',
      max_keys: MAX_METADATA_KEYS,
    });
  }

  return value;
}

export async function registerExternalMedia(client, input) {
  const sourceUrl = assertHttpsUrl(input.sourceUrl);
  const sourceType = normalizeSourceType(input.sourceType);
  const mediaKind = normalizeMediaKind(input.mediaKind);
  const mimeType = normalizeMimeType(input.mimeType, mediaKind);

  const media = await insertMediaAsset(client, {
    organizationId: input.organizationId,
    sourceType,
    sourceUrl,
    cloudinaryPublicId: normalizeOptionalString(input.cloudinaryPublicId, 'cloudinary_public_id', 500),
    storageKey: normalizeOptionalString(input.storageKey, 'storage_key', 500),
    mediaKind,
    mimeType,
    bytes: normalizePositiveInteger(input.bytes, 'bytes'),
    width: normalizePositiveInteger(input.width, 'width'),
    height: normalizePositiveInteger(input.height, 'height'),
    durationSeconds: normalizeNonNegativeNumber(input.durationSeconds, 'duration_seconds'),
    sha256: normalizeOptionalString(input.sha256, 'sha256', 128),
    metadata: normalizeMetadata(input.metadata),
    createdByUserId: input.actorUserId,
  });

  await recordAuditEvent(client, {
    organizationId: input.organizationId,
    actorType: input.actorUserId ? 'user' : 'system',
    actorUserId: input.actorUserId,
    action: 'media.register_external',
    entityType: 'media_asset',
    entityId: media.id,
    requestId: input.requestId,
    metadata: {
      source_type: sourceType,
      media_kind: mediaKind,
    },
  });

  return media;
}

export async function getMediaAsset(client, input) {
  const mediaAssetId = assertUuid(input.mediaAssetId, 'media_asset_id');
  const media = await findMediaAssetById(client, {
    organizationId: input.organizationId,
    mediaAssetId,
  });

  if (!media) {
    throw notFound('media_not_found', 'Media asset was not found', {
      media_asset_id: mediaAssetId,
    });
  }

  return media;
}
