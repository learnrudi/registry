import axios from 'axios';

import { recordAuditEvent } from '../db/repositories/audit-events.js';
import { upsertOrganization, upsertUser } from '../db/repositories/organizations.js';
import {
  upsertActiveSocialToken,
  upsertSocialAsset,
  upsertSocialConnection,
} from '../db/repositories/social.js';
import { encryptToken } from '../security/token-crypto.js';
import { CONNECTION_STATUSES } from './states.js';

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export const YOUTUBE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
]);

export const YOUTUBE_OAUTH_SCOPES = Object.freeze([
  ...YOUTUBE_SCOPES,
  'openid',
  'email',
]);

function assertSecret(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
}

function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.filter((scope) => typeof scope === 'string' && scope.length > 0);
  }

  if (typeof scopes === 'string') {
    return scopes.split(/\s+/).filter(Boolean);
  }

  return [...YOUTUBE_SCOPES];
}

function encryptRefreshCredential(input, config) {
  return encryptToken(JSON.stringify({
    refreshToken: input.refreshToken,
    tokenUri: input.tokenUri ?? DEFAULT_TOKEN_URI,
    scopes: normalizeScopes(input.scopes),
  }), {
    keyMaterial: config.tokenEncryptionKey,
    keyVersion: config.tokenEncryptionKeyVersion,
  });
}

export async function refreshGoogleAccessToken(input) {
  assertSecret(input.refreshToken, 'Google refresh token');
  assertSecret(input.clientId, 'Google client id');
  assertSecret(input.clientSecret, 'Google client secret');

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    });
    const response = await axios.post(input.tokenUri ?? DEFAULT_TOKEN_URI, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30_000,
    });

    if (!response.data?.access_token) {
      throw new Error('Google token refresh response did not include an access token');
    }

    return response.data;
  } catch (error) {
    const errorCode = error.response?.data?.error;
    const description = error.response?.data?.error_description;
    const message = errorCode && description
      ? `${errorCode}: ${description}`
      : description || errorCode || error.message;
    throw new Error(`Google refresh token validation failed: ${message}`);
  }
}

export async function getYouTubeChannelInfo(accessToken) {
  assertSecret(accessToken, 'Google access token');

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'id,snippet',
        mine: 'true',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30_000,
    });
    const channel = response.data?.items?.[0];

    if (!channel?.id) {
      throw new Error('YouTube channels response did not include a channel id');
    }

    return {
      id: channel.id,
      title: channel.snippet?.title ?? 'YouTube Channel',
    };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    throw new Error(`YouTube channel validation failed: ${message}`);
  }
}

export async function validateYouTubeRefreshCredential(input) {
  const refreshed = await refreshGoogleAccessToken(input);
  const channel = await getYouTubeChannelInfo(refreshed.access_token);

  return {
    refreshed,
    channel,
  };
}

export async function importYouTubeToken(client, input) {
  assertSecret(input.refreshToken, 'Google refresh token');

  const scopes = normalizeScopes(input.scopes);
  const validation = input.channel
    ? { channel: input.channel }
    : await validateYouTubeRefreshCredential({
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      tokenUri: input.tokenUri,
      scopes,
    });
  const channel = validation.channel;

  const organization = await upsertOrganization(client, {
    externalAuthProvider: 'clerk',
    externalAuthSubject: input.config.bootstrapOrganizationSubject,
    name: input.config.bootstrapOrganizationName,
    slug: input.config.bootstrapOrganizationSlug,
    metadata: {
      bootstrap: true,
      imported_from: 'youtube_token',
    },
  });

  const user = await upsertUser(client, {
    organizationId: organization.id,
    externalAuthProvider: 'clerk',
    externalAuthSubject: input.config.bootstrapUserSubject,
    email: input.config.bootstrapUserEmail,
    displayName: input.config.bootstrapUserDisplayName,
    role: 'owner',
    metadata: {
      bootstrap: true,
      imported_from: 'youtube_token',
    },
  });

  const connection = await upsertSocialConnection(client, {
    organizationId: organization.id,
    platform: 'google',
    providerAccountId: `youtube:${channel.id}`,
    displayName: channel.title,
    status: CONNECTION_STATUSES.HEALTHY,
    scopes,
    metadata: {
      imported_from: input.importedFrom ?? 'youtube_token',
      provider: 'google',
    },
    createdByUserId: user.id,
  });

  const asset = await upsertSocialAsset(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    platform: 'youtube',
    assetType: 'channel',
    platformAssetId: channel.id,
    name: channel.title,
    handle: null,
    active: true,
    status: CONNECTION_STATUSES.HEALTHY,
    capabilities: ['video_upload', 'thumbnail_upload', 'video_update', 'video_delete'],
    metadata: {
      imported_from: input.importedFrom ?? 'youtube_token',
      provider: 'google',
    },
  });

  const refreshToken = await upsertActiveSocialToken(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    assetId: asset.id,
    platform: 'youtube',
    tokenType: 'refresh',
    encryptedToken: encryptRefreshCredential({
      refreshToken: input.refreshToken,
      tokenUri: input.tokenUri,
      scopes,
    }, input.config),
    encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
    scopes,
    expiresAt: null,
    metadata: {
      imported_from: input.importedFrom ?? 'youtube_token',
      provider: 'google',
    },
  });

  await recordAuditEvent(client, {
    organizationId: organization.id,
    actorType: 'system',
    action: 'youtube_token_imported',
    entityType: 'social_connection',
    entityId: connection.id,
    reason: 'Bootstrap YouTube refresh token into unified encrypted token store',
    metadata: {
      asset_id: asset.id,
      channel_id: channel.id,
    },
  });

  return {
    organization,
    user,
    connection,
    asset,
    refreshToken,
  };
}
