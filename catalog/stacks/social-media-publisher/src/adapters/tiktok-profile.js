import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';

import axios from 'axios';

import { PlatformAdapterError } from './platform-errors.js';

const API_BASE_URL = process.env.TIKTOK_API_BASE_URL ?? 'https://open.tiktokapis.com';
const INBOX_VIDEO_INIT_URL = `${API_BASE_URL}/v2/post/publish/inbox/video/init/`;
const DIRECT_VIDEO_INIT_URL = `${API_BASE_URL}/v2/post/publish/video/init/`;
const CREATOR_INFO_URL = `${API_BASE_URL}/v2/post/publish/creator_info/query/`;
const STATUS_FETCH_URL = `${API_BASE_URL}/v2/post/publish/status/fetch/`;
const TOKEN_URL = `${API_BASE_URL}/v2/oauth/token/`;
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = Number(process.env.TIKTOK_UPLOAD_CHUNK_BYTES ?? 10 * 1024 * 1024);
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_FINAL_CHUNK_BYTES = 128 * 1024 * 1024;
const MAX_CHUNK_COUNT = 1000;
const MAX_TIKTOK_VIDEO_BYTES = Number(process.env.TIKTOK_MAX_UPLOAD_BYTES ?? 512 * 1024 * 1024);
const TIKTOK_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const TIKTOK_PRIVACY_LEVELS = new Set([
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
]);

function getSourcePath(item) {
  return item.source_path ?? item.file_path ?? item.path ?? null;
}

function getMimeType(item) {
  if (typeof item.mime_type === 'string' && item.mime_type.length > 0) {
    return item.mime_type.toLowerCase();
  }

  const sourcePath = getSourcePath(item);
  const extension = sourcePath ? extname(sourcePath).toLowerCase() : '';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.webm') return 'video/webm';
  return 'video/mp4';
}

function getVideoSize(item) {
  const sourcePath = getSourcePath(item);
  if (sourcePath) {
    return statSync(sourcePath).size;
  }

  return Number(item.bytes);
}

function assertHttpsUrl(value, label) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Fall through to stable adapter error.
  }

  throw new PlatformAdapterError(
    'media_url_not_https',
    `${label} must be a valid HTTPS URL`,
    { retryable: false },
  );
}

function splitMedia(media) {
  return {
    videos: media.filter((item) => item.media_kind === 'video'),
    unsupported: media.filter((item) => item.media_kind !== 'video'),
  };
}

function getTransferMode(video) {
  if (getSourcePath(video)) return 'FILE_UPLOAD';
  if (video.source_url) return 'PULL_FROM_URL';
  return null;
}

function validateVideoMedia(item, errors) {
  const mimeType = getMimeType(item);
  const transferMode = getTransferMode(item);

  if (!transferMode) {
    errors.push({
      code: 'missing_video_source',
      message: 'TikTok video media requires source_path for local upload or source_url for URL pull upload',
    });
  }

  if (item.source_url && !String(item.source_url).startsWith('https://')) {
    errors.push({ code: 'media_url_not_https', message: 'TikTok pull upload media must use HTTPS' });
  }

  if (!TIKTOK_VIDEO_MIME_TYPES.has(mimeType)) {
    errors.push({
      code: 'unsupported_video_mime_type',
      message: 'TikTok video uploads must be MP4, MOV, or WEBM',
    });
  }

  if (item.bytes && Number(item.bytes) > MAX_TIKTOK_VIDEO_BYTES) {
    errors.push({
      code: 'video_too_large',
      message: 'TikTok video media exceeds the configured upload size limit',
    });
  }
}

