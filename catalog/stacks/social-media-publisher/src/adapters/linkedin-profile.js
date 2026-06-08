import axios from 'axios';

import { PlatformAdapterError } from './platform-errors.js';

const API_BASE_URL = 'https://api.linkedin.com/v2';
const REST_API_BASE_URL = 'https://api.linkedin.com/rest';
const USERINFO_URL = `${API_BASE_URL}/userinfo`;
const UGC_POSTS_URL = `${API_BASE_URL}/ugcPosts`;
const REST_POSTS_URL = `${REST_API_BASE_URL}/posts`;
const VIDEOS_URL = `${REST_API_BASE_URL}/videos`;
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION ?? '202604';
const MAX_LINKEDIN_TEXT_LENGTH = 3_000;
const MAX_LINKEDIN_IMAGES = 9;
const MAX_LINKEDIN_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_LINKEDIN_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
const LINKEDIN_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const LINKEDIN_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);

function getLinkedInOptions(post) {
  const metadata = post.metadata ?? {};
  return metadata.linkedin ?? metadata.linkedin_options ?? {};
}

function getRequestedMode(post, media) {
  const requested = getLinkedInOptions(post).media_type;

  if (requested) {
    const normalized = String(requested).toLowerCase();
    if (['photo', 'photos', 'multi_image', 'multi-photo', 'multi_photo'].includes(normalized)) {
      return 'image';
    }

    return normalized;
  }

  if (media.length === 0) {
    return 'text';
  }

  if (media.every((item) => item.media_kind === 'image')) {
    return 'image';
  }

  if (media.length === 1 && media[0].media_kind === 'video') {
    return 'video';
  }

  return 'unsupported';
}

function mapLinkedInError(error, fallbackCode) {
  if (error instanceof PlatformAdapterError) {
    return error;
  }

  const status = error.response?.status;
  const body = error.response?.data;
  const message = body?.message || body?.error_description || error.message || 'LinkedIn API request failed';
  const retryableStatuses = new Set([409, 429, 500, 502, 503, 504]);

  return new PlatformAdapterError(body?.serviceErrorCode ? `linkedin_${body.serviceErrorCode}` : fallbackCode, message, {
    retryable: retryableStatuses.has(status),
    details: {
      status,
      code: body?.code,
      service_error_code: body?.serviceErrorCode,
    },
  });
}

function assertHttpsUrl(value, label) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Fall through to the stable adapter error.
  }

  throw new PlatformAdapterError(
    'media_url_not_https',
    `${label} must be a valid HTTPS URL`,
    { retryable: false },
  );
}

function getAuthorUrn(target) {
  if (target.asset_type === 'profile') {
    return `urn:li:person:${target.platform_asset_id}`;
  }

  if (target.asset_type === 'organization') {
    return `urn:li:organization:${target.platform_asset_id}`;
  }

  throw new PlatformAdapterError(
    'unsupported_asset_type',
    'LinkedIn adapter supports profile and organization assets only',
    { retryable: false },
  );
}

function validateText(post, errors) {
  const body = post.body ?? '';

  if (body.trim().length === 0) {
    errors.push({ code: 'empty_body', message: 'LinkedIn posts require body text' });
  }

  if (body.length > MAX_LINKEDIN_TEXT_LENGTH) {
    errors.push({
      code: 'body_too_long',
      message: `LinkedIn post text must be ${MAX_LINKEDIN_TEXT_LENGTH} characters or fewer`,
    });
  }
}

function validateImageMedia(item, errors, index) {
  if (item.media_kind !== 'image') {
    errors.push({ code: 'image_required', message: `Media item ${index + 1} must be an image` });
  }

  if (!item.source_url) {
    errors.push({ code: 'missing_media_url', message: `Media item ${index + 1} is missing source_url` });
  } else if (!String(item.source_url).startsWith('https://')) {
    errors.push({ code: 'media_url_not_https', message: `Media item ${index + 1} must use HTTPS` });
  }

  if (item.mime_type && !LINKEDIN_IMAGE_MIME_TYPES.has(String(item.mime_type).toLowerCase())) {
    errors.push({ code: 'unsupported_image_mime_type', message: `Media item ${index + 1} must be JPEG or PNG` });
  }

  if (item.bytes && Number(item.bytes) > MAX_LINKEDIN_IMAGE_BYTES) {
    errors.push({ code: 'image_too_large', message: `Media item ${index + 1} exceeds LinkedIn image size limits` });
  }
}

function validateVideoMedia(item, errors) {
  if (item.media_kind !== 'video') {
    errors.push({ code: 'video_required', message: 'LinkedIn video posts require video media' });
  }

  if (!item.source_url) {
    errors.push({ code: 'missing_media_url', message: 'LinkedIn video media is missing source_url' });
  } else if (!String(item.source_url).startsWith('https://')) {
    errors.push({ code: 'media_url_not_https', message: 'LinkedIn video media must use HTTPS' });
  }

  if (item.mime_type && !LINKEDIN_VIDEO_MIME_TYPES.has(String(item.mime_type).toLowerCase())) {
    errors.push({ code: 'unsupported_video_mime_type', message: 'LinkedIn video media must be MP4 or MOV' });
  }

  if (item.bytes && Number(item.bytes) > MAX_LINKEDIN_VIDEO_BYTES) {
    errors.push({ code: 'video_too_large', message: 'LinkedIn video media exceeds size limits' });
  }
}

