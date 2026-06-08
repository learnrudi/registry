import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { recordAuditEvent } from '../db/repositories/audit-events.js';
import { upsertOrganization, upsertUser } from '../db/repositories/organizations.js';
import {
  upsertActiveSocialToken,
  upsertSocialAsset,
  upsertSocialConnection,
} from '../db/repositories/social.js';
import { encryptToken } from '../security/token-crypto.js';
import { CONNECTION_STATUSES } from './states.js';

const META_SCOPES = Object.freeze([
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'public_profile',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'publish_video',
]);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function assertToken(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is missing an access token`);
  }
}

function encryptConfigToken(token, config) {
  return encryptToken(token, {
    keyMaterial: config.tokenEncryptionKey,
    keyVersion: config.tokenEncryptionKeyVersion,
  });
}

async function importFacebookPages(client, input) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const imported = [];

  for (const page of pages) {
    assertToken(page.access_token, `Facebook page ${page.name || page.page_id}`);

    const asset = await upsertSocialAsset(client, {
      organizationId: input.organization.id,
      connectionId: input.connection.id,
      platform: 'facebook',
      assetType: 'page',
      platformAssetId: page.page_id,
      name: page.name,
      handle: null,
      active: page.active !== false,
      status: CONNECTION_STATUSES.HEALTHY,
      capabilities: ['text_post', 'image_post', 'video_post', 'carousel_post'],
      metadata: {
        category: page.category ?? null,
        imported_from: 'platforms/meta/pages-config.json',
      },
    });

    await upsertActiveSocialToken(client, {
      organizationId: input.organization.id,
      connectionId: input.connection.id,
      assetId: asset.id,
      platform: 'facebook',
      tokenType: 'page',
      encryptedToken: encryptConfigToken(page.access_token, input.config),
      encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
      scopes: META_SCOPES,
      metadata: {
        imported_from: 'platforms/meta/pages-config.json',
      },
    });

    imported.push(asset);
  }

  return imported;
}

async function importInstagramAccounts(client, input) {
  const accounts = Array.isArray(input.instagramAccounts) ? input.instagramAccounts : [];
  const imported = [];

  for (const account of accounts) {
    assertToken(account.access_token, `Instagram account ${account.instagram_username || account.instagram_account_id}`);

    const handle = account.instagram_username ? account.instagram_username.toLowerCase() : null;
    const asset = await upsertSocialAsset(client, {
      organizationId: input.organization.id,
      connectionId: input.connection.id,
      platform: 'instagram',
      assetType: 'profile',
      platformAssetId: account.instagram_account_id,
      name: handle ? `@${handle}` : account.facebook_page_name,
      handle,
      active: account.active !== false,
      status: CONNECTION_STATUSES.HEALTHY,
      capabilities: ['image_post', 'reel_post', 'carousel_post'],
      metadata: {
        facebook_page_id: account.facebook_page_id,
        facebook_page_name: account.facebook_page_name,
        imported_from: 'platforms/meta/instagram/instagram-config.json',
      },
    });

    await upsertActiveSocialToken(client, {
      organizationId: input.organization.id,
      connectionId: input.connection.id,
      assetId: asset.id,
      platform: 'instagram',
      tokenType: 'page',
      encryptedToken: encryptConfigToken(account.access_token, input.config),
      encryptionKeyVersion: input.config.tokenEncryptionKeyVersion,
      scopes: META_SCOPES,
      metadata: {
        facebook_page_id: account.facebook_page_id,
        imported_from: 'platforms/meta/instagram/instagram-config.json',
      },
    });

    imported.push(asset);
  }

  return imported;
}

export async function importMetaConfig(client, input) {
  const pagesConfig = await readJson(input.pagesConfigPath);
  const instagramConfig = await readJson(input.instagramConfigPath);

  return importMetaConfigFromData(client, {
    config: input.config,
    pages: Array.isArray(pagesConfig.pages) ? pagesConfig.pages : [],
    instagramAccounts: Array.isArray(instagramConfig.accounts) ? instagramConfig.accounts : [],
  });
}

export async function importMetaConfigFromData(client, input) {
  const organization = await upsertOrganization(client, {
    externalAuthProvider: 'clerk',
    externalAuthSubject: input.config.bootstrapOrganizationSubject,
    name: input.config.bootstrapOrganizationName,
    slug: input.config.bootstrapOrganizationSlug,
    metadata: {
      bootstrap: true,
      imported_from: 'meta_config',
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
      imported_from: 'meta_config',
    },
  });

  const connection = await upsertSocialConnection(client, {
    organizationId: organization.id,
    platform: 'meta',
    providerAccountId: 'local-meta-config',
    displayName: 'Meta local config',
    status: CONNECTION_STATUSES.HEALTHY,
    scopes: META_SCOPES,
    metadata: {
      imported_from: 'meta_config',
    },
    createdByUserId: user.id,
  });

  const facebookAssets = await importFacebookPages(client, {
    ...input,
    pages: input.pages,
    organization,
    connection,
  });
  const instagramAssets = await importInstagramAccounts(client, {
    ...input,
    instagramAccounts: input.instagramAccounts,
    organization,
    connection,
  });

  await recordAuditEvent(client, {
    organizationId: organization.id,
    actorType: 'system',
    action: 'meta_config_imported',
    entityType: 'social_connection',
    entityId: connection.id,
    reason: 'Bootstrap existing Meta JSON configs into unified schema',
    metadata: {
      facebook_assets: facebookAssets.length,
      instagram_assets: instagramAssets.length,
    },
  });

  return {
    organization,
    user,
    connection,
    facebookAssets,
    instagramAssets,
  };
}

export function getDefaultMetaConfigPaths() {
  const baseDir = process.env.SOCIAL_MEDIA_CONFIG_DIR
    ?? path.join(homedir(), '.rudi', 'state', 'stacks', 'social-media-publisher', 'platforms');

  return {
    pagesConfigPath: process.env.META_PAGES_CONFIG_PATH
      ?? path.join(baseDir, 'meta', 'pages-config.json'),
    instagramConfigPath: process.env.INSTAGRAM_CONFIG_PATH
      ?? path.join(baseDir, 'meta', 'instagram', 'instagram-config.json'),
  };
}