function validatePostInput(post, target, media) {
  const errors = [];
  const { videos, unsupported } = splitMedia(media);

  if (target.asset_type !== 'profile') {
    errors.push({ code: 'unsupported_asset_type', message: 'TikTok adapter supports profile assets only' });
  }

  if (videos.length !== 1) {
    errors.push({ code: 'one_video_required', message: 'TikTok inbox upload requires exactly one video media item' });
  } else {
    validateVideoMedia(videos[0], errors);
  }

  if (unsupported.length > 0) {
    errors.push({ code: 'unsupported_media_type', message: 'TikTok inbox upload supports video media only' });
  }

  const mode = videos[0] && getTransferMode(videos[0]) === 'PULL_FROM_URL'
    ? 'inbox_pull_from_url'
    : 'inbox_file_upload';

  return {
    ok: errors.length === 0,
    errors,
    mode,
  };
}

function validateDirectPostInput(post, target, media) {
  const validation = validatePostInput(post, target, media);
  const errors = [...validation.errors];
  const caption = String(post.body ?? '');
  const options = getDirectPostOptions(post);

  if (caption.length > 2200) {
    errors.push({ code: 'caption_too_long', message: 'TikTok Direct Post caption must be 2200 UTF-16 characters or fewer' });
  }

  if (options.privacyLevel && !TIKTOK_PRIVACY_LEVELS.has(options.privacyLevel)) {
    errors.push({ code: 'invalid_privacy_level', message: 'TikTok privacyLevel is not a recognized privacy level' });
  }

  return {
    ok: errors.length === 0,
    errors,
    mode: validation.mode.replace('inbox_', 'direct_'),
  };
}

function getDirectPostOptions(post, options = {}) {
  const metadata = post.metadata ?? {};
  const tiktok = metadata.tiktok ?? metadata.tiktok_options ?? {};
  return {
    privacyLevel: options.privacyLevel ?? options.privacy_level ?? tiktok.privacyLevel ?? tiktok.privacy_level,
    disableComment: options.disableComment ?? options.disable_comment ?? tiktok.disableComment ?? tiktok.disable_comment,
    disableDuet: options.disableDuet ?? options.disable_duet ?? tiktok.disableDuet ?? tiktok.disable_duet,
    disableStitch: options.disableStitch ?? options.disable_stitch ?? tiktok.disableStitch ?? tiktok.disable_stitch,
    videoCoverTimestampMs:
      options.videoCoverTimestampMs
      ?? options.video_cover_timestamp_ms
      ?? tiktok.videoCoverTimestampMs
      ?? tiktok.video_cover_timestamp_ms,
    brandContentToggle:
      options.brandContentToggle
      ?? options.brand_content_toggle
      ?? tiktok.brandContentToggle
      ?? tiktok.brand_content_toggle
      ?? false,
    brandOrganicToggle:
      options.brandOrganicToggle
      ?? options.brand_organic_toggle
      ?? tiktok.brandOrganicToggle
      ?? tiktok.brand_organic_toggle
      ?? false,
    isAigc: options.isAigc ?? options.is_aigc ?? tiktok.isAigc ?? tiktok.is_aigc,
  };
}

function parseCredential(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new PlatformAdapterError(
      'missing_tiktok_token',
      'TikTok user access token or refresh credential is required for inbox upload',
      { retryable: false },
    );
  }

  try {
    const parsed = JSON.parse(token);
    if (typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0) {
      return { accessToken: parsed.accessToken };
    }
    if (typeof parsed.access_token === 'string' && parsed.access_token.length > 0) {
      return { accessToken: parsed.access_token };
    }

    const refreshToken = parsed.refreshToken ?? parsed.refresh_token;
    const clientKey = parsed.clientKey ?? parsed.client_key;
    const clientSecret = parsed.clientSecret ?? parsed.client_secret;
    if (
      typeof refreshToken === 'string' && refreshToken.length > 0
      && typeof clientKey === 'string' && clientKey.length > 0
      && typeof clientSecret === 'string' && clientSecret.length > 0
    ) {
      return { refreshToken, clientKey, clientSecret };
    }
  } catch {
    // Raw access tokens are valid direct-tool credentials.
  }

  return { accessToken: token };
}

