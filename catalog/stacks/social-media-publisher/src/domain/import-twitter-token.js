import { TwitterApi } from 'twitter-api-v2';

import { recordAuditEvent } from '../db/repositories/audit-events.js';
import { upsertOrganization, upsertUser } from '../db/repositories/organizations.js';
import {
  upsertActiveSocialToken,
  upsertSocialAsset,
  upsertSocialConnection,
} from '../db/repositories/social.js';
import { encryptToken } from '../security/token-crypto.js';
import { CONNECTION_STATUSES } from './states.js';

export const TWITTER_SCOPES = Object.freeze([
  'oauth1a:read',
  'oauth1a:write',
]);

export const TWITTER_OAUTH2_SCOPES = Object.freeze([
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
  'offline.access',
]);

function assertSecret(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
}

function makeTwitterClient(input) {
  return new TwitterApi({
    appKey: input.appKey,
    appSecret: input.appSecret,
    accessToken: input.accessToken,
    accessSecret: input.accessSecret,
  });
}

function encryptUserCredentials(input, config) {
  return encryptToken(JSON.stringify({
    oauthVersion: '1.0a',
    accessToken: input.accessToken,
    accessSecret: input.accessSecret,
  }), {
    keyMaterial: config.tokenEncryptionKey,
    keyVersion: config.tokenEncryptionKeyVersion,
  });
}

function encryptOAuth2UserToken(input, config) {
  return encryptToken(JSON.stringify({
    oauthVersion: '2.0',
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
  }), {
    keyMaterial: config.tokenEncryptionKey,
    keyVersion: config.tokenEncryptionKeyVersion,
  });
}

export async function getTwitterUserInfo(input) {
  assertSecret(input.appKey, 'Twitter API key');
  assertSecret(input.appSecret, 'Twitter API secret');
  assertSecret(input.accessToken, 'Twitter access token');
  assertSecret(input.accessSecret, 'Twitter access secret');

  try {
    const client = makeTwitterClient(input);
    const response = await client.v1.verifyCredentials();

    if (!response.id_str) {
      throw new Error('Twitter verify_credentials response did not include a user id');
    }

    return {
      id: response.id_str,
      name: response.name,
      username: response.screen_name,
    };
  } catch (error) {
    throw new Error(`Twitter token validation failed: ${error.message}`);
  }
}

export async function getTwitterOAuth2UserInfo(input) {
  assertSecret(input.accessToken, 'Twitter OAuth 2.0 access token');

  try {
    const client = new TwitterApi(input.accessToken);
    const response = await client.v2.me();

    if (!response.data?.id) {
      throw new Error('Twitter OAuth 2.0 users/me response did not include a user id');
    }

    return {
      id: response.data.id,
      name: response.data.name,
      username: response.data.username,
    };
  } catch (error) {
    throw new Error(`Twitter OAuth 2.0 token validation failed: ${error.message}`);
  }
}

