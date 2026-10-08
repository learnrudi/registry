import {
  claimPublishJobById,
  claimNextPublishJob,
  insertPublishAttempt,
  claimPostTarget,
  updatePostStatus,
  updatePostTargetStatus,
  updatePublishJobStatus,
} from '../db/repositories/posts.js';
import {
  deriveAndPersistPostStatus,
  markAttemptFailed,
  markAttemptSucceeded,
} from './posts.js';
import {
  POST_STATUSES,
  PUBLISH_JOB_STATUSES,
  TARGET_STATUSES,
} from './states.js';

export async function claimQueuedPublishJob(client, input) {
  if (input.publishJobId) {
    return claimPublishJobById(client, {
      publishJobId: input.publishJobId,
      workerId: input.workerId,
    });
  }

  return claimNextPublishJob(client, {
    workerId: input.workerId,
  });
}

export async function markPostPublishing(client, input) {
  return updatePostStatus(client, {
    organizationId: input.organizationId,
    postId: input.postId,
    status: POST_STATUSES.PUBLISHING,
  });
}

export async function beginTargetPublishAttempt(client, input) {
  if (input.dryRun === true || input.job.metadata?.dry_run === true) {
    throw new Error('Dry runs cannot create publication attempts');
  }
  const claimedTarget = await claimPostTarget(client, {
    organizationId: input.job.organization_id,
    postId: input.job.post_id,
    postTargetId: input.target.id,
    publishJobId: input.job.id,
  });
  if (!claimedTarget) return null;

  return insertPublishAttempt(client, {
    organizationId: input.job.organization_id,
    publishJobId: input.job.id,
    postTargetId: input.target.id,
    platform: input.target.platform,
    requestId: input.requestId,
    platformResponse: {
      dry_run: input.dryRun === true,
    },
  });
}

export async function markTargetPublishSucceeded(client, input) {
  if (input.dryRun === true || input.job.metadata?.dry_run === true) {
    throw new Error('Dry runs cannot record publication success');
  }
  await markAttemptSucceeded(client, {
    organizationId: input.job.organization_id,
    publishAttemptId: input.attempt.id,
    platformResponse: input.result.platformResponse,
  });

  await updatePostTargetStatus(client, {
    organizationId: input.job.organization_id,
    postTargetId: input.target.id,
    status: TARGET_STATUSES.PUBLISHED,
    platformPostId: input.result.platformPostId,
    permalinkUrl: input.result.permalinkUrl,
    metadata: {
      publish_job_id: input.job.id,
      dry_run: input.dryRun === true,
    },
  });
}

export async function markTargetPublishFailed(client, input) {
  if (input.attemptId) {
    await markAttemptFailed(client, {
      organizationId: input.job.organization_id,
      publishAttemptId: input.attemptId,
      retryable: input.failure.retryable,
      errorCode: input.failure.code,
      errorMessage: input.failure.message,
      platformResponse: {
        error: {
          code: input.failure.code,
          retryable: input.failure.retryable,
          details: input.failure.details,
        },
      },
    });
  }

  await updatePostTargetStatus(client, {
    organizationId: input.job.organization_id,
    postTargetId: input.target.id,
    status: TARGET_STATUSES.FAILED,
    lastErrorCode: input.failure.code,
    lastErrorMessage: input.failure.message,
    metadata: {
      publish_job_id: input.job.id,
      retryable: input.failure.retryable,
    },
  });
}

export async function finalizePublishJob(client, input) {
  const postStatus = await deriveAndPersistPostStatus(client, {
    organizationId: input.job.organization_id,
    postId: input.job.post_id,
  });
  const jobStatus = [
    POST_STATUSES.PUBLISHED,
    POST_STATUSES.PARTIAL,
  ].includes(postStatus)
    ? PUBLISH_JOB_STATUSES.COMPLETED
    : PUBLISH_JOB_STATUSES.FAILED;

  await updatePublishJobStatus(client, {
    organizationId: input.job.organization_id,
    publishJobId: input.job.id,
    status: jobStatus,
    metadata: {
      final_post_status: postStatus,
    },
  });

  return { postStatus, jobStatus };
}

export async function markPublishJobFailed(client, input) {
  await updatePublishJobStatus(client, {
    organizationId: input.job.organization_id,
    publishJobId: input.job.id,
    status: PUBLISH_JOB_STATUSES.FAILED,
    lastErrorCode: input.failure.code,
    lastErrorMessage: input.failure.message,
    metadata: {
      error: {
        code: input.failure.code,
        retryable: input.failure.retryable,
      },
    },
  });

  if (input.job.metadata?.dry_run !== true) {
    await deriveAndPersistPostStatus(client, {
      organizationId: input.job.organization_id,
      postId: input.job.post_id,
    });
  }
}

export async function completePublishPreview(client, { job, results }) {
  const failed = results.some((result) => !result.ok);
  const status = failed ? PUBLISH_JOB_STATUSES.FAILED : PUBLISH_JOB_STATUSES.COMPLETED;
  await updatePublishJobStatus(client, {
    organizationId: job.organization_id,
    publishJobId: job.id,
    status,
    metadata: { preview_results: results },
  });
  return { jobStatus: status, dryRun: true, results };
}
