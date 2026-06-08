import assert from 'node:assert/strict';
import test from 'node:test';

import {
  derivePostStatusFromTargetStatuses,
  POST_STATUSES,
  TARGET_STATUSES,
} from '../../src/domain/states.js';

test('derivePostStatusFromTargetStatuses keeps empty posts as draft', () => {
  assert.equal(derivePostStatusFromTargetStatuses([]), POST_STATUSES.DRAFT);
});

test('derivePostStatusFromTargetStatuses marks all successful targets published', () => {
  assert.equal(
    derivePostStatusFromTargetStatuses([
      TARGET_STATUSES.PUBLISHED,
      TARGET_STATUSES.PUBLISHED,
    ]),
    POST_STATUSES.PUBLISHED,
  );
});

test('derivePostStatusFromTargetStatuses marks mixed terminal results partial', () => {
  assert.equal(
    derivePostStatusFromTargetStatuses([
      TARGET_STATUSES.PUBLISHED,
      TARGET_STATUSES.FAILED,
    ]),
    POST_STATUSES.PARTIAL,
  );
});

test('derivePostStatusFromTargetStatuses keeps in-flight published posts publishing', () => {
  assert.equal(
    derivePostStatusFromTargetStatuses([
      TARGET_STATUSES.PUBLISHED,
      TARGET_STATUSES.QUEUED,
    ]),
    POST_STATUSES.PUBLISHING,
  );
});

test('derivePostStatusFromTargetStatuses marks all failed targets failed', () => {
  assert.equal(
    derivePostStatusFromTargetStatuses([
      TARGET_STATUSES.FAILED,
      TARGET_STATUSES.FAILED,
    ]),
    POST_STATUSES.FAILED,
  );
});