async function refreshAccessToken(credential) {
  const params = new URLSearchParams({
    client_key: credential.clientKey,
    client_secret: credential.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: credential.refreshToken,
  });
  const response = await axios.post(TOKEN_URL, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    timeout: 30_000,
  });

  if (response.data?.error) {
    throw new PlatformAdapterError(
      `tiktok_${response.data.error}`,
      response.data.error_description || 'TikTok token refresh failed',
      {
        retryable: isRetryableTikTokError(response.status, response.data.error),
        details: {
          status: response.status,
          code: response.data.error,
          log_id: response.data.log_id,
        },
      },
    );
  }

  if (!response.data?.access_token) {
    throw new PlatformAdapterError(
      'tiktok_access_token_missing',
      'TikTok token refresh response did not include an access token',
      { retryable: false },
    );
  }

  return response.data.access_token;
}

async function resolveAccessToken(token) {
  const credential = parseCredential(token);
  if (credential.accessToken) {
    return credential.accessToken;
  }

  return refreshAccessToken(credential);
}

function isRetryableTikTokError(status, code) {
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  return ['internal_error', 'rate_limit_exceeded'].includes(code);
}

function mapTikTokError(error, fallbackCode) {
  if (error instanceof PlatformAdapterError) {
    return error;
  }

  const status = error.response?.status;
  const body = error.response?.data;
  const tiktokError = body?.error;
  const code = tiktokError?.code;
  const message = tiktokError?.message || error.message || 'TikTok API request failed';

  return new PlatformAdapterError(code ? `tiktok_${code}` : fallbackCode, message, {
    retryable: isRetryableTikTokError(status, code),
    details: {
      status,
      code,
      log_id: tiktokError?.log_id ?? tiktokError?.logid,
    },
  });
}

function assertTikTokOk(response, fallbackCode) {
  const error = response.data?.error;
  if (error?.code && error.code !== 'ok') {
    throw new PlatformAdapterError(
      `tiktok_${error.code}`,
      error.message || 'TikTok API request failed',
      {
        retryable: isRetryableTikTokError(response.status, error.code),
        details: {
          status: response.status,
          code: error.code,
          log_id: error.log_id ?? error.logid,
        },
      },
    );
  }

  return response.data?.data ?? {};
}

function normalizeChunkSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_CHUNK_BYTES;
  }

  return Math.min(Math.max(parsed, MIN_CHUNK_BYTES), MAX_CHUNK_BYTES);
}

function buildChunkPlan(totalBytes, requestedChunkSize) {
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) {
    throw new PlatformAdapterError(
      'invalid_video_size',
      'TikTok video file must have a positive byte size',
      { retryable: false },
    );
  }

  if (totalBytes > MAX_TIKTOK_VIDEO_BYTES) {
    throw new PlatformAdapterError(
      'video_too_large',
      'TikTok video file exceeds the configured upload size limit',
      { retryable: false },
    );
  }

  if (totalBytes <= MAX_CHUNK_BYTES) {
    return {
      chunkSize: totalBytes,
      totalChunkCount: 1,
      chunks: [{ start: 0, end: totalBytes - 1, size: totalBytes }],
    };
  }

  const chunkSize = normalizeChunkSize(requestedChunkSize);
  const totalChunkCount = Math.floor(totalBytes / chunkSize);
  if (totalChunkCount < 1 || totalChunkCount > MAX_CHUNK_COUNT) {
    throw new PlatformAdapterError(
      'invalid_chunk_count',
      'TikTok upload chunk count must be between 1 and 1000',
      { retryable: false },
    );
  }

  const chunks = [];
  for (let index = 0; index < totalChunkCount; index += 1) {
    const start = index * chunkSize;
    const end = index === totalChunkCount - 1 ? totalBytes - 1 : start + chunkSize - 1;
    const size = end - start + 1;

    if (index < totalChunkCount - 1 && (size < MIN_CHUNK_BYTES || size > MAX_CHUNK_BYTES)) {
      throw new PlatformAdapterError(
        'invalid_chunk_size',
        'TikTok upload chunks must be at least 5MB and at most 64MB before the final chunk',
        { retryable: false },
      );
    }

    if (index === totalChunkCount - 1 && size > MAX_FINAL_CHUNK_BYTES) {
      throw new PlatformAdapterError(
        'invalid_final_chunk_size',
        'TikTok final upload chunk must be at most 128MB',
        { retryable: false },
      );
    }

    chunks.push({ start, end, size });
  }

  return { chunkSize, totalChunkCount, chunks };
}

