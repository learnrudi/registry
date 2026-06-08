export async function insertMediaAsset(client, input) {
  const result = await client.query(
    `
      insert into media_assets (
        organization_id,
        source_type,
        source_url,
        cloudinary_public_id,
        storage_key,
        media_kind,
        mime_type,
        bytes,
        width,
        height,
        duration_seconds,
        sha256,
        status,
        metadata,
        created_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      returning
        id,
        organization_id,
        source_type,
        source_url,
        cloudinary_public_id,
        storage_key,
        media_kind,
        mime_type,
        bytes,
        width,
        height,
        duration_seconds,
        sha256,
        status,
        metadata,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [
      input.organizationId,
      input.sourceType,
      input.sourceUrl ?? null,
      input.cloudinaryPublicId ?? null,
      input.storageKey ?? null,
      input.mediaKind,
      input.mimeType,
      input.bytes ?? null,
      input.width ?? null,
      input.height ?? null,
      input.durationSeconds ?? null,
      input.sha256 ?? null,
      input.status ?? 'ready',
      input.metadata ?? {},
      input.createdByUserId ?? null,
    ],
  );

  return result.rows[0];
}

export async function findMediaAssetById(client, input) {
  const result = await client.query(
    `
      select
        id,
        organization_id,
        source_type,
        source_url,
        cloudinary_public_id,
        storage_key,
        media_kind,
        mime_type,
        bytes,
        width,
        height,
        duration_seconds,
        sha256,
        status,
        metadata,
        created_by_user_id,
        created_at,
        updated_at
      from media_assets
      where organization_id = $1
        and id = $2
    `,
    [input.organizationId, input.mediaAssetId],
  );

  return result.rows[0] ?? null;
}
