export const CONNECTION_STATUSES = Object.freeze({
  HEALTHY: 'healthy',
  NEEDS_AUTH: 'needs_auth',
  REVOKED: 'revoked',
  ERROR: 'error',
});

export const POST_STATUSES = Object.freeze({
  DRAFT: 'draft',
  QUEUED: 'queued',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  PARTIAL: 'partial',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

export const TARGET_STATUSES = Object.freeze({
  PENDING: 'pending',
  VALID: 'valid',
  QUEUED: 'queued',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  RETRY_WAIT: 'retry_wait',
  SKIPPED: 'skipped',
  CANCELED: 'canceled',
});

export const PUBLISH_JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

export const POST_STATUS_TRANSITIONS = Object.freeze({
  [POST_STATUSES.DRAFT]: new Set([POST_STATUSES.QUEUED, POST_STATUSES.CANCELED]),
  [POST_STATUSES.QUEUED]: new Set([POST_STATUSES.PUBLISHING, POST_STATUSES.CANCELED]),
  [POST_STATUSES.PUBLISHING]: new Set([
    POST_STATUSES.PUBLISHED,
    POST_STATUSES.PARTIAL,
    POST_STATUSES.FAILED,
    POST_STATUSES.CANCELED,
  ]),
  [POST_STATUSES.PUBLISHED]: new Set([]),
  [POST_STATUSES.PARTIAL]: new Set([]),
  [POST_STATUSES.FAILED]: new Set([POST_STATUSES.QUEUED]),
  [POST_STATUSES.CANCELED]: new Set([]),
});

export const TARGET_STATUS_TRANSITIONS = Object.freeze({
  [TARGET_STATUSES.PENDING]: new Set([TARGET_STATUSES.VALID, TARGET_STATUSES.FAILED, TARGET_STATUSES.CANCELED]),
  [TARGET_STATUSES.VALID]: new Set([TARGET_STATUSES.QUEUED, TARGET_STATUSES.CANCELED]),
  [TARGET_STATUSES.QUEUED]: new Set([TARGET_STATUSES.PUBLISHING, TARGET_STATUSES.CANCELED]),
  [TARGET_STATUSES.PUBLISHING]: new Set([TARGET_STATUSES.PUBLISHED, TARGET_STATUSES.FAILED]),
  [TARGET_STATUSES.PUBLISHED]: new Set([]),
  [TARGET_STATUSES.FAILED]: new Set([TARGET_STATUSES.RETRY_WAIT, TARGET_STATUSES.CANCELED]),
  [TARGET_STATUSES.RETRY_WAIT]: new Set([TARGET_STATUSES.QUEUED, TARGET_STATUSES.CANCELED]),
  [TARGET_STATUSES.SKIPPED]: new Set([]),
  [TARGET_STATUSES.CANCELED]: new Set([]),
});

export const PUBLISH_JOB_STATUS_TRANSITIONS = Object.freeze({
  [PUBLISH_JOB_STATUSES.QUEUED]: new Set([
    PUBLISH_JOB_STATUSES.RUNNING,
    PUBLISH_JOB_STATUSES.CANCELED,
  ]),
  [PUBLISH_JOB_STATUSES.RUNNING]: new Set([
    PUBLISH_JOB_STATUSES.COMPLETED,
    PUBLISH_JOB_STATUSES.FAILED,
    PUBLISH_JOB_STATUSES.CANCELED,
  ]),
  [PUBLISH_JOB_STATUSES.COMPLETED]: new Set([]),
  [PUBLISH_JOB_STATUSES.FAILED]: new Set([PUBLISH_JOB_STATUSES.QUEUED]),
  [PUBLISH_JOB_STATUSES.CANCELED]: new Set([]),
});

export function assertTransition(machine, fromStatus, toStatus) {
  const allowedTargets = machine[fromStatus];

  if (!allowedTargets || !allowedTargets.has(toStatus)) {
    const error = new Error(`Illegal status transition from ${fromStatus} to ${toStatus}`);
    error.code = 'illegal_status_transition';
    error.status = 409;
    throw error;
  }
}

export function derivePostStatusFromTargetStatuses(targetStatuses, options = {}) {
  const statuses = targetStatuses
    .map((item) => (typeof item === 'string' ? item : item?.status))
    .filter(Boolean);

  if (statuses.length === 0) {
    return options.emptyStatus ?? POST_STATUSES.DRAFT;
  }

  if (statuses.every((status) => status === TARGET_STATUSES.CANCELED)) {
    return POST_STATUSES.CANCELED;
  }

  const hasPublished = statuses.includes(TARGET_STATUSES.PUBLISHED);
  const hasPublishing = statuses.includes(TARGET_STATUSES.PUBLISHING);
  const hasQueuedWork = statuses.some((status) => [
    TARGET_STATUSES.PENDING,
    TARGET_STATUSES.VALID,
    TARGET_STATUSES.QUEUED,
    TARGET_STATUSES.RETRY_WAIT,
  ].includes(status));

  if (hasPublishing || hasQueuedWork) {
    return hasPublished ? POST_STATUSES.PUBLISHING : POST_STATUSES.QUEUED;
  }

  const allSuccessful = statuses.every((status) => [
    TARGET_STATUSES.PUBLISHED,
    TARGET_STATUSES.SKIPPED,
  ].includes(status));
  if (allSuccessful && hasPublished) {
    return POST_STATUSES.PUBLISHED;
  }

  const allFailed = statuses.every((status) => [
    TARGET_STATUSES.FAILED,
    TARGET_STATUSES.CANCELED,
    TARGET_STATUSES.SKIPPED,
  ].includes(status));
  if (allFailed) {
    return POST_STATUSES.FAILED;
  }

  if (hasPublished) {
    return POST_STATUSES.PARTIAL;
  }

  return POST_STATUSES.FAILED;
}