async function initializeInboxUpload(accessToken, sourceInfo) {
  const response = await axios.post(INBOX_VIDEO_INIT_URL, { source_info: sourceInfo }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    maxBodyLength: 1024 * 1024,
    timeout: 30_000,
  });

  const data = assertTikTokOk(response, 'tiktok_upload_init_failed');
  if (!data.publish_id) {
    throw new PlatformAdapterError(
      'tiktok_publish_id_missing',
      'TikTok upload initialization response did not include a publish_id',
      { retryable: false },
    );
  }

  return data;
}

async function initializeDirectPost(accessToken, postInfo, sourceInfo) {
  const response = await axios.post(DIRECT_VIDEO_INIT_URL, {
    post_info: postInfo,
    source_info: sourceInfo,
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    maxBodyLength: 1024 * 1024,
    timeout: 30_000,
  });

  const data = assertTikTokOk(response, 'tiktok_direct_post_init_failed');
  if (!data.publish_id) {
    throw new PlatformAdapterError(
      'tiktok_publish_id_missing',
      'TikTok direct post initialization response did not include a publish_id',
      { retryable: false },
    );
  }

  return data;
}

async function uploadLocalVideoChunks(uploadUrl, videoPath, mimeType, totalBytes, chunks) {
  for (const chunk of chunks) {
    await axios.put(uploadUrl, createReadStream(videoPath, {
      start: chunk.start,
      end: chunk.end,
    }), {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(chunk.size),
        'Content-Range': `bytes ${chunk.start}-${chunk.end}/${totalBytes}`,
      },
      maxBodyLength: chunk.size + 1024 * 1024,
      timeout: 30 * 60_000,
    });
  }
}

async function publishLocalFileUpload(accessToken, video) {
  const videoPath = getSourcePath(video);
  const videoSize = getVideoSize(video);
  const mimeType = getMimeType(video);
  const plan = buildChunkPlan(videoSize, video.chunk_size);
  const initialized = await initializeInboxUpload(accessToken, {
    source: 'FILE_UPLOAD',
    video_size: videoSize,
    chunk_size: plan.chunkSize,
    total_chunk_count: plan.totalChunkCount,
  });

  if (!initialized.upload_url) {
    throw new PlatformAdapterError(
      'tiktok_upload_url_missing',
      'TikTok upload initialization response did not include an upload_url',
      { retryable: false },
    );
  }

  await uploadLocalVideoChunks(initialized.upload_url, videoPath, mimeType, videoSize, plan.chunks);

  return {
    publishId: initialized.publish_id,
    platformResponse: {
      publish_id: initialized.publish_id,
      transfer_method: 'FILE_UPLOAD',
      chunks_uploaded: plan.totalChunkCount,
      inbox_delivery_required: true,
    },
  };
}

async function publishPullFromUrl(accessToken, video) {
  const initialized = await initializeInboxUpload(accessToken, {
    source: 'PULL_FROM_URL',
    video_url: assertHttpsUrl(video.source_url, 'TikTok video URL'),
  });

  return {
    publishId: initialized.publish_id,
    platformResponse: {
      publish_id: initialized.publish_id,
      transfer_method: 'PULL_FROM_URL',
      inbox_delivery_required: true,
    },
  };
}

