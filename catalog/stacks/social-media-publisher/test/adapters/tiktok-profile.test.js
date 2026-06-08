import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import axios from 'axios';

import { queryTikTokCreatorInfo, tiktokProfileAdapter } from '../../src/adapters/tiktok-profile.js';

const target = Object.freeze({
  asset_type: 'profile',
  platform_asset_id: 'self',
});

function post(overrides = {}) {
  return {
    body: 'TikTok inbox upload caption',
    metadata: {},
    ...overrides,
  };
}

function localVideo(overrides = {}) {
  return {
    media_kind: 'video',
    source_path: '/tmp/video.mp4',
    mime_type: 'video/mp4',
    bytes: 4,
    ...overrides,
  };
}

function remoteVideo(overrides = {}) {
  return {
    media_kind: 'video',
    source_url: 'https://example.com/video.mp4',
    mime_type: 'video/mp4',
    bytes: 4,
    ...overrides,
  };
}

function mockAxios(methods) {
  const original = {
    post: axios.post,
    put: axios.put,
  };

  axios.post = methods.post ?? (async () => ({ data: {} }));
  axios.put = methods.put ?? (async () => ({ data: {} }));

  return () => {
    axios.post = original.post;
    axios.put = original.put;
  };
}

test('tiktok adapter validates local video inbox uploads', () => {
  const result = tiktokProfileAdapter.validatePost({
    post: post(),
    target,
    media: [localVideo()],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'inbox_file_upload');
});

test('tiktok adapter validates verified HTTPS pull uploads', () => {
  const result = tiktokProfileAdapter.validatePost({
    post: post(),
    target,
    media: [remoteVideo()],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'inbox_pull_from_url');
});

test('tiktok adapter rejects non-HTTPS pull URLs', () => {
  const result = tiktokProfileAdapter.validatePost({
    post: post(),
    target,
    media: [remoteVideo({ source_url: 'http://example.com/video.mp4' })],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'media_url_not_https');
});

test('tiktok adapter uploads local files with Content Posting API chunk headers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rudi-tiktok-'));
  const videoPath = join(dir, 'video.mp4');
  writeFileSync(videoPath, Buffer.from([1, 2, 3, 4]));

  let initBody;
  let uploadHeaders;
  const restoreAxios = mockAxios({
    post: async (url, body, config) => {
      assert.equal(url, 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
      assert.equal(config.headers.Authorization, 'Bearer access-token');
      initBody = body;
      return {
        data: {
          data: {
            publish_id: 'v_inbox_file~v2.123',
            upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=123',
          },
          error: { code: 'ok', message: '', log_id: 'log-id' },
        },
      };
    },
    put: async (url, body, config) => {
      assert.equal(url, 'https://open-upload.tiktokapis.com/video/?upload_id=123');
      uploadHeaders = config.headers;
      for await (const _chunk of body) {
        // Drain the stream so the temp file is not removed before Node opens it.
      }
      return { data: {} };
    },
  });

  try {
    const result = await tiktokProfileAdapter.publish({
      post: post(),
      target,
      media: [localVideo({ source_path: videoPath, bytes: undefined })],
      token: 'access-token',
    });

    assert.equal(result.platformPostId, 'v_inbox_file~v2.123');
    assert.equal(initBody.source_info.source, 'FILE_UPLOAD');
    assert.equal(initBody.source_info.video_size, 4);
    assert.equal(initBody.source_info.chunk_size, 4);
    assert.equal(initBody.source_info.total_chunk_count, 1);
    assert.equal(uploadHeaders['Content-Type'], 'video/mp4');
    assert.equal(uploadHeaders['Content-Length'], '4');
    assert.equal(uploadHeaders['Content-Range'], 'bytes 0-3/4');
    assert.equal(result.platformResponse.inbox_delivery_required, true);
  } finally {
    restoreAxios();
    rmSync(dir, { force: true, recursive: true });
  }
});

test('tiktok adapter refreshes token credentials before upload init', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rudi-tiktok-refresh-'));
  const videoPath = join(dir, 'video.mp4');
  writeFileSync(videoPath, Buffer.from([1, 2, 3, 4]));

  const calls = [];
  const restoreAxios = mockAxios({
    post: async (url, body, config) => {
      calls.push(url);

      if (url === 'https://open.tiktokapis.com/v2/oauth/token/') {
        assert.equal(body.get('client_key'), 'client-key');
        assert.equal(body.get('client_secret'), 'client-secret');
        assert.equal(body.get('grant_type'), 'refresh_token');
        assert.equal(body.get('refresh_token'), 'refresh-token');
        return {
          data: {
            access_token: 'refreshed-access-token',
            refresh_token: 'next-refresh-token',
            token_type: 'Bearer',
          },
        };
      }

      assert.equal(config.headers.Authorization, 'Bearer refreshed-access-token');
      return {
        data: {
          data: {
            publish_id: 'v_inbox_file~v2.refresh',
            upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=456',
          },
          error: { code: 'ok', message: '', log_id: 'log-id' },
        },
      };
    },
    put: async (_url, body) => {
      for await (const _chunk of body) {
        // Drain the stream so the temp file can be removed cleanly.
      }
      return { data: {} };
    },
  });

  try {
    const result = await tiktokProfileAdapter.publish({
      post: post(),
      target,
      media: [localVideo({ source_path: videoPath, bytes: undefined })],
      token: JSON.stringify({
        refreshToken: 'refresh-token',
        clientKey: 'client-key',
        clientSecret: 'client-secret',
      }),
    });

    assert.deepEqual(calls, [
      'https://open.tiktokapis.com/v2/oauth/token/',
      'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
    ]);
    assert.equal(result.platformPostId, 'v_inbox_file~v2.refresh');
  } finally {
    restoreAxios();
    rmSync(dir, { force: true, recursive: true });
  }
});

