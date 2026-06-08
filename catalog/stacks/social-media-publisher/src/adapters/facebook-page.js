import axios from 'axios';
import FormData from 'form-data';

import { PlatformAdapterError } from './platform-errors.js';

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_VIDEO_BASE_URL = `https://graph-video.facebook.com/${GRAPH_API_VERSION}`;
const MAX_FACEBOOK_TEXT_LENGTH = 63_206;
const MAX_FACEBOOK_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_FACEBOOK_VIDEO_BYTES = 1024 * 1024 * 1024;
const MIN_FACEBOOK_CAROUSEL_ITEMS = 2;
const MAX_FACEBOOK_CAROUSEL_ITEMS = 10;
const PHOTO_RECONCILIATION_WINDOW_MS = 5 * 60 * 1000;

function sanitizeGraphResponse(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  return {
    id: data.id,
    post_id: data.post_id,
  };
}

function mapGraphError(error, fallbackCode) {
  if (error instanceof PlatformAdapterError) {
    return error;
  }

  const graphError = error.response?.data?.error;
  if (!graphError) {
    return new PlatformAdapterError(fallbackCode, error.message, { retryable: true });
  }

  const graphCode = graphError.code ? `facebook_${graphError.code}` : fallbackCode;
  const retryableCodes = new Set([1, 2, 4, 17, 32, 341, 613]);

  return new PlatformAdapterError(graphCode, graphError.message || 'Facebook API request failed', {
    retryable: retryableCodes.has(Number(graphError.code)),
    details: {
      type: graphError.type,
      subcode: graphError.error_subcode,
      fbtrace_id: graphError.fbtrace_id,
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

function getFacebookOptions(post) {
  const metadata = post.metadata ?? {};
  return metadata.facebook ?? metadata.facebook_options ?? {};
}

function getRequestedMode(post, media) {
  const requested = getFacebookOptions(post).media_type;

  if (requested) {
    const normalized = String(requested).toLowerCase();
    if (normalized === 'photo') {
      return 'image';
    }

    if (['photos', 'multi_image', 'multi-image', 'multi_photo', 'multi-photo'].includes(normalized)) {
      return 'carousel';
    }

    return normalized;
  }

  if (media.length === 0) {
    return 'text';
  }

  if (media.length === 1 && media[0].media_kind === 'image') {
    return 'image';
  }

  if (media.length === 1 && media[0].media_kind === 'video') {
    return 'video';
  }

  if (media.length >= MIN_FACEBOOK_CAROUSEL_ITEMS && media.every((item) => item.media_kind === 'image')) {
    return 'carousel';
  }

  return 'unsupported';
}

function validateBodyLength(post, errors) {
  if ((post.body ?? '').length > MAX_FACEBOOK_TEXT_LENGTH) {
    errors.push({
      code: 'body_too_long',
      message: `Facebook post text must be ${MAX_FACEBOOK_TEXT_LENGTH} characters or fewer`,
    });
  }
}

function validateTextPost(post, media, errors) {
  const body = post.body?.trim() ?? '';

  if (body.length === 0) {
    errors.push({ code: 'empty_body', message: 'Facebook text posts require body text' });
  }

  if (media.length > 0) {
    errors.push({
      code: 'text_post_cannot_have_media',
      message: 'Facebook text posts cannot include media attachments',
    });
  }
}

function validateImageMedia(image, errors, index = 0) {
  if (image.media_kind !== 'image') {
    errors.push({ code: 'image_required', message: `Media item ${index + 1} must be an image` });
  }

  if (!image.source_url) {
    errors.push({ code: 'missing_media_url', message: `Media item ${index + 1} is missing source_url` });
  } else if (!String(image.source_url).startsWith('https://')) {
    errors.push({ code: 'media_url_not_https', message: `Media item ${index + 1} must use HTTPS` });
  }

  if (image.bytes && Number(image.bytes) > MAX_FACEBOOK_IMAGE_BYTES) {
    errors.push({ code: 'image_too_large', message: `Media item ${index + 1} exceeds Facebook image size limits` });
  }
}

function validateImagePost(media, errors) {
  if (media.length !== 1) {
    errors.push({ code: 'one_image_required', message: 'Facebook image posts require exactly one image' });
    return;
  }

  validateImageMedia(media[0], errors);
}

function validateCarouselPost(media, errors) {
  if (media.length < MIN_FACEBOOK_CAROUSEL_ITEMS || media.length > MAX_FACEBOOK_CAROUSEL_ITEMS) {
    errors.push({
      code: 'invalid_carousel_count',
      message: `Facebook multi-image posts require ${MIN_FACEBOOK_CAROUSEL_ITEMS}-${MAX_FACEBOOK_CAROUSEL_ITEMS} images`,
    });
  }

  for (const [index, item] of media.entries()) {
    validateImageMedia(item, errors, index);
  }
}

function validateVideoPost(media, errors) {
  if (media.length !== 1) {
    errors.push({ code: 'one_video_required', message: 'Facebook video posts require exactly one video' });
    return;
  }

  const video = media[0];
  if (video.media_kind !== 'video') {
    errors.push({ code: 'video_required', message: 'Facebook video posts require video media' });
  }

  if (!video.source_url) {
    errors.push({ code: 'missing_media_url', message: 'Facebook video media is missing source_url' });
  } else if (!String(video.source_url).startsWith('https://')) {
    errors.push({ code: 'media_url_not_https', message: 'Facebook video media must use HTTPS' });
  }

  if (video.bytes && Number(video.bytes) > MAX_FACEBOOK_VIDEO_BYTES) {
    errors.push({ code: 'video_too_large', message: 'Facebook video media exceeds size limits' });
  }
}

function validatePostByMode(post, media, mode) {
  const errors = [];
  validateBodyLength(post, errors);

  if (mode === 'text') {
    validateTextPost(post, media, errors);
  } else if (mode === 'image') {
    validateImagePost(media, errors);
  } else if (mode === 'video') {
    validateVideoPost(media, errors);
  } else if (mode === 'carousel') {
    validateCarouselPost(media, errors);
  } else {
    errors.push({
      code: 'unsupported_facebook_media_type',
      message: 'Facebook post must be text, image, video, or multi-image',
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    mode,
  };
}

function getMediaUrl(media) {
  return assertHttpsUrl(media.source_url, 'Facebook media URL');
}

function getPhotoPermalink(photoId) {
  return `https://www.facebook.com/photo.php?fbid=${photoId}`;
}

async function downloadImage(media) {
  const response = await axios.get(getMediaUrl(media), {
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: MAX_FACEBOOK_IMAGE_BYTES,
  });
  const buffer = Buffer.from(response.data);

  if (buffer.length > MAX_FACEBOOK_IMAGE_BYTES) {
    throw new PlatformAdapterError(
      'image_too_large',
      'Facebook image media exceeds size limits',
      { retryable: false },
    );
  }

  return buffer;
}

function getCreatedAtMs(createdTime) {
  const parsed = Date.parse(createdTime);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findRecentPhotoByCaption(target, token, caption, startedAt) {
  try {
    const response = await axios.get(`${GRAPH_BASE_URL}/${target.platform_asset_id}/photos`, {
      params: {
        type: 'uploaded',
        fields: 'id,name,created_time,link,post_id',
        limit: 10,
        access_token: token,
      },
      timeout: 30_000,
    });

    const startedAtMs = startedAt.getTime();
    return (response.data?.data ?? []).find((photo) => {
      const createdAtMs = getCreatedAtMs(photo.created_time);
      return photo.name === caption
        && createdAtMs >= startedAtMs - 30_000
        && createdAtMs <= startedAtMs + PHOTO_RECONCILIATION_WINDOW_MS;
    }) ?? null;
  } catch {
    return null;
  }
}

async function findRecentFeedPostByMessage(target, token, message, startedAt) {
  try {
    const response = await axios.get(`${GRAPH_BASE_URL}/${target.platform_asset_id}/feed`, {
      params: {
        fields: 'id,message,created_time,permalink_url',
        limit: 10,
        access_token: token,
      },
      timeout: 30_000,
    });

    const startedAtMs = startedAt.getTime();
    return (response.data?.data ?? []).find((feedPost) => {
      const createdAtMs = getCreatedAtMs(feedPost.created_time);
      return feedPost.message === message
        && createdAtMs >= startedAtMs - 30_000
        && createdAtMs <= startedAtMs + PHOTO_RECONCILIATION_WINDOW_MS;
    }) ?? null;
  } catch {
    return null;
  }
}

async function publishText(target, token, post) {
  const response = await axios.post(`${GRAPH_BASE_URL}/${target.platform_asset_id}/feed`, {
    message: post.body,
    access_token: token,
  }, {
    timeout: 30_000,
  });

  return {
    platformPostId: response.data.id,
    permalinkUrl: `https://www.facebook.com/${response.data.id}`,
    platformResponse: sanitizeGraphResponse(response.data),
  };
}

async function uploadPhoto(target, token, image, input = {}) {
  const imageBuffer = await downloadImage(image);
  const form = new FormData();

  form.append('source', imageBuffer, {
    filename: input.filename ?? 'facebook-image.jpg',
    contentType: image.mime_type || 'image/jpeg',
  });

  for (const [key, value] of Object.entries(input.fields ?? {})) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }

  form.append('access_token', token);

  const maxBodyLength = Math.min(
    MAX_FACEBOOK_IMAGE_BYTES + 1024 * 1024,
    imageBuffer.length + 1024 * 1024,
  );
  const response = await axios.post(`${GRAPH_BASE_URL}/${target.platform_asset_id}/photos`, form, {
    headers: form.getHeaders(),
    maxBodyLength,
    timeout: 30_000,
  });

  if (!response.data?.id) {
    throw new PlatformAdapterError(
      'facebook_photo_missing_id',
      'Facebook photo upload response did not include an id',
      { retryable: false },
    );
  }

  return response.data;
}

async function publishImage(target, token, post, media) {
  const image = media[0];
  const caption = post.body ?? '';
  const startedAt = new Date();
  let response;

  try {
    response = await uploadPhoto(target, token, image, {
      fields: {
        message: caption,
        published: 'true',
      },
    });
  } catch (error) {
    const reconciledPhoto = await findRecentPhotoByCaption(target, token, caption, startedAt);
    if (!reconciledPhoto) {
      throw error;
    }

    return {
      platformPostId: reconciledPhoto.post_id ?? reconciledPhoto.id,
      permalinkUrl: reconciledPhoto.link ?? getPhotoPermalink(reconciledPhoto.id),
      platformResponse: {
        id: reconciledPhoto.id,
        post_id: reconciledPhoto.post_id,
        reconciled_after_error: true,
      },
    };
  }

  const platformPostId = response.post_id ?? response.id;

  return {
    platformPostId,
    permalinkUrl: response.post_id
      ? `https://www.facebook.com/${response.post_id}`
      : getPhotoPermalink(response.id),
    platformResponse: sanitizeGraphResponse(response),
  };
}

async function createMultiPhotoFeedPost(target, token, post, photos) {
  const params = new URLSearchParams();
  const message = post.body ?? '';
  const startedAt = new Date();
  params.set('message', message);
  params.set('access_token', token);

  photos.forEach((photo, index) => {
    params.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: photo.id }));
  });

  let response;

  try {
    response = await axios.post(`${GRAPH_BASE_URL}/${target.platform_asset_id}/feed`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30_000,
    });
  } catch (error) {
    const reconciledPost = await findRecentFeedPostByMessage(target, token, message, startedAt);
    if (!reconciledPost) {
      throw error;
    }

    return {
      id: reconciledPost.id,
      permalink_url: reconciledPost.permalink_url,
      reconciled_after_error: true,
    };
  }

  if (!response.data?.id) {
    throw new PlatformAdapterError(
      'facebook_post_missing_id',
      'Facebook multi-image post response did not include an id',
      { retryable: false },
    );
  }

  return response.data;
}

async function publishCarousel(target, token, post, media) {
  const photos = [];

  for (const [index, image] of media.entries()) {
    photos.push(await uploadPhoto(target, token, image, {
      filename: `facebook-carousel-${index + 1}.jpg`,
      fields: {
        published: 'false',
      },
    }));
  }

  const response = await createMultiPhotoFeedPost(target, token, post, photos);

  return {
    platformPostId: response.id,
    permalinkUrl: response.permalink_url ?? `https://www.facebook.com/${response.id}`,
    platformResponse: {
      ...sanitizeGraphResponse(response),
      reconciled_after_error: response.reconciled_after_error === true,
      attached_photo_ids: photos.map((photo) => photo.id),
    },
  };
}

async function publishVideo(target, token, post, media) {
  const response = await axios.post(`${GRAPH_VIDEO_BASE_URL}/${target.platform_asset_id}/videos`, {
    file_url: getMediaUrl(media[0]),
    title: post.title ?? getFacebookOptions(post).title ?? 'Facebook video',
    description: post.body ?? '',
    access_token: token,
  }, {
    timeout: 120_000,
  });

  return {
    platformPostId: response.data.id,
    permalinkUrl: `https://www.facebook.com/watch/?v=${response.data.id}`,
    platformResponse: sanitizeGraphResponse(response.data),
  };
}

export const facebookPageAdapter = Object.freeze({
  platform: 'facebook',
  tokenType: 'page',

  validatePost({ post, target, media }) {
    if (target.asset_type !== 'page') {
      return {
        ok: false,
        errors: [{ code: 'unsupported_asset_type', message: 'Facebook adapter supports Page assets only' }],
      };
    }

    return validatePostByMode(post, media, getRequestedMode(post, media));
  },

  async checkAuth({ target, token }) {
    try {
      const response = await axios.get(`${GRAPH_BASE_URL}/${target.platform_asset_id}`, {
        params: {
          fields: 'id,name',
          access_token: token,
        },
        timeout: 30_000,
      });

      if (response.data?.id !== target.platform_asset_id) {
        throw new PlatformAdapterError(
          'token_asset_mismatch',
          'Facebook token returned a different page than the target asset',
          { retryable: false },
        );
      }

      return {
        ok: true,
        provider_account_id: response.data.id,
        display_name: response.data.name,
      };
    } catch (error) {
      if (error instanceof PlatformAdapterError) {
        throw error;
      }

      throw mapGraphError(error, 'facebook_auth_check_failed');
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

    try {
      if (validation.mode === 'image') {
        return await publishImage(target, token, post, media);
      }

      if (validation.mode === 'video') {
        return await publishVideo(target, token, post, media);
      }

      if (validation.mode === 'carousel') {
        return await publishCarousel(target, token, post, media);
      }

      return await publishText(target, token, post);
    } catch (error) {
      throw mapGraphError(error, 'facebook_publish_failed');
    }
  },
});
