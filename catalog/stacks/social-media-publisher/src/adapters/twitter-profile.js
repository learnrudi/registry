import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';

import { PlatformAdapterError } from './platform-errors.js';

const MAX_TWEET_LENGTH = 280;
const MAX_THREAD_TWEETS = 25;
const MAX_IMAGES_PER_TWEET = 4;
const MAX_TWITTER_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TWITTER_GIF_BYTES = 15 * 1024 * 1024;
const THREAD_DELAY_MS = 2_000;
const TWITTER_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function getTwitterOptions(post) {
  const metadata = post.metadata ?? {};
  return metadata.twitter ?? metadata.x ?? metadata.twitter_options ?? {};
}

function getThreadTweets(post) {
  const options = getTwitterOptions(post);
  const rawTweets = options.tweets ?? options.thread;

  if (!Array.isArray(rawTweets)) {
    return null;
  }

  return rawTweets.map((tweet) => {
    if (typeof tweet === 'string') {
      return { text: tweet, media_indexes: [] };
    }

    return {
      text: typeof tweet?.text === 'string' ? tweet.text : '',
      media_indexes: Array.isArray(tweet?.media_indexes) ? tweet.media_indexes : [],
    };
  });
}

function getRequestedMode(post, media) {
  const options = getTwitterOptions(post);
  const requested = options.media_type ?? options.publish_type;

  if (requested) {
    const normalized = String(requested).toLowerCase();
    if (['tweet', 'single'].includes(normalized)) {
      return media.length > 0 ? 'image' : 'text';
    }

    if (['images', 'photo', 'photos'].includes(normalized)) {
      return 'image';
    }

    return normalized;
  }

  if (getThreadTweets(post)) {
    return 'thread';
  }

  if (media.length === 0) {
    return 'text';
  }

  if (media.every((item) => item.media_kind === 'image')) {
    return 'image';
  }

  return 'unsupported';
}

function mapTwitterError(error, fallbackCode) {
  if (error instanceof PlatformAdapterError) {
    return error;
  }

  const code = error.code || error.data?.code || error.errors?.[0]?.code;
  const message = error.data?.detail
    || error.errors?.[0]?.message
    || error.message
    || 'X/Twitter API request failed';
  const retryableCodes = new Set([88, 130, 131, 185, 187, 226, 429, 500, 502, 503, 504]);

  return new PlatformAdapterError(code ? `twitter_${code}` : fallbackCode, message, {
    retryable: retryableCodes.has(Number(code)) || [429, 500, 502, 503, 504].includes(Number(error.status)),
    details: {
      status: error.status,
      rate_limit: error.rateLimit,
    },
  });
}

function readRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PlatformAdapterError(
      'missing_twitter_config',
      `${name} is required for X/Twitter publishing`,
      { retryable: false, details: { env: name } },
    );
  }

  return value;
}

function parseToken(token) {
  try {
    const parsed = JSON.parse(token);
    if (typeof parsed.accessToken === 'string' && typeof parsed.accessSecret === 'string') {
      return {
        oauthVersion: '1.0a',
        ...parsed,
      };
    }

    if (typeof parsed.accessToken === 'string' && parsed.oauthVersion === '2.0') {
      return parsed;
    }
  } catch {
    // Fall through to stable adapter error.
  }

  throw new PlatformAdapterError(
    'invalid_twitter_token',
    'Encrypted X/Twitter token payload is malformed',
    { retryable: false },
  );
}

function makeClient(token) {
  const credentials = parseToken(token);
  const client = credentials.oauthVersion === '2.0'
    ? new TwitterApi(credentials.accessToken)
    : new TwitterApi({
      appKey: readRequiredEnv('TWITTER_API_KEY'),
      appSecret: readRequiredEnv('TWITTER_API_SECRET'),
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessSecret,
    });

  return {
    client,
    credentials,
  };
}