test('tiktok adapter queries direct post creator info', async () => {
  const restoreAxios = mockAxios({
    post: async (url, body, config) => {
      assert.equal(url, 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/');
      assert.deepEqual(body, {});
      assert.equal(config.headers.Authorization, 'Bearer access-token');
      return {
        data: {
          data: {
            creator_username: 'demo_creator',
            creator_nickname: 'Demo',
            privacy_level_options: ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS'],
            comment_disabled: false,
            duet_disabled: true,
            stitch_disabled: false,
            max_video_post_duration_sec: 600,
          },
          error: { code: 'ok', message: '', log_id: 'log-id' },
        },
      };
    },
  });

  try {
    const result = await queryTikTokCreatorInfo({ accessToken: 'access-token' });

    assert.equal(result.creator_username, 'demo_creator');
    assert.deepEqual(result.privacy_level_options, ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS']);
    assert.equal(result.duet_disabled, true);
  } finally {
    restoreAxios();
  }
});

test('tiktok adapter direct posts local files with privacy and caption metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rudi-tiktok-direct-'));
  const videoPath = join(dir, 'video.mp4');
  writeFileSync(videoPath, Buffer.from([1, 2, 3, 4]));

  const calls = [];
  let initBody;
  let uploadHeaders;
  const restoreAxios = mockAxios({
    post: async (url, body, config) => {
      calls.push(url);
      assert.equal(config.headers.Authorization, 'Bearer access-token');

      if (url === 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/') {
        return {
          data: {
            data: {
              creator_username: 'demo_creator',
              privacy_level_options: ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS'],
              comment_disabled: false,
              duet_disabled: true,
              stitch_disabled: false,
              max_video_post_duration_sec: 600,
            },
            error: { code: 'ok', message: '', log_id: 'log-id' },
          },
        };
      }

      assert.equal(url, 'https://open.tiktokapis.com/v2/post/publish/video/init/');
      initBody = body;
      return {
        data: {
          data: {
            publish_id: 'v_pub_file~v2.123',
            upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=direct',
          },
          error: { code: 'ok', message: '', log_id: 'log-id' },
        },
      };
    },
    put: async (url, body, config) => {
      assert.equal(url, 'https://open-upload.tiktokapis.com/video/?upload_id=direct');
      uploadHeaders = config.headers;
      for await (const _chunk of body) {
        // Drain stream.
      }
      return { data: {} };
    },
  });

  try {
    const result = await tiktokProfileAdapter.directPost({
      post: post({ body: 'Direct post caption #rudi' }),
      target,
      media: [localVideo({ source_path: videoPath, bytes: undefined })],
      token: 'access-token',
      options: {
        privacyLevel: 'SELF_ONLY',
        disableComment: true,
        disableDuet: false,
        disableStitch: false,
      },
    });

    assert.deepEqual(calls, [
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
    ]);
    assert.equal(result.platformPostId, 'v_pub_file~v2.123');
    assert.equal(initBody.post_info.title, 'Direct post caption #rudi');
    assert.equal(initBody.post_info.privacy_level, 'SELF_ONLY');
    assert.equal(initBody.post_info.disable_comment, true);
    assert.equal(initBody.post_info.disable_duet, true);
    assert.equal(initBody.post_info.disable_stitch, false);
    assert.equal(initBody.post_info.brand_content_toggle, false);
    assert.equal(initBody.post_info.brand_organic_toggle, false);
    assert.equal(initBody.source_info.source, 'FILE_UPLOAD');
    assert.equal(uploadHeaders['Content-Range'], 'bytes 0-3/4');
    assert.equal(result.platformResponse.direct_post, true);
  } finally {
    restoreAxios();
    rmSync(dir, { force: true, recursive: true });
  }
});

test('tiktok adapter rejects direct post privacy values not returned by creator info', async () => {
  const restoreAxios = mockAxios({
    post: async () => ({
      data: {
        data: {
          creator_username: 'demo_creator',
          privacy_level_options: ['SELF_ONLY'],
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: false,
          max_video_post_duration_sec: 600,
        },
        error: { code: 'ok', message: '', log_id: 'log-id' },
      },
    }),
  });

  try {
    await assert.rejects(
      () => tiktokProfileAdapter.directPost({
        post: post(),
        target,
        media: [localVideo()],
        token: 'access-token',
        options: { privacyLevel: 'PUBLIC_TO_EVERYONE' },
      }),
      (error) => error.code === 'privacy_level_option_mismatch',
    );
  } finally {
    restoreAxios();
  }
});
