import { resolveBootstrapOrganization, listAssetsForOrganization } from '../../domain/assets.js';
import { getDatabasePool } from '../../db/pool.js';

function toAssetResponse(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    connection_id: row.connection_id,
    connection_name: row.connection_name,
    connection_status: row.connection_status,
    platform: row.platform,
    asset_type: row.asset_type,
    platform_asset_id: row.platform_asset_id,
    name: row.name,
    handle: row.handle,
    active: row.active,
    status: row.status,
    capabilities: row.capabilities,
    metadata: row.metadata,
    last_synced_at: row.last_synced_at,
    auth: {
      has_active_token: row.has_active_token,
    },
  };
}

export function registerAssetRoutes(app, config) {
  app.get('/v1/assets', async (c) => {
    const pool = getDatabasePool(config);
    const client = await pool.connect();

    try {
      const organization = await resolveBootstrapOrganization(client, config);
      const assets = await listAssetsForOrganization(client, {
        organizationId: organization.id,
        filters: {
          platform: c.req.query('platform'),
          active: c.req.query('active'),
        },
      });

      return c.json({
        data: assets.map(toAssetResponse),
        meta: {
          count: assets.length,
          organization_id: organization.id,
        },
      });
    } finally {
      client.release();
    }
  });
}
