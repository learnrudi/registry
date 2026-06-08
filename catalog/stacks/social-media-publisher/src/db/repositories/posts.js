export async function createPostRecord(client, input) {
  const result = await client.query(
    `
      insert into posts (
        organization_id,
        created_by_user_id,
        title,
        body,
        scheduled_at,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6)
      returning
        id,
        organization_id,
        created_by_user_id,
        title,
        body,
        status,
        scheduled_at,
        published_at,
        metadata,
        created_at,
        updated_at
    `,
    [
      input.organizationId,
      input.createdByUserId ?? null,
      input.title ?? null,
      input.body ?? '',
      input.scheduledAt ?? null,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function findPostById(client, input) {
  const result = await client.query(
    `
      select
        id,
        organization_id,
        created_by_user_id,
        title,
        body,
        status,
        scheduled_at,
        published_at,
        metadata,
        created_at,
        updated_at
      from posts
      where organization_id = $1
        and id = $2
    `,
    [input.organizationId, input.postId],
  );

  return result.rows[0] ?? null;
}

export async function updatePostStatus(client, input) {
  const result = await client.query(
    `
      update posts
      set
        status = $3,
        published_at = case
          when $3 = 'published' then coalesce(published_at, now())
          else published_at
        end,
        updated_at = now()
      where organization_id = $1
        and id = $2
      returning
        id,
        organization_id,
        status,
        published_at,
        updated_at
    `,
    [input.organizationId, input.postId, input.status],
  );

  return result.rows[0] ?? null;
}

export async function listPostTargets(client, input) {
  const result = await client.query(
    `
      select
        pt.id,
        pt.organization_id,
        pt.post_id,
        pt.social_asset_id,
        pt.platform,
        pt.status,
        pt.scheduled_at,
        pt.validation_errors,
        pt.platform_post_id,
        pt.permalink_url,
        pt.idempotency_key,
        pt.last_error_code,
        pt.last_error_message,
        pt.metadata,
        pt.created_at,
        pt.updated_at,
        sa.asset_type,
        sa.platform_asset_id,
        sa.name as asset_name,
        sa.handle as asset_handle,
        sa.active as asset_active,
        sa.status as asset_status
      from post_targets pt
      join social_assets sa
        on sa.id = pt.social_asset_id
       and sa.organization_id = pt.organization_id
      where pt.organization_id = $1
        and pt.post_id = $2
      order by pt.created_at asc
    `,
    [input.organizationId, input.postId],
  );

  return result.rows;
}

export async function listPostMedia(client, input) {
  const result = await client.query(
    `
      select
        pm.id,
        pm.organization_id,
        pm.post_id,
        pm.media_asset_id,
        pm.sort_order,
        pm.metadata,
        pm.created_at,
        ma.source_type,
        ma.source_url,
        ma.cloudinary_public_id,
        ma.storage_key,
        ma.media_kind,
        ma.mime_type,
        ma.bytes,
        ma.width,
        ma.height,
        ma.duration_seconds,
        ma.status as media_status
      from post_media pm
      join media_assets ma
        on ma.id = pm.media_asset_id
       and ma.organization_id = pm.organization_id
      where pm.organization_id = $1
        and pm.post_id = $2
      order by pm.sort_order asc, pm.created_at asc
    `,
    [input.organizationId, input.postId],
  );

  return result.rows;
}

export async function listPublishAttemptsForPost(client, input) {
  const result = await client.query(
    `
      select
        pa.id,
        pa.organization_id,
        pa.publish_job_id,
        pa.post_target_id,
        pa.attempt_number,
        pa.status,
        pa.platform,
        pa.request_id,
        pa.started_at,
        pa.completed_at,
        pa.retryable,
        pa.error_code,
        pa.error_message,
        pa.platform_response,
        pa.created_at
      from publish_attempts pa
      join post_targets pt
        on pt.id = pa.post_target_id
       and pt.organization_id = pa.organization_id
      where pa.organization_id = $1
        and pt.post_id = $2
      order by pa.created_at desc
    `,
    [input.organizationId, input.postId],
  );

  return result.rows;
}

export async function listSocialAssetsForPublish(client, input) {
  const result = await client.query(
    `
      select
        sa.id,
        sa.organization_id,
        sa.connection_id,
        sa.platform,
        sa.asset_type,
        sa.platform_asset_id,
        sa.name,
        sa.handle,
        sa.active,
        sa.status,
        sa.capabilities,
        sa.metadata,
        sc.status as connection_status,
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
      where sa.organization_id = $1
        and sa.id = any($2::uuid[])
    `,
    [input.organizationId, input.socialAssetIds],
  );

  return result.rows;
}

export async function listMediaAssetsForPostAttach(client, input) {
  const result = await client.query(
    `
      select
        id,
        organization_id,
        source_type,
        source_url,
        cloudinary_public_id,
        media_kind,
        mime_type,
        bytes,
        width,
        height,
        duration_seconds,
        status
      from media_assets
      where organization_id = $1
        and id = any($2::uuid[])
    `,
    [input.organizationId, input.mediaAssetIds],
  );

  return result.rows;
}

export async function upsertPostTarget(client, input) {
  const result = await client.query(
    `
      insert into post_targets (
        organization_id,
        post_id,
        social_asset_id,
        platform,
        status,
        scheduled_at,
        validation_errors,
        idempotency_key,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (post_id, social_asset_id)
      do update set
        status = case
          when post_targets.status in ('pending', 'valid', 'failed')
            then excluded.status
          else post_targets.status
        end,
        scheduled_at = coalesce(excluded.scheduled_at, post_targets.scheduled_at),
        validation_errors = excluded.validation_errors,
        idempotency_key = coalesce(post_targets.idempotency_key, excluded.idempotency_key),
        metadata = post_targets.metadata || excluded.metadata,
        updated_at = now()
      returning
        id,
        organization_id,
        post_id,
        social_asset_id,
        platform,
        status,
        scheduled_at,
        validation_errors,
        platform_post_id,
        permalink_url,
        idempotency_key,
        last_error_code,
        last_error_message,
        metadata,
        created_at,
        updated_at
    `,
    [
      input.organizationId,
      input.postId,
      input.socialAssetId,
      input.platform,
      input.status,
      input.scheduledAt ?? null,
      JSON.stringify(input.validationErrors ?? []),
      input.idempotencyKey ?? null,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function upsertPostMedia(client, input) {
  const result = await client.query(
    `
      insert into post_media (
        organization_id,
        post_id,
        media_asset_id,
        sort_order,
        metadata
      )
      values ($1, $2, $3, $4, $5)
      on conflict (post_id, media_asset_id)
      do update set
        sort_order = excluded.sort_order,
        metadata = post_media.metadata || excluded.metadata
      returning
        id,
        organization_id,
        post_id,
        media_asset_id,
        sort_order,
        metadata,
        created_at
    `,
    [
      input.organizationId,
      input.postId,
      input.mediaAssetId,
      input.sortOrder,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function queuePostTargets(client, input) {
  const result = await client.query(
    `
      update post_targets
      set
        status = 'queued',
        updated_at = now()
      where organization_id = $1
        and post_id = $2
        and status in ('valid', 'retry_wait')
      returning
        id,
        organization_id,
        post_id,
        social_asset_id,
        platform,
        status
    `,
    [input.organizationId, input.postId],
  );

  return result.rows;
}

export async function insertPublishJob(client, input) {
  const result = await client.query(
    `
      insert into publish_jobs (
        organization_id,
        post_id,
        requested_by_user_id,
        idempotency_key,
        priority,
        run_after,
        max_attempts,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (organization_id, idempotency_key)
      do update set
        updated_at = publish_jobs.updated_at
      returning
        id,
        organization_id,
        post_id,
        requested_by_user_id,
        status,
        idempotency_key,
        priority,
        run_after,
        started_at,
        completed_at,
        locked_by,
        locked_at,
        attempt_count,
        max_attempts,
        last_error_code,
        last_error_message,
        metadata,
        created_at,
        updated_at
    `,
    [
      input.organizationId,
      input.postId,
      input.requestedByUserId ?? null,
      input.idempotencyKey,
      input.priority ?? 100,
      input.runAfter ?? new Date(),
      input.maxAttempts ?? 3,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function findPublishJobById(client, input) {
  const result = await client.query(
    `
      select
        id,
        organization_id,
        post_id,
        requested_by_user_id,
        status,
        idempotency_key,
        priority,
        run_after,
        started_at,
        completed_at,
        locked_by,
        locked_at,
        attempt_count,
        max_attempts,
        last_error_code,
        last_error_message,
        metadata,
        created_at,
        updated_at
      from publish_jobs
      where organization_id = $1
        and id = $2
    `,
    [input.organizationId, input.publishJobId],
  );

  return result.rows[0] ?? null;
}

export async function claimNextPublishJob(client, input) {
  const result = await client.query(
    `
      with next_job as (
        select id
        from publish_jobs
        where status = 'queued'
          and run_after <= now()
        order by priority asc, created_at asc
        for update skip locked
        limit 1
      )
      update publish_jobs pj
      set
        status = 'running',
        started_at = coalesce(pj.started_at, now()),
        locked_by = $1,
        locked_at = now(),
        attempt_count = pj.attempt_count + 1,
        updated_at = now()
      from next_job
      where pj.id = next_job.id
      returning
        pj.id,
        pj.organization_id,
        pj.post_id,
        pj.requested_by_user_id,
        pj.status,
        pj.idempotency_key,
        pj.priority,
        pj.run_after,
        pj.started_at,
        pj.completed_at,
        pj.locked_by,
        pj.locked_at,
        pj.attempt_count,
        pj.max_attempts,
        pj.last_error_code,
        pj.last_error_message,
        pj.metadata,
        pj.created_at,
        pj.updated_at
    `,
    [input.workerId],
  );

  return result.rows[0] ?? null;
}

export async function claimPublishJobById(client, input) {
  const result = await client.query(
    `
      update publish_jobs
      set
        status = 'running',
        started_at = coalesce(started_at, now()),
        locked_by = $2,
        locked_at = now(),
        attempt_count = attempt_count + 1,
        updated_at = now()
      where id = $1
        and status = 'queued'
        and run_after <= now()
      returning
        id,
        organization_id,
        post_id,
        requested_by_user_id,
        status,
        idempotency_key,
        priority,
        run_after,
        started_at,
        completed_at,
        locked_by,
        locked_at,
        attempt_count,
        max_attempts,
        last_error_code,
        last_error_message,
        metadata,
        created_at,
        updated_at
    `,
    [input.publishJobId, input.workerId],
  );

  return result.rows[0] ?? null;
}

export async function updatePublishJobStatus(client, input) {
  const result = await client.query(
    `
      update publish_jobs
      set
        status = $3,
        completed_at = case
          when $3 in ('completed', 'failed', 'canceled') then coalesce(completed_at, now())
          else completed_at
        end,
        last_error_code = $4,
        last_error_message = $5,
        metadata = metadata || $6,
        updated_at = now()
      where organization_id = $1
        and id = $2
      returning
        id,
        organization_id,
        post_id,
        status,
        completed_at,
        last_error_code,
        last_error_message,
        metadata,
        updated_at
    `,
    [
      input.organizationId,
      input.publishJobId,
      input.status,
      input.lastErrorCode ?? null,
      input.lastErrorMessage ?? null,
      input.metadata ?? {},
    ],
  );

  return result.rows[0] ?? null;
}

export async function updatePostTargetStatus(client, input) {
  const result = await client.query(
    `
      update post_targets
      set
        status = $3,
        platform_post_id = coalesce($4, platform_post_id),
        permalink_url = coalesce($5, permalink_url),
        last_error_code = $6,
        last_error_message = $7,
        metadata = metadata || $8,
        updated_at = now()
      where organization_id = $1
        and id = $2
      returning
        id,
        organization_id,
        post_id,
        social_asset_id,
        platform,
        status,
        platform_post_id,
        permalink_url,
        last_error_code,
        last_error_message,
        metadata,
        updated_at
    `,
    [
      input.organizationId,
      input.postTargetId,
      input.status,
      input.platformPostId ?? null,
      input.permalinkUrl ?? null,
      input.lastErrorCode ?? null,
      input.lastErrorMessage ?? null,
      input.metadata ?? {},
    ],
  );

  return result.rows[0] ?? null;
}

export async function insertPublishAttempt(client, input) {
  const result = await client.query(
    `
      with next_attempt as (
        select coalesce(max(attempt_number), 0) + 1 as attempt_number
        from publish_attempts
        where publish_job_id = $2
          and post_target_id = $3
      )
      insert into publish_attempts (
        organization_id,
        publish_job_id,
        post_target_id,
        attempt_number,
        status,
        platform,
        request_id,
        platform_response
      )
      select $1, $2, $3, next_attempt.attempt_number, 'running', $4, $5, $6
      from next_attempt
      returning
        id,
        organization_id,
        publish_job_id,
        post_target_id,
        attempt_number,
        status,
        platform,
        request_id,
        started_at,
        completed_at,
        retryable,
        error_code,
        error_message,
        platform_response,
        created_at
    `,
    [
      input.organizationId,
      input.publishJobId,
      input.postTargetId,
      input.platform,
      input.requestId ?? null,
      input.platformResponse ?? {},
    ],
  );

  return result.rows[0];
}

export async function completePublishAttempt(client, input) {
  const result = await client.query(
    `
      update publish_attempts
      set
        status = $3,
        completed_at = now(),
        retryable = $4,
        error_code = $5,
        error_message = $6,
        platform_response = platform_response || $7
      where organization_id = $1
        and id = $2
      returning
        id,
        organization_id,
        publish_job_id,
        post_target_id,
        attempt_number,
        status,
        platform,
        request_id,
        started_at,
        completed_at,
        retryable,
        error_code,
        error_message,
        platform_response,
        created_at
    `,
    [
      input.organizationId,
      input.publishAttemptId,
      input.status,
      input.retryable ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.platformResponse ?? {},
    ],
  );

  return result.rows[0] ?? null;
}
