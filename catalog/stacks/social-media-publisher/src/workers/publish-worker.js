import { getPlatformAdapter, PlatformAdapterError } from '../adapters/index.js';
import { getDatabasePool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import { getPostAggregate } from '../domain/posts.js';
import {
  beginTargetPublishAttempt,
  claimQueuedPublishJob,
  finalizePublishJob,
  markPostPublishing,
  markPublishJobFailed,
  markTargetPublishFailed,
  markTargetPublishSucceeded,
} from '../domain/publish-jobs.js';
import { getDecryptedTokenForPlatformAsset } from '../domain/social-tokens.js';
import { PUBLISH_JOB_STATUSES, TARGET_STATUSES } from '../domain/states.js';

function logInfo(event, fields = {}) {
  console.log(JSON.stringify({
    level: 'info',
    event,
    ...fields,
  }));
}

function logError(event, fields = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    ...fields,
  }));
}

async function withClient(pool, callback) {
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function serializeError(error) {
  if (error instanceof PlatformAdapterError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
    };
  }

  return {
    code: error.code ?? 'publish_target_failed',
    message: error.message ?? 'Publish target failed',
    retryable: false,
  };
}

async function loadAggregate(pool, job) {
  return withClient(pool, async (client) => getPostAggregate(client, {
    organizationId: job.organization_id,
    postId: job.post_id,
  }));
}

async function loadToken(pool, config, target, adapter) {
  return withClient(pool, async (client) => {
    const tokenRecord = await getDecryptedTokenForPlatformAsset(client, {
      config,
      organizationId: target.organization_id,
      platform: target.platform,
      platformAssetId: target.platform_asset_id,
      tokenType: adapter.tokenType,
    });

    return tokenRecord.token;
  });
}

function getDryRunResult(target) {
  return {
    platformPostId: `dry_run:${target.id}`,
    permalinkUrl: null,
    platformResponse: {
      dry_run: true,
      target_id: target.id,
    },
  };
}

function assertTargetStillPublishable(target) {
  if (!target.asset_active) {
    throw new PlatformAdapterError(
      'asset_inactive',
      'Target asset is inactive',
      { retryable: false },
    );
  }

  if (target.asset_status !== 'healthy') {
    throw new PlatformAdapterError(
      'asset_not_healthy',
      `Target asset status is ${target.asset_status}`,
      { retryable: false },
    );
  }
}

async function publishTarget(pool, config, job, aggregate, target) {
  const dryRun = job.metadata?.dry_run === true;
  const requestId = job.metadata?.request_id ?? null;
  const media = aggregate.media ?? [];
  const attempt = await withTransaction(pool, async (client) => {
    return beginTargetPublishAttempt(client, {
      job,
      target,
      requestId,
      dryRun,
    });
  });

  if (!attempt) {
    return { skipped: true };
  }

  let result;
  try {
    assertTargetStillPublishable(target);

    const adapter = getPlatformAdapter(target.platform);
    const validation = adapter.validatePost({
      post: aggregate.post,
      target,
      media,
    });

    if (!validation.ok) {
      throw new PlatformAdapterError(
        validation.errors[0].code,
        validation.errors[0].message,
        { retryable: false, details: { validation_errors: validation.errors } },
      );
    }

    if (dryRun) {
      result = getDryRunResult(target);
    } else {
      const token = await loadToken(pool, config, target, adapter);
      await adapter.checkAuth({ target, token });
      result = await adapter.publish({
        post: aggregate.post,
        target,
        media,
        token,
        idempotencyKey: `${job.id}:${target.id}`,
      });
    }
  } catch (error) {
    const failure = await markTargetFailed(pool, job, target, attempt.id, error);
    error.publishFailure = failure;
    throw error;
  }

  await withTransaction(pool, async (client) => {
    await markTargetPublishSucceeded(client, {
      job,
      target,
      attempt,
      result,
      dryRun,
    });
  });

  return { skipped: false, result };
}

async function markTargetFailed(pool, job, target, attemptId, error) {
  const failure = serializeError(error);

  await withTransaction(pool, async (client) => {
    await markTargetPublishFailed(client, {
      job,
      target,
      attemptId,
      failure,
    });
  });

  return failure;
}

async function finalizeJob(pool, job) {
  return withTransaction(pool, async (client) => {
    return finalizePublishJob(client, { job });
  });
}

async function failJob(pool, job, error) {
  const failure = serializeError(error);

  await withTransaction(pool, async (client) => {
    await markPublishJobFailed(client, {
      job,
      failure,
    });
  });

  return failure;
}

export async function runPublishWorkerOnce(config, options = {}) {
  const pool = getDatabasePool(config);
  const workerId = options.workerId ?? `publish-worker:${process.pid}`;
  const job = await withTransaction(pool, async (client) => claimQueuedPublishJob(client, {
    workerId,
    publishJobId: options.publishJobId,
  }));

  if (!job) {
    return { claimed: false };
  }

  logInfo('publish_job_claimed', {
    publish_job_id: job.id,
    post_id: job.post_id,
    organization_id: job.organization_id,
    worker_id: workerId,
  });

  try {
    await withTransaction(pool, async (client) => {
      await markPostPublishing(client, {
        organizationId: job.organization_id,
        postId: job.post_id,
      });
    });

    const aggregate = await loadAggregate(pool, job);
    const queuedTargets = aggregate.targets.filter((target) => target.status === TARGET_STATUSES.QUEUED);
    const failures = [];

    for (const target of queuedTargets) {
      try {
        const result = await publishTarget(pool, config, job, aggregate, target);
        if (!result.skipped) {
          logInfo('publish_target_succeeded', {
            publish_job_id: job.id,
            post_target_id: target.id,
            platform: target.platform,
          });
        }
      } catch (error) {
        const failure = error.publishFailure ?? await markTargetFailed(pool, job, target, null, error);
        failures.push({ target_id: target.id, ...failure });
        logError('publish_target_failed', {
          publish_job_id: job.id,
          post_target_id: target.id,
          platform: target.platform,
          code: failure.code,
          retryable: failure.retryable,
        });
      }
    }

    const finalState = await finalizeJob(pool, job);
    logInfo('publish_job_finalized', {
      publish_job_id: job.id,
      post_id: job.post_id,
      job_status: finalState.jobStatus,
      post_status: finalState.postStatus,
      failure_count: failures.length,
    });

    return {
      claimed: true,
      job,
      ...finalState,
      failures,
    };
  } catch (error) {
    const failure = await failJob(pool, job, error);
    logError('publish_job_failed', {
      publish_job_id: job.id,
      post_id: job.post_id,
      code: failure.code,
      retryable: failure.retryable,
    });

    return {
      claimed: true,
      job,
      jobStatus: PUBLISH_JOB_STATUSES.FAILED,
      failure,
    };
  }
}