function choosePrivacyLevel(creatorInfo, requestedPrivacyLevel) {
  const options = Array.isArray(creatorInfo.privacy_level_options) ? creatorInfo.privacy_level_options : [];

  if (requestedPrivacyLevel) {
    if (!options.includes(requestedPrivacyLevel)) {
      throw new PlatformAdapterError(
        'privacy_level_option_mismatch',
        'TikTok privacyLevel must match one of the creator privacy_level_options',
        { retryable: false, details: { privacy_level_options: options } },
      );
    }

    return requestedPrivacyLevel;
  }

  return options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0];
}

function buildDirectPostInfo(post, creatorInfo, options = {}) {
  const directOptions = getDirectPostOptions(post, options);
  const privacyLevel = choosePrivacyLevel(creatorInfo, directOptions.privacyLevel);

  if (!privacyLevel) {
    throw new PlatformAdapterError(
      'privacy_level_option_mismatch',
      'TikTok creator info did not return a usable privacy level',
      { retryable: false, details: { privacy_level_options: creatorInfo.privacy_level_options } },
    );
  }

  const postInfo = {
    title: String(post.body ?? ''),
    privacy_level: privacyLevel,
    disable_duet: Boolean(directOptions.disableDuet || creatorInfo.duet_disabled),
    disable_comment: Boolean(directOptions.disableComment || creatorInfo.comment_disabled),
    disable_stitch: Boolean(directOptions.disableStitch || creatorInfo.stitch_disabled),
    brand_content_toggle: Boolean(directOptions.brandContentToggle),
    brand_organic_toggle: Boolean(directOptions.brandOrganicToggle),
  };

  if (directOptions.videoCoverTimestampMs !== undefined && directOptions.videoCoverTimestampMs !== null && directOptions.videoCoverTimestampMs !== '') {
    postInfo.video_cover_timestamp_ms = Number(directOptions.videoCoverTimestampMs);
  }

  if (directOptions.isAigc !== undefined && directOptions.isAigc !== null) {
    postInfo.is_aigc = Boolean(directOptions.isAigc);
  }

  return postInfo;
}

async function directPostLocalFile(accessToken, post, video, creatorInfo, options) {
  const postInfo = buildDirectPostInfo(post, creatorInfo, options);
  const videoPath = getSourcePath(video);
  const videoSize = getVideoSize(video);
  const mimeType = getMimeType(video);
  const plan = buildChunkPlan(videoSize, video.chunk_size);
  const initialized = await initializeDirectPost(accessToken, postInfo, {
    source: 'FILE_UPLOAD',
    video_size: videoSize,
    chunk_size: plan.chunkSize,
    total_chunk_count: plan.totalChunkCount,
  });

  if (!initialized.upload_url) {
    throw new PlatformAdapterError(
      'tiktok_upload_url_missing',
      'TikTok direct post initialization response did not include an upload_url',
      { retryable: false },
    );
  }

  await uploadLocalVideoChunks(initialized.upload_url, videoPath, mimeType, videoSize, plan.chunks);

  return {
    publishId: initialized.publish_id,
    platformResponse: {
      publish_id: initialized.publish_id,
      transfer_method: 'FILE_UPLOAD',
      chunks_uploaded: plan.totalChunkCount,
      direct_post: true,
      privacy_level: postInfo.privacy_level,
      creator_username: creatorInfo.creator_username,
    },
  };
}

async function directPostPullFromUrl(accessToken, post, video, creatorInfo, options) {
  const postInfo = buildDirectPostInfo(post, creatorInfo, options);
  const initialized = await initializeDirectPost(accessToken, postInfo, {
    source: 'PULL_FROM_URL',
    video_url: assertHttpsUrl(video.source_url, 'TikTok video URL'),
  });

  return {
    publishId: initialized.publish_id,
    platformResponse: {
      publish_id: initialized.publish_id,
      transfer_method: 'PULL_FROM_URL',
      direct_post: true,
      privacy_level: postInfo.privacy_level,
      creator_username: creatorInfo.creator_username,
    },
  };
}