export async function importTwitterToken(client, input) {
  const userInfo = input.userInfo ?? await getTwitterUserInfo(input);
  const displayName = userInfo.name || userInfo.username || 'Twitter Profile';
  const handle = userInfo.username ? userInfo.username.toLowerCase() : null;

  const organization = await upsertOrganization(client, {
    externalAuthProvider: 'clerk',
    externalAuthSubject: input.config.bootstrapOrganizationSubject,
    name: input.config.bootstrapOrganizationName,
    slug: input.config.bootstrapOrganizationSlug,
    metadata: {
      bootstrap: true,
      imported_from: 'twitter_token',
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
      imported_from: 'twitter_token',
    },
  });

  const connection = await upsertSocialConnection(client, {
    organizationId: organization.id,
    platform: 'twitter',
    providerAccountId: userInfo.id,
    displayName,
    status: CONNECTION_STATUSES.HEALTHY,
    scopes: input.scopes ?? TWITTER_SCOPES,
    metadata: {
      imported_from: input.importedFrom ?? 'twitter_token',
      oauth_version: '1.0a',
    },
    createdByUserId: user.id,
  });

  const asset = await upsertSocialAsset(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    platform: 'twitter',
    assetType: 'profile',
    platformAssetId: userInfo.id,
    name: displayName,
    handle,
    active: true,
    status: CONNECTION_STATUSES.HEALTHY,
    capabilities: ['text_post', 'thread_post', 'image_post', 'delete_post'],
    metadata: {
      imported_from: input.importedFrom ?? 'twitter_token',
      username: userInfo.username ?? null,
    },
  });

  const accessToken = await upsertActiveSocialToken(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    assetId: asset.id,
    platform: 'twitter',
    tokenType: 'user',
    encryptedToken: encryptUserCredentials(input, input.config),
    encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
    scopes: input.scopes ?? TWITTER_SCOPES,
    expiresAt: null,
    metadata: {
      imported_from: input.importedFrom ?? 'twitter_token',
      oauth_version: '1.0a',
    },
  });

  await recordAuditEvent(client, {
    organizationId: organization.id,
    actorType: 'system',
    action: 'twitter_token_imported',
    entityType: 'social_connection',
    entityId: connection.id,
    reason: 'Bootstrap Twitter token into unified encrypted token store',
    metadata: {
      asset_id: asset.id,
      handle,
    },
  });

  return {
    organization,
    user,
    connection,
    asset,
    accessToken,
  };
}

export async function importTwitterOAuth2Token(client, input) {
  const userInfo = input.userInfo ?? await getTwitterOAuth2UserInfo(input);
  const displayName = userInfo.name || userInfo.username || 'Twitter Profile';
  const handle = userInfo.username ? userInfo.username.toLowerCase() : null;

  const organization = await upsertOrganization(client, {
    externalAuthProvider: 'clerk',
    externalAuthSubject: input.config.bootstrapOrganizationSubject,
    name: input.config.bootstrapOrganizationName,
    slug: input.config.bootstrapOrganizationSlug,
    metadata: {
      bootstrap: true,
      imported_from: 'twitter_oauth2_token',
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
      imported_from: 'twitter_oauth2_token',
    },
  });

  const connection = await upsertSocialConnection(client, {
    organizationId: organization.id,
    platform: 'twitter',
    providerAccountId: userInfo.id,
    displayName,
    status: CONNECTION_STATUSES.HEALTHY,
    scopes: input.scopes ?? TWITTER_OAUTH2_SCOPES,
    metadata: {
      imported_from: input.importedFrom ?? 'twitter_oauth2_token',
      oauth_version: '2.0',
    },
    createdByUserId: user.id,
  });

  const asset = await upsertSocialAsset(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    platform: 'twitter',
    assetType: 'profile',
    platformAssetId: userInfo.id,
    name: displayName,
    handle,
    active: true,
    status: CONNECTION_STATUSES.HEALTHY,
    capabilities: ['text_post', 'thread_post', 'image_post', 'delete_post'],
    metadata: {
      imported_from: input.importedFrom ?? 'twitter_oauth2_token',
      username: userInfo.username ?? null,
    },
  });

  const accessToken = await upsertActiveSocialToken(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    assetId: asset.id,
    platform: 'twitter',
    tokenType: 'user',
    encryptedToken: encryptOAuth2UserToken(input, input.config),
    encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
    scopes: input.scopes ?? TWITTER_OAUTH2_SCOPES,
    expiresAt: input.expiresAt ?? null,
    metadata: {
      imported_from: input.importedFrom ?? 'twitter_oauth2_token',
      oauth_version: '2.0',
    },
  });

  await recordAuditEvent(client, {
    organizationId: organization.id,
    actorType: 'system',
    action: 'twitter_oauth2_token_imported',
    entityType: 'social_connection',
    entityId: connection.id,
    reason: 'Bootstrap Twitter OAuth 2.0 token into unified encrypted token store',
    metadata: {
      asset_id: asset.id,
      handle,
    },
  });

  return {
    organization,
    user,
    connection,
    asset,
    accessToken,
  };
}