function validateTweetText(text, errors, label) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    errors.push({ code: 'empty_tweet', message: `${label} requires text` });
    return;
  }

  if (text.length > MAX_TWEET_LENGTH) {
    errors.push({
      code: 'tweet_too_long',
      message: `${label} must be ${MAX_TWEET_LENGTH} characters or fewer`,
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

  const mimeType = String(item.mime_type ?? '').toLowerCase();
  if (mimeType && !TWITTER_IMAGE_MIME_TYPES.has(mimeType)) {
    errors.push({ code: 'unsupported_image_mime_type', message: `Media item ${index + 1} has unsupported image type` });
  }

  const maxBytes = mimeType === 'image/gif' ? MAX_TWITTER_GIF_BYTES : MAX_TWITTER_IMAGE_BYTES;
  if (item.bytes && Number(item.bytes) > maxBytes) {
    errors.push({ code: 'image_too_large', message: `Media item ${index + 1} exceeds X/Twitter image size limits` });
  }
}

function validateThread(post, media, errors) {
  const tweets = getThreadTweets(post);
  if (!tweets || tweets.length < 2) {
    errors.push({ code: 'invalid_thread_count', message: 'X/Twitter threads require at least two tweets' });
    return;
  }

  if (tweets.length > MAX_THREAD_TWEETS) {
    errors.push({ code: 'thread_too_long', message: `X/Twitter threads can include at most ${MAX_THREAD_TWEETS} tweets` });
  }

  for (const [index, tweet] of tweets.entries()) {
    validateTweetText(tweet.text, errors, `Tweet ${index + 1}`);

    if (tweet.media_indexes.length > MAX_IMAGES_PER_TWEET) {
      errors.push({ code: 'too_many_images', message: `Tweet ${index + 1} can include at most ${MAX_IMAGES_PER_TWEET} images` });
    }

    for (const mediaIndex of tweet.media_indexes) {
      if (!Number.isInteger(Number(mediaIndex)) || Number(mediaIndex) < 0 || Number(mediaIndex) >= media.length) {
        errors.push({ code: 'invalid_media_index', message: `Tweet ${index + 1} references an invalid media index` });
      }
    }
  }
}

function validatePostByMode(post, media, mode) {
  const errors = [];

  if (mode === 'text') {
    validateTweetText(post.body, errors, 'X/Twitter text post');
    if (media.length > 0) {
      errors.push({ code: 'text_post_cannot_have_media', message: 'X/Twitter text posts cannot include media' });
    }
  } else if (mode === 'image') {
    validateTweetText(post.body, errors, 'X/Twitter image post');
    if (media.length < 1 || media.length > MAX_IMAGES_PER_TWEET) {
      errors.push({ code: 'invalid_image_count', message: `X/Twitter image posts require 1-${MAX_IMAGES_PER_TWEET} images` });
    }

    for (const [index, item] of media.entries()) {
      validateImageMedia(item, errors, index);
    }
  } else if (mode === 'thread') {
    validateThread(post, media, errors);
    for (const [index, item] of media.entries()) {
      validateImageMedia(item, errors, index);
    }
  } else {
    errors.push({ code: 'unsupported_twitter_media_type', message: 'X/Twitter post must be text, image, or thread' });
  }

  return {
    ok: errors.length === 0,
    errors,
    mode,
  };
}

function assertHttpsUrl(value) {
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
    'X/Twitter media URL must be a valid HTTPS URL',
    { retryable: false },
  );
}

async function downloadImage(item) {
  const mimeType = String(item.mime_type ?? '').toLowerCase();
  const maxBytes = mimeType === 'image/gif' ? MAX_TWITTER_GIF_BYTES : MAX_TWITTER_IMAGE_BYTES;
  const response = await axios.get(assertHttpsUrl(item.source_url), {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: maxBytes,
  });
  const buffer = Buffer.from(response.data);

  if (buffer.length > maxBytes) {
    throw new PlatformAdapterError(
      'image_too_large',
      'X/Twitter image media exceeds size limits',
      { retryable: false },
    );
  }

  return buffer;
}

function getMediaCategory(item) {
  return String(item.mime_type ?? '').toLowerCase() === 'image/gif'
    ? 'tweet_gif'
    : 'tweet_image';
}

async function uploadImage(context, item) {
  const buffer = await downloadImage(item);

  if (context.credentials.oauthVersion === '2.0') {
    return context.client.v2.uploadMedia(buffer, {
      media_type: item.mime_type || 'image/jpeg',
      media_category: getMediaCategory(item),
    });
  }

  return context.client.v1.uploadMedia(buffer, {
    mimeType: item.mime_type || 'image/jpeg',
  });
}

async function uploadImages(context, media) {
  const mediaIds = [];
  for (const item of media) {
    mediaIds.push(await uploadImage(context, item));
  }
  return mediaIds;
}

function getTweetUrl(tweetId) {
  return `https://twitter.com/i/web/status/${tweetId}`;
}

async function publishSingleTweet(context, post, media = []) {
  const tweet = {
    text: post.body,
  };

  if (media.length > 0) {
    tweet.media = {
      media_ids: await uploadImages(context, media),
    };
  }

  const response = await context.client.v2.tweet(tweet);
  const tweetId = response.data.id;

  return {
    platformPostId: tweetId,
    permalinkUrl: getTweetUrl(tweetId),
    platformResponse: {
      id: tweetId,
    },
  };
}

async function publishThread(context, post, media) {
  const tweets = getThreadTweets(post);
  const tweetIds = [];
  let replyToId = null;

  for (const [index, tweetInput] of tweets.entries()) {
    const tweet = {
      text: tweetInput.text,
    };

    if (replyToId) {
      tweet.reply = {
        in_reply_to_tweet_id: replyToId,
      };
    }

    const tweetMedia = tweetInput.media_indexes.map((mediaIndex) => media[Number(mediaIndex)]);
    if (tweetMedia.length > 0) {
      tweet.media = {
        media_ids: await uploadImages(context, tweetMedia),
      };
    }

    const response = await context.client.v2.tweet(tweet);
    replyToId = response.data.id;
    tweetIds.push(replyToId);

    if (index < tweets.length - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, THREAD_DELAY_MS);
      });
    }
  }

  return {
    platformPostId: tweetIds[0],
    permalinkUrl: getTweetUrl(tweetIds[0]),
    platformResponse: {
      tweet_ids: tweetIds,
    },
  };
}

