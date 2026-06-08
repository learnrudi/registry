import { getDatabasePool } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import { resolveBootstrapOrganization, resolveBootstrapUser } from '../../domain/assets.js';
import { badRequest } from '../../domain/errors.js';
import { getMediaAsset, registerExternalMedia } from '../../domain/media.js';

async function readJsonObject(c) {
  try {
    const body = await c.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw badRequest('invalid_json_body', 'Request body must be a JSON object');
    }

    return body;
  } catch (error) {
    if (error.code) {
      throw error;
    }

    throw badRequest('invalid_json_body', 'Request body must be valid JSON');
  }
}

async function resolveRequestContext(client, config) {
  const organization = await resolveBootstrapOrganization(client, config);
  const user = await resolveBootstrapUser(client, config, organization.id);

  return {
    organization,
    actorUserId: user?.id ?? null,
  };
}

function mapMediaInput(body) {
  return {
    sourceType: body.source_type,
    sourceUrl: body.source_url,
    cloudinaryPublicId: body.cloudinary_public_id,
    storageKey: body.storage_key,
    mediaKind: body.media_kind,
    mimeType: body.mime_type,
    bytes: body.bytes,
    width: body.width,
    height: body.height,
    durationSeconds: body.duration_seconds,
    sha256: body.sha256,
    metadata: body.metadata,
  };
}

export function registerMediaRoutes(app, config) {
  app.post('/v1/media', async (c) => {
    const body = await readJsonObject(c);
    const pool = getDatabasePool(config);
    const result = await withTransaction(pool, async (client) => {
      const context = await resolveRequestContext(client, config);

      return registerExternalMedia(client, {
        organizationId: context.organization.id,
        actorUserId: context.actorUserId,
        requestId: c.get('requestId'),
        ...mapMediaInput(body),
      });
    });

    c.header('location', `/v1/media/${result.id}`);
    return c.json({ data: result }, 201);
  });

  app.get('/v1/media/:id', async (c) => {
    const pool = getDatabasePool(config);
    const client = await pool.connect();

    try {
      const context = await resolveRequestContext(client, config);
      const result = await getMediaAsset(client, {
        organizationId: context.organization.id,
        mediaAssetId: c.req.param('id'),
      });

      return c.json({ data: result }, 200);
    } finally {
      client.release();
    }
  });
}
