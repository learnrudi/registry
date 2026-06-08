#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { getConfig } from '../src/config/env.js';
import { closePool, getDatabasePool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import { resolveBootstrapOrganization, resolveBootstrapUser } from '../src/domain/assets.js';
import { registerExternalMedia } from '../src/domain/media.js';
import { createDraft, enqueuePublish, getPublishJob } from '../src/domain/posts.js';
import { runPublishWorkerOnce } from '../src/workers/publish-worker.js';

function getOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function getOptions(argv, name) {
  const values = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) {
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${name} requires a value`);
    }

    values.push(value);
    index += 1;
  }

  return values;
}

function getMediaItems(argv) {
  const mediaUrls = getOptions(argv, '--media-url');
  const mediaKinds = getOptions(argv, '--media-kind');
  const mimeTypes = getOptions(argv, '--mime-type');

  if (mediaUrls.length === 0) {
    if (mediaKinds.length > 0 || mimeTypes.length > 0) {
      throw new Error('--media-kind and --mime-type require --media-url');
    }

    return [];
  }

  if (mediaKinds.length !== mediaUrls.length || mimeTypes.length !== mediaUrls.length) {
    throw new Error('Each --media-url must have a matching --media-kind and --mime-type');
  }

  return mediaUrls.map((sourceUrl, index) => ({
    sourceUrl,
    mediaKind: mediaKinds[index],
    mimeType: mimeTypes[index],
  }));
}

function parseArgs(argv) {
  const live = argv.includes('--live');
  const cleanupDb = argv.includes('--cleanup-db');
  const explicitBody = getOption(argv, '--body');
  const title = getOption(argv, '--title');
  const metadataJson = getOption(argv, '--metadata-json');
  let metadata = {
    smoke_test: true,
  };

  if (metadataJson) {
    try {
      metadata = {
        ...metadata,
        ...JSON.parse(metadataJson),
      };
    } catch (error) {
      throw new Error(`--metadata-json must be valid JSON: ${error.message}`);
    }
  }

  return {
    live,
    keep: argv.includes('--keep') || (live && !cleanupDb),
    platform: getOption(argv, '--platform') ?? 'facebook',
    assetId: getOption(argv, '--asset-id'),
    title,
    body: explicitBody ?? `RUDI unified publisher ${live ? 'live' : 'dry-run'} smoke ${new Date().toISOString()}`,
    mediaItems: getMediaItems(argv),
    metadata,
  };
}

async function findSmokeAsset(client, input) {
  if (input.assetId) {
    const result = await client.query(
      `
        select id, platform, name
        from social_assets
        where organization_id = $1
          and id = $2
      `,
      [input.organizationId, input.assetId],
    );

    return result.rows[0] ?? null;
  }

  const result = await client.query(
    `
      select id, platform, name
      from social_assets
      where organization_id = $1
        and platform = $2
        and active = true
        and status = 'healthy'
      order by lower(name) asc
      limit 1
    `,
    [input.organizationId, input.platform],
  );

  return result.rows[0] ?? null;
}

async function cleanupSmokeData(pool, input) {
  await withTransaction(pool, async (client) => {
    if (input.postId) {
      await client.query(
        'delete from posts where organization_id = $1 and id = $2',
        [input.organizationId, input.postId],
      );
    }

    if (input.mediaAssetIds.length > 0) {
      await client.query(
        'delete from media_assets where organization_id = $1 and id = any($2::uuid[])',
        [input.organizationId, input.mediaAssetIds],
      );
    }

    await client.query(
      'delete from audit_events where organization_id = $1 and request_id = $2',
      [input.organizationId, input.requestId],
    );
  });
}

async function createSmokeJob(pool, config, args, requestId) {
  return withTransaction(pool, async (client) => {
    const organization = await resolveBootstrapOrganization(client, config);
    const user = await resolveBootstrapUser(client, config, organization.id);
    const asset = await findSmokeAsset(client, {
      organizationId: organization.id,
      assetId: args.assetId,
      platform: args.platform,
    });

    if (!asset) {
      throw new Error(`No active healthy ${args.platform} asset found for smoke test`);
    }

    const mediaAssetIds = [];
    for (const mediaItem of args.mediaItems) {
      const media = await registerExternalMedia(client, {
        organizationId: organization.id,
        actorUserId: user?.id ?? null,
        requestId,
        sourceType: 'external_url',
        sourceUrl: mediaItem.sourceUrl,
        mediaKind: mediaItem.mediaKind,
        mimeType: mediaItem.mimeType,
        metadata: {
          smoke_test: true,
        },
      });
      mediaAssetIds.push(media.id);
    }

    const draft = await createDraft(client, {
      organizationId: organization.id,
      actorUserId: user?.id ?? null,
      requestId,
      title: args.title,
      body: args.body,
      targetAssetIds: [asset.id],
      mediaAssetIds,
      metadata: args.metadata,
    });

    const publish = await enqueuePublish(client, {
      organizationId: organization.id,
      postId: draft.post.id,
      actorUserId: user?.id ?? null,
      requestId,
      idempotencyKey: `${requestId}:publish`,
      dryRun: !args.live,
    });

    return {
      organizationId: organization.id,
      postId: draft.post.id,
      publishJobId: publish.job.id,
      mediaAssetIds,
      asset,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestId = `smoke-unified-publish:${Date.now()}:${randomUUID()}`;
  const config = getConfig();
  const pool = getDatabasePool(config);
  let smoke;

  try {
    smoke = await createSmokeJob(pool, config, args, requestId);
    const worker = await runPublishWorkerOnce(config, {
      publishJobId: smoke.publishJobId,
      workerId: `smoke:${process.pid}`,
    });

    const final = await withTransaction(pool, async (client) => getPublishJob(client, {
      organizationId: smoke.organizationId,
      publishJobId: smoke.publishJobId,
    }));

    console.log(JSON.stringify({
      request_id: requestId,
      live: args.live,
      dry_run: !args.live,
      kept: args.keep,
      asset: {
        id: smoke.asset.id,
        platform: smoke.asset.platform,
        name: smoke.asset.name,
      },
      post_id: smoke.postId,
      publish_job_id: smoke.publishJobId,
      worker_claimed: worker.claimed,
      job_status: final.job.status,
      post_status: final.aggregate.post.status,
      target_statuses: final.aggregate.targets.map((target) => ({
        id: target.id,
        platform: target.platform,
        status: target.status,
        error_code: target.last_error_code,
        platform_post_id: target.platform_post_id,
        permalink_url: target.permalink_url,
      })),
      attempt_statuses: final.aggregate.attempts.map((attempt) => ({
        id: attempt.id,
        platform: attempt.platform,
        status: attempt.status,
        error_code: attempt.error_code,
      })),
    }, null, 2));
  } finally {
    if (smoke && !args.keep) {
      await cleanupSmokeData(pool, {
        organizationId: smoke.organizationId,
        postId: smoke.postId,
        mediaAssetIds: smoke.mediaAssetIds,
        requestId,
      });
    }

    await closePool();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'unified_publish_smoke_failed',
    code: error.code ?? 'unified_publish_smoke_failed',
    message: error.message,
  }));
  process.exit(1);
});
