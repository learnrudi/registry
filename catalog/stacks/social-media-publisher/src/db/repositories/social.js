const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export async function upsertSocialConnection(client, input) {
  const existing = await client.query(
    `
      select id
      from social_connections
      where organization_id = $1
        and platform = $2
        and provider_account_id = $3
      limit 1
    `,
    [input.organizationId, input.platform, input.providerAccountId],
  );

  if (existing.rowCount > 0) {
    const result = await client.query(
      `
        update social_connections
        set
          display_name = $2,
          status = $3,
          scopes = $4,
          metadata = social_connections.metadata || $5,
          last_checked_at = now(),
          updated_at = now()
        where id = $1
        returning id, organization_id, platform, provider_account_id, display_name, status
      `,
      [
        existing.rows[0].id,
        input.displayName,
        input.status,
        input.scopes ?? [],
        input.metadata ?? {},
      ],
    );

    return result.rows[0];
  }

  const result = await client.query(
    `
      insert into social_connections (
        organization_id,
        platform,
        provider_account_id,
        display_name,
        status,
        scopes,
        metadata,
        created_by_user_id,
        last_checked_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, now())
      returning id, organization_id, platform, provider_account_id, display_name, status
    `,
    [
      input.organizationId,
      input.platform,
      input.providerAccountId,
      input.displayName,
      input.status,
      input.scopes ?? [],
      input.metadata ?? {},
      input.createdByUserId ?? null,
    ],
  );

  return result.rows[0];
}

export async function upsertSocialAsset(client, input) {
  const result = await client.query(
    `
      insert into social_assets (
        organization_id,
        connection_id,
        platform,
        asset_type,
        platform_asset_id,
        name,
        handle,
        active,
        status,
        capabilities,
        metadata,
        last_synced_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      on conflict (organization_id, platform, platform_asset_id)
      do update set
        connection_id = excluded.connection_id,
        asset_type = excluded.asset_type,
        name = excluded.name,
        handle = excluded.handle,
        active = excluded.active,
        status = excluded.status,
        capabilities = excluded.capabilities,
        metadata = social_assets.metadata || excluded.metadata,
        last_synced_at = now(),
        updated_at = now()
      returning id, organization_id, connection_id, platform, asset_type, platform_asset_id, name, handle, active, status
    `,
    [
      input.organizationId,
      input.connectionId,
      input.platform,
      input.assetType,
      input.platformAssetId,
      input.name,
      input.handle ?? null,
      input.active,
      input.status,
      input.capabilities ?? [],
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function upsertActiveSocialToken(client, input) {
  const updated = await client.query(
    `
      update social_tokens
      set
        encrypted_token = $5,
        encryption_key_version = $6,
        scopes = $7,
        expires_at = $8,
        status = 'active',
        metadata = social_tokens.metadata || $9,
        updated_at = now()
      where connection_id = $1
        and coalesce(asset_id, $10::uuid) = coalesce($2::uuid, $10::uuid)
        and token_type = $3
        and platform = $4
        and status = 'active'
      returning id, organization_id, connection_id, asset_id, platform, token_type, status
    `,
    [
      input.connectionId,
      input.assetId ?? null,
      input.tokenType,
      input.platform,
      input.encryptedToken,
      input.encryptionKeyVersion,
      input.scopes ?? [],
      input.expiresAt ?? null,
      input.metadata ?? {},
      ZERO_UUID,
    ],
  );

  if (updated.rowCount > 0) {
    return updated.rows[0];
  }

  const inserted = await client.query(
    `
      insert into social_tokens (
        organization_id,
        connection_id,
        asset_id,
        platform,
        token_type,
        encrypted_token,
        encryption_key_version,
        scopes,
        expires_at,
        status,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
      returning id, organization_id, connection_id, asset_id, platform, token_type, status
    `,
    [
      input.organizationId,
      input.connectionId,
      input.assetId ?? null,
      input.platform,
      input.tokenType,
      input.encryptedToken,
      input.encryptionKeyVersion,
      input.scopes ?? [],
      input.expiresAt ?? null,
      input.metadata ?? {},
    ],
  );

  return inserted.rows[0];
}

export async function listSocialAssets(client, filters = {}) {
  const conditions = ['sa.organization_id = $1'];
  const params = [filters.organizationId];

  if (filters.platform) {
    params.push(filters.platform);
    conditions.push(`sa.platform = $${params.length}`);
  }

  if (typeof filters.active === 'boolean') {
    params.push(filters.active);
    conditions.push(`sa.active = $${params.length}`);
  }

  const result = await client.query(
    `
      select
        sa.id,
        sa.organization_id,
        sa.connection_id,
        sc.display_name as connection_name,
        sc.status as connection_status,
        sa.platform,
        sa.asset_type,
        sa.platform_asset_id,
        sa.name,
        sa.handle,
        sa.active,
        sa.status,
        sa.capabilities,
        sa.metadata,
        sa.last_synced_at,
        exists (
          select 1
          from social_tokens st
          where st.organization_id = sa.organization_id
            and st.connection_id = sa.connection_id
            and st.asset_id = sa.id
            and st.status = 'active'
        ) as has_active_token
      from social_assets sa
      join social_connections sc
        on sc.id = sa.connection_id
       and sc.organization_id = sa.organization_id
      where ${conditions.join(' and ')}
      order by sa.platform asc, sa.active desc, lower(sa.name) asc
    `,
    params,
  );

  return result.rows;
}

export async function findActiveTokenForPlatformAsset(client, input) {
  const result = await client.query(
    `
      select
        sa.id as asset_id,
        sa.organization_id,
        sa.platform,
        sa.platform_asset_id,
        sa.name,
        sa.handle,
        sa.active,
        sa.status as asset_status,
        st.id as token_id,
        st.token_type,
        st.encrypted_token,
        st.encryption_key_version,
        st.scopes,
        st.status as token_status
      from social_assets sa
      join social_tokens st
        on st.organization_id = sa.organization_id
       and st.connection_id = sa.connection_id
       and st.asset_id = sa.id
      where sa.organization_id = $1
        and sa.platform = $2
        and sa.platform_asset_id = $3
        and st.token_type = $4
        and st.status = 'active'
      order by st.updated_at desc
      limit 1
    `,
    [
      input.organizationId,
      input.platform,
      input.platformAssetId,
      input.tokenType,
    ],
  );

  return result.rows[0] ?? null;
}
