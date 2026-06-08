import {
  findOrganizationByExternalSubject,
  findUserByExternalSubject,
} from '../db/repositories/organizations.js';
import { listSocialAssets } from '../db/repositories/social.js';

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error('active must be true or false');
}

export async function resolveBootstrapOrganization(client, config) {
  const organization = await findOrganizationByExternalSubject(client, {
    externalAuthProvider: 'clerk',
    externalAuthSubject: config.bootstrapOrganizationSubject,
  });

  if (!organization) {
    throw new Error('Bootstrap organization has not been imported');
  }

  return organization;
}

export async function resolveBootstrapUser(client, config, organizationId) {
  return findUserByExternalSubject(client, {
    organizationId,
    externalAuthProvider: 'clerk',
    externalAuthSubject: config.bootstrapUserSubject,
  });
}

export function parseAssetFilters(input = {}) {
  return {
    platform: input.platform ? String(input.platform).toLowerCase() : undefined,
    active: parseBoolean(input.active),
  };
}

export async function listAssetsForOrganization(client, input) {
  const filters = parseAssetFilters(input.filters);

  return listSocialAssets(client, {
    organizationId: input.organizationId,
    platform: filters.platform,
    active: filters.active,
  });
}