export async function queryTikTokCreatorInfo(input) {
  const accessToken = await resolveAccessToken(input.accessToken);

  try {
    const response = await axios.post(CREATOR_INFO_URL, {}, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      timeout: 30_000,
    });

    return assertTikTokOk(response, 'tiktok_creator_info_failed');
  } catch (error) {
    throw mapTikTokError(error, 'tiktok_creator_info_failed');
  }
}

export async function fetchTikTokPublishStatus(input) {
  const accessToken = await resolveAccessToken(input.accessToken);
  if (typeof input.publishId !== 'string' || input.publishId.length === 0 || input.publishId.length > 64) {
    throw new PlatformAdapterError(
      'invalid_tiktok_publish_id',
      'TikTok publish_id must be a non-empty string up to 64 characters',
      { retryable: false },
    );
  }

  try {
    const response = await axios.post(STATUS_FETCH_URL, { publish_id: input.publishId }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      timeout: 30_000,
    });

    return assertTikTokOk(response, 'tiktok_status_fetch_failed');
  } catch (error) {
    throw mapTikTokError(error, 'tiktok_status_fetch_failed');
  }
}

export const tiktokProfileAdapter = Object.freeze({
  platform: 'tiktok',
  tokenType: 'user',

  validatePost({ post, target, media }) {
    return validatePostInput(post, target, media);
  },

  async checkAuth({ target, token }) {
    await resolveAccessToken(token);

    return {
      ok: true,
      provider_account_id: target.platform_asset_id,
      display_name: 'TikTok profile',
    };
  },

  async publish({ post, target, media, token }) {
    const validation = this.validatePost({ post, target, media });
    if (!validation.ok) {
      throw new PlatformAdapterError(
        validation.errors[0].code,
        validation.errors[0].message,
        { retryable: false, details: { validation_errors: validation.errors } },
      );
    }

    try {
      const { videos } = splitMedia(media);
      const accessToken = await resolveAccessToken(token);
      const result = getTransferMode(videos[0]) === 'PULL_FROM_URL'
        ? await publishPullFromUrl(accessToken, videos[0])
        : await publishLocalFileUpload(accessToken, videos[0]);

      return {
        platformPostId: result.publishId,
        permalinkUrl: null,
        platformResponse: {
          ...result.platformResponse,
          caption_note: post.body ? 'TikTok video.upload sends media to inbox; caption is completed in TikTok.' : undefined,
        },
      };
    } catch (error) {
      throw mapTikTokError(error, 'tiktok_publish_failed');
    }
  },

  validateDirectPost({ post, target, media }) {
    return validateDirectPostInput(post, target, media);
  },

  async directPost({ post, target, media, token, options = {} }) {
    const validation = this.validateDirectPost({ post, target, media });
    if (!validation.ok) {
      throw new PlatformAdapterError(
        validation.errors[0].code,
        validation.errors[0].message,
        { retryable: false, details: { validation_errors: validation.errors } },
      );
    }

    try {
      const { videos } = splitMedia(media);
      const accessToken = await resolveAccessToken(token);
      const creatorInfo = await queryTikTokCreatorInfo({ accessToken });
      const result = getTransferMode(videos[0]) === 'PULL_FROM_URL'
        ? await directPostPullFromUrl(accessToken, post, videos[0], creatorInfo, options)
        : await directPostLocalFile(accessToken, post, videos[0], creatorInfo, options);

      return {
        platformPostId: result.publishId,
        permalinkUrl: null,
        platformResponse: result.platformResponse,
      };
    } catch (error) {
      throw mapTikTokError(error, 'tiktok_direct_post_failed');
    }
  },
});
