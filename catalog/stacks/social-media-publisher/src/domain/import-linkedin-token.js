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

const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export const LINKEDIN_SCOPES = Object.freeze([
  'openid',
  'profile',
  'w_member_social',
]);

function assertToken(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function encryptConfigToken(token, config) {
  return encryptToken(token, {
    keyMaterial: config.tokenEncryptionKey,
    keyVersion: config.tokenEncryptionKeyVersion,
  });
}

export async function getLinkedInUserInfo(accessToken) {
  assertToken(accessToken, 'LinkedIn access token');

  try {
    const response = await axios.get(USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30_000,
    });

    if (!response.data || typeof response.data.sub !== 'string' || response.data.sub.length === 0) {
      throw new Error('LinkedIn userinfo response did not include a subject identifier');
    }

    return response.data;
  } catch (error) {
    const message = error.response?.data?.message
      || error.response?.data?.error_description
      || error.message;
    throw new Error(`LinkedIn token validation failed: ${message}`);
  }
}

export async function importLinkedInToken(client, input) {
  assertToken(input.accessToken, 'LinkedIn access token');

  const userInfo = input.userInfo ?? await getLinkedInUserInfo(input.accessToken);
  const subject = userInfo.sub;
  const nameParts = [userInfo.given_name, userInfo.family_name]
    .map(normalizeOptionalString)
    .filter(Boolean)
    .join(' ');
  const displayName = normalizeOptionalString(userInfo.name)
    ?? normalizeOptionalString(nameParts)
    ?? 'LinkedIn Profile';

  const organization = await upsertOrganization(client, {
    externalAuthProvider: 'clerk',
    externalAuthSubject: input.config.bootstrapOrganizationSubject,
    name: input.config.bootstrapOrganizationName,
    slug: input.config.bootstrapOrganizationSlug,
    metadata: {
      bootstrap: true,
      imported_from: 'linkedin_token',
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
      imported_from: 'linkedin_token',
    },
  });

  const connection = await upsertSocialConnection(client, {
    organizationId: organization.id,
    platform: 'linkedin',
    providerAccountId: subject,
    displayName,
    status: CONNECTION_STATUSES.HEALTHY,
    scopes: input.scopes ?? LINKEDIN_SCOPES,
    metadata: {
      imported_from: input.importedFrom ?? 'linkedin_token',
    },
    createdByUserId: user.id,
  });

  const asset = await upsertSocialAsset(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    platform: 'linkedin',
    assetType: 'profile',
    platformAssetId: subject,
    name: displayName,
    handle: null,
    active: true,
    status: CONNECTION_STATUSES.HEALTHY,
    capabilities: ['text_post', 'image_post', 'video_post'],
    metadata: {
      imported_from: input.importedFrom ?? 'linkedin_token',
    },
  });

  const accessToken = await upsertActiveSocialToken(client, {
    organizationId: organization.id,
    connectionId: connection.id,
    assetId: asset.id,
    platform: 'linkedin',
    tokenType: 'user',
    encryptedToken: encryptConfigToken(input.accessToken, input.config),
    encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
    scopes: input.scopes ?? LINKEDIN_SCOPES,
    expiresAt: input.expiresAt ?? null,
    metadata: {
      imported_from: input.importedFrom ?? 'linkedin_token',
    },
  });

  let refreshToken = null;

  if (input.refreshToken) {
    refreshToken = await upsertActiveSocialToken(client, {
      organizationId: organization.id,
      connectionId: connection.id,
      assetId: asset.id,
      platform: 'linkedin',
      tokenType: 'refresh',
      encryptedToken: encryptConfigToken(input.refreshToken, input.config),
      encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
      scopes: input.scopes ?? LINKEDIN_SCOPES,
      expiresAt: null,
      metadata: {
        imported_from: input.importedFrom ?? 'linkedin_token',
      },
    });
  }

  await recordAuditEvent(client, {
    organizationId: organization.id,
    actorType: 'system',
    action: 'linkedin_token_imported',
    entityType: 'social_connection',
    entityId: connection.id,
    reason: 'Bootstrap LinkedIn token into unified encrypted token store',
    metadata: {
      asset_id: asset.id,
      has_refresh_token: Boolean(refreshToken),
    },
  });

  return {
    organization,
    user,
    connection,
    asset,
    accessToken,
    refreshToken,
  };
}
