import { findActiveTokenForPlatformAsset } from '../db/repositories/social.js';
import { decryptToken } from '../security/token-crypto.js';

export async function getDecryptedTokenForPlatformAsset(client, input) {
  const tokenRecord = await findActiveTokenForPlatformAsset(client, {
    organizationId: input.organizationId,
    platform: input.platform,
    platformAssetId: input.platformAssetId,
    tokenType: input.tokenType ?? 'page',
  });

  if (!tokenRecord) {
    throw new Error(`No active encrypted token found for ${input.platform}:${input.platformAssetId}`);
  }

  return {
    asset: {
      id: tokenRecord.asset_id,
      organizationId: tokenRecord.organization_id,
      platform: tokenRecord.platform,
      platformAssetId: tokenRecord.platform_asset_id,
      name: tokenRecord.name,
      handle: tokenRecord.handle,
      active: tokenRecord.active,
      status: tokenRecord.asset_status,
    },
    token: decryptToken(tokenRecord.encrypted_token, {
      keyMaterial: input.config.tokenEncryptionKey,
      keyVersion: tokenRecord.encryption_key_version,
    }),
  };
}