function validatePostByMode(post, media, mode) {
  const errors = [];
  validateText(post, errors);

  if (mode === 'text') {
    if (media.length > 0) {
      errors.push({ code: 'text_post_cannot_have_media', message: 'LinkedIn text posts cannot include media' });
    }
  } else if (mode === 'image') {
    if (media.length < 1 || media.length > MAX_LINKEDIN_IMAGES) {
      errors.push({ code: 'invalid_image_count', message: `LinkedIn image posts require 1-${MAX_LINKEDIN_IMAGES} images` });
    }

    for (const [index, item] of media.entries()) {
      validateImageMedia(item, errors, index);
    }
  } else if (mode === 'video') {
    if (media.length !== 1) {
      errors.push({ code: 'one_video_required', message: 'LinkedIn video posts require exactly one video' });
    } else {
      validateVideoMedia(media[0], errors);
    }
  } else {
    errors.push({ code: 'unsupported_linkedin_media_type', message: 'LinkedIn post must be text, image, or video' });
  }

  return {
    ok: errors.length === 0,
    errors,
    mode,
  };
}

function getLinkedInHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

function getLinkedInRestHeaders(token) {
  return {
    ...getLinkedInHeaders(token),
    'Linkedin-Version': LINKEDIN_API_VERSION,
  };
}

async function downloadMedia(item, maxBytes) {
  const response = await axios.get(assertHttpsUrl(item.source_url, 'LinkedIn media URL'), {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: maxBytes,
  });
  const buffer = Buffer.from(response.data);

  if (buffer.length > maxBytes) {
    throw new PlatformAdapterError(
      item.media_kind === 'video' ? 'video_too_large' : 'image_too_large',
      `LinkedIn ${item.media_kind} media exceeds size limits`,
      { retryable: false },
    );
  }

  return buffer;
}

async function getUserInfo(token) {
  const response = await axios.get(USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 30_000,
  });

  if (!response.data?.sub) {
    throw new PlatformAdapterError(
      'linkedin_userinfo_missing_subject',
      'LinkedIn userinfo response did not include a subject identifier',
      { retryable: false },
    );
  }

  return response.data;
}

async function registerImageUpload(authorUrn, token) {
  const response = await axios.post(`${API_BASE_URL}/assets?action=registerUpload`, {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner: authorUrn,
      serviceRelationships: [{
        relationshipType: 'OWNER',
        identifier: 'urn:li:userGeneratedContent',
      }],
    },
  }, {
    headers: getLinkedInHeaders(token),
    timeout: 30_000,
  });

  const uploadUrl = response.data?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = response.data?.value?.asset;
  if (!uploadUrl || !asset) {
    throw new PlatformAdapterError(
      'linkedin_image_upload_registration_failed',
      'LinkedIn image upload registration response was missing upload data',
      { retryable: false },
    );
  }

  return { uploadUrl, asset };
}

async function uploadImage(authorUrn, token, item) {
  const { uploadUrl, asset } = await registerImageUpload(authorUrn, token);
  const imageBuffer = await downloadMedia(item, MAX_LINKEDIN_IMAGE_BYTES);

  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    maxBodyLength: MAX_LINKEDIN_IMAGE_BYTES + 1024 * 1024,
    timeout: 60_000,
  });

  return asset;
}

async function initializeVideoUpload(authorUrn, token, fileSizeBytes) {
  const response = await axios.post(`${VIDEOS_URL}?action=initializeUpload`, {
    initializeUploadRequest: {
      owner: authorUrn,
      fileSizeBytes,
      uploadCaptions: false,
      uploadThumbnail: false,
    },
  }, {
    headers: getLinkedInRestHeaders(token),
    timeout: 30_000,
  });

  const uploadInstructions = response.data?.value?.uploadInstructions;
  const video = response.data?.value?.video;
  const uploadToken = response.data?.value?.uploadToken ?? '';
  if (!Array.isArray(uploadInstructions) || uploadInstructions.length === 0 || !video) {
    throw new PlatformAdapterError(
      'linkedin_video_upload_initialization_failed',
      'LinkedIn video upload initialization response was missing upload data',
      { retryable: false },
    );
  }

  return { uploadInstructions, uploadToken, video };
}