export const twitterProfileAdapter = Object.freeze({
  platform: 'twitter',
  tokenType: 'user',

  validatePost({ post, target, media }) {
    if (target.asset_type !== 'profile') {
      return {
        ok: false,
        errors: [{ code: 'unsupported_asset_type', message: 'X/Twitter adapter supports profile assets only' }],
      };
    }

    return validatePostByMode(post, media, getRequestedMode(post, media));
  },

  async checkAuth({ target, token }) {
    try {
      const context = makeClient(token);
      let legacyUser = null;

      if (context.credentials.oauthVersion !== '2.0') {
        legacyUser = await context.client.v1.verifyCredentials();
        if (legacyUser.id_str !== target.platform_asset_id) {
          throw new PlatformAdapterError(
            'token_asset_mismatch',
            'X/Twitter token returned a different profile than the target asset',
            { retryable: false },
          );
        }
      }

      const me = await context.client.v2.me();
      if (me.data?.id && me.data.id !== target.platform_asset_id) {
        throw new PlatformAdapterError(
          'token_asset_mismatch',
          'X/Twitter v2 token returned a different profile than the target asset',
          { retryable: false },
        );
      }

      return {
        ok: true,
        provider_account_id: me.data?.id ?? legacyUser?.id_str,
        display_name: me.data?.name ?? legacyUser?.name ?? me.data?.username,
      };
    } catch (error) {
      throw mapTwitterError(error, 'twitter_auth_check_failed');
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
      const context = makeClient(token);
      if (validation.mode === 'thread') {
        return await publishThread(context, post, media);
      }

      return await publishSingleTweet(context, post, media);
    } catch (error) {
      throw mapTwitterError(error, 'twitter_publish_failed');
    }
  },
});
