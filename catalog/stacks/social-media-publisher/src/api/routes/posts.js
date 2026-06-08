import { getDatabasePool } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import { resolveBootstrapOrganization, resolveBootstrapUser } from '../../domain/assets.js';
import { badRequest } from '../../domain/errors.js';
import {
  attachTargets,
  createDraft,
  enqueuePublish,
  getPostAggregate,
  getPublishJob,
} from '../../domain/posts.js';

async function readJsonObject(c) {
  let body;
  const contentLength = c.req.header('content-length');
  const hasBody = contentLength === undefined || Number.parseInt(contentLength, 10) > 0;

  try {
    body = await c.req.json();
  } catch {
    if (hasBody) {
      throw badRequest('invalid_json_body', 'Request body must be valid JSON');
    }

    body = {};
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('invalid_json_body', 'Request body must be a JSON object');
  }

  return body;
}

async function resolveRequestContext(client, config) {
  const organization = await resolveBootstrapOrganization(client, config);
  const user = await resolveBootstrapUser(client, config, organization.id);

  return {
    organization,
    actorUserId: user?.id ?? null,
  };
}

function mapDraftInput(body) {
  return {
    title: body.title,
    body: body.body,
    scheduledAt: body.scheduled_at,
    metadata: body.metadata,
    targetAssetIds: body.target_asset_ids,
    mediaAssetIds: body.media_asset_ids,
  };
}

function mapTargetInput(body) {
  return {
    socialAssetIds: body.social_asset_ids,
    scheduledAt: body.scheduled_at,
    idempotencyKey: body.idempotency_key,
  };
}

function mapPublishInput(body, c) {
  return {
    idempotencyKey: c.req.header('idempotency-key') ?? body.idempotency_key,
    runAfter: body.run_after,
    dryRun: body.dry_run === true,
  };
}

export function registerPostRoutes(app, config) {
  app.post('/v1/posts', async (c) => {
    const body = await readJsonObject(c);
    const pool = getDatabasePool(config);
    const result = await withTransaction(pool, async (client) => {
      const context = await resolveRequestContext(client, config);

      return createDraft(client, {
        organizationId: context.organization.id,
        actorUserId: context.actorUserId,
        requestId: c.get('requestId'),
        ...mapDraftInput(body),
      });
    });

    c.header('location', `/v1/posts/${result.post.id}`);
    return c.json({ data: result }, 201);
  });

  app.get('/v1/posts/:id', async (c) => {
    const pool = getDatabasePool(config);
    const client = await pool.connect();

    try {
      const context = await resolveRequestContext(client, config);
      const result = await getPostAggregate(client, {
        organizationId: context.organization.id,
        postId: c.req.param('id'),
      });

      return c.json({ data: result }, 200);
    } finally {
      client.release();
    }
  });

  app.post('/v1/posts/:id/targets', async (c) => {
    const body = await readJsonObject(c);
    const pool = getDatabasePool(config);
    const result = await withTransaction(pool, async (client) => {
      const context = await resolveRequestContext(client, config);
      const targets = await attachTargets(client, {
        organizationId: context.organization.id,
        postId: c.req.param('id'),
        actorUserId: context.actorUserId,
        requestId: c.get('requestId'),
        ...mapTargetInput(body),
      });

      return getPostAggregate(client, {
        organizationId: context.organization.id,
        postId: c.req.param('id'),
      }).then((aggregate) => ({ targets, aggregate }));
    });

    return c.json({ data: result }, 200);
  });

  app.post('/v1/posts/:id/publish', async (c) => {
    const body = await readJsonObject(c);
    const pool = getDatabasePool(config);
    const result = await withTransaction(pool, async (client) => {
      const context = await resolveRequestContext(client, config);

      return enqueuePublish(client, {
        organizationId: context.organization.id,
        postId: c.req.param('id'),
        actorUserId: context.actorUserId,
        requestId: c.get('requestId'),
        ...mapPublishInput(body, c),
      });
    });

    c.header('location', `/v1/publish-jobs/${result.job.id}`);
    return c.json({ data: result }, 202);
  });

  app.get('/v1/publish-jobs/:id', async (c) => {
    const pool = getDatabasePool(config);
    const client = await pool.connect();

    try {
      const context = await resolveRequestContext(client, config);
      const result = await getPublishJob(client, {
        organizationId: context.organization.id,
        publishJobId: c.req.param('id'),
      });

      return c.json({ data: result }, 200);
    } finally {
      client.release();
    }
  });
}