async function uploadVideoChunks(uploadInstructions, videoBuffer, token) {
  const uploadedPartIds = [];

  for (const instruction of uploadInstructions) {
    const firstByte = Number(instruction.firstByte);
    const lastByte = Number(instruction.lastByte);

    if (!instruction.uploadUrl || !Number.isInteger(firstByte) || !Number.isInteger(lastByte)) {
      throw new PlatformAdapterError(
        'linkedin_video_upload_instruction_invalid',
        'LinkedIn video upload instruction was invalid',
        { retryable: false },
      );
    }

    const chunk = videoBuffer.slice(firstByte, lastByte + 1);
    const response = await axios.put(instruction.uploadUrl, chunk, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: chunk.length + 1024 * 1024,
      timeout: 120_000,
    });

    const etag = response.headers?.etag;
    if (!etag) {
      throw new PlatformAdapterError(
        'linkedin_video_upload_missing_etag',
        'LinkedIn video upload response did not include an ETag part id',
        { retryable: false },
      );
    }

    uploadedPartIds.push(String(etag).replace(/^"|"$/g, ''));
  }

  return uploadedPartIds;
}

async function finalizeVideoUpload(videoUrn, token, uploadToken, uploadedPartIds) {
  await axios.post(`${VIDEOS_URL}?action=finalizeUpload`, {
    finalizeUploadRequest: {
      video: videoUrn,
      uploadToken: uploadToken ?? '',
      uploadedPartIds,
    },
  }, {
    headers: getLinkedInRestHeaders(token),
    timeout: 30_000,
  });
}

async function uploadVideo(authorUrn, token, item) {
  const videoBuffer = await downloadMedia(item, MAX_LINKEDIN_VIDEO_BYTES);
  const { uploadInstructions, uploadToken, video } = await initializeVideoUpload(authorUrn, token, videoBuffer.length);
  const uploadedPartIds = await uploadVideoChunks(uploadInstructions, videoBuffer, token);
  await finalizeVideoUpload(video, token, uploadToken, uploadedPartIds);
  return video;
}

function getPostId(response) {
  return response.data?.id ?? response.headers?.['x-restli-id'] ?? null;
}

function getPermalink(platformPostId) {
  return platformPostId ? `https://www.linkedin.com/feed/update/${platformPostId}` : null;
}

async function createPost(token, input) {
  const response = await axios.post(UGC_POSTS_URL, input, {
    headers: getLinkedInHeaders(token),
    timeout: 30_000,
  });
  const postId = getPostId(response);

  if (!postId) {
    throw new PlatformAdapterError(
      'linkedin_post_missing_id',
      'LinkedIn post response did not include a post id',
      { retryable: false },
    );
  }

  return {
    platformPostId: postId,
    permalinkUrl: getPermalink(postId),
    platformResponse: {
      id: postId,
    },
  };
}

async function createRestPost(token, input) {
  const response = await axios.post(REST_POSTS_URL, input, {
    headers: getLinkedInRestHeaders(token),
    timeout: 30_000,
  });
  const postId = getPostId(response);

  if (!postId) {
    throw new PlatformAdapterError(
      'linkedin_post_missing_id',
      'LinkedIn post response did not include a post id',
      { retryable: false },
    );
  }

  return {
    platformPostId: postId,
    permalinkUrl: getPermalink(postId),
    platformResponse: {
      id: postId,
    },
  };
}

function buildBasePost(authorUrn, post, shareMediaCategory, media = undefined) {
  const shareContent = {
    shareCommentary: {
      text: post.body,
    },
    shareMediaCategory,
  };

  if (media) {
    shareContent.media = media;
  }

  return {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };
}

function buildRestMediaPost(authorUrn, post, media) {
  return {
    author: authorUrn,
    commentary: post.body,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      media,
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
}

export const linkedinProfileAdapter = Object.freeze({
  platform: 'linkedin',
  tokenType: 'user',

  validatePost({ post, target, media }) {
    try {
      getAuthorUrn(target);
    } catch (error) {
      return {
        ok: false,
        errors: [{ code: error.code, message: error.message }],
      };
    }

    return validatePostByMode(post, media, getRequestedMode(post, media));
  },

  async checkAuth({ target, token }) {
    try {
      const userInfo = await getUserInfo(token);

      if (target.asset_type === 'profile' && userInfo.sub !== target.platform_asset_id) {
        throw new PlatformAdapterError(
          'token_asset_mismatch',
          'LinkedIn token returned a different profile than the target asset',
          { retryable: false },
        );
      }

      return {
        ok: true,
        provider_account_id: userInfo.sub,
        display_name: userInfo.name,
      };
    } catch (error) {
      throw mapLinkedInError(error, 'linkedin_auth_check_failed');
    }
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

    const authorUrn = getAuthorUrn(target);

    try {
      if (validation.mode === 'image') {
        const assets = [];
        for (const item of media) {
          assets.push(await uploadImage(authorUrn, token, item));
        }

        return await createPost(token, buildBasePost(authorUrn, post, 'IMAGE', assets.map((asset) => ({
          status: 'READY',
          description: { text: '' },
          media: asset,
          title: { text: '' },
        }))));
      }

      if (validation.mode === 'video') {
        const video = await uploadVideo(authorUrn, token, media[0]);
        return await createRestPost(token, buildRestMediaPost(authorUrn, post, {
          title: post.title ?? '',
          id: video,
        }));
      }

      return await createPost(token, buildBasePost(authorUrn, post, 'NONE'));
    } catch (error) {
      throw mapLinkedInError(error, 'linkedin_publish_failed');
    }
  },
});
