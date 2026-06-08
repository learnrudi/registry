-- Initial unified social publisher schema.
-- Rollback plan before production data exists: drop the created tables in reverse
-- dependency order and delete the matching schema_migrations row. After production
-- data exists, use additive expand-contract migrations instead of editing this file.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  external_auth_provider text not null default 'clerk',
  external_auth_subject text not null,
  name text not null,
  slug text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint organizations_external_identity_uniq unique (external_auth_provider, external_auth_subject),
  constraint organizations_id_org_uniq unique (id)
);

comment on table organizations is 'Customer tenant/workspace. Primary access pattern: look up by Clerk organization/user subject, then scope every app resource by organization_id.';

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_auth_provider text not null default 'clerk',
  external_auth_subject text not null,
  email text not null,
  display_name text,
  role text not null default 'member',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_role_chk check (role in ('owner', 'admin', 'member')),
  constraint users_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint users_external_identity_uniq unique (organization_id, external_auth_provider, external_auth_subject),
  constraint users_id_org_uniq unique (id, organization_id)
);

comment on table users is 'Human actors mirrored from Clerk into an organization. Primary access pattern: organization-scoped actor lookup and audit attribution.';

create unique index users_org_lower_email_idx on users (organization_id, lower(email));

create table social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform text not null,
  provider_account_id text,
  display_name text,
  status text not null default 'needs_auth',
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_connections_status_chk check (status in ('healthy', 'needs_auth', 'revoked', 'error')),
  constraint social_connections_platform_chk check (platform = lower(platform) and platform <> ''),
  constraint social_connections_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint social_connections_id_org_uniq unique (id, organization_id),
  constraint social_connections_created_by_fk foreign key (created_by_user_id, organization_id)
    references users(id, organization_id) on delete set null (created_by_user_id)
);

comment on table social_connections is 'OAuth/app connection to a social provider. Primary access pattern: organization + platform connection listing and token-health scans.';

create unique index social_connections_provider_account_idx
  on social_connections (organization_id, platform, provider_account_id)
  where provider_account_id is not null;

create index social_connections_org_status_idx on social_connections (organization_id, status);

create table social_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  platform text not null,
  asset_type text not null,
  platform_asset_id text not null,
  name text not null,
  handle text,
  active boolean not null default true,
  status text not null default 'healthy',
  capabilities text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_assets_connection_fk foreign key (connection_id, organization_id)
    references social_connections(id, organization_id) on delete cascade,
  constraint social_assets_platform_chk check (platform = lower(platform) and platform <> ''),
  constraint social_assets_type_chk check (asset_type in ('page', 'profile', 'channel', 'organization', 'subreddit', 'board')),
  constraint social_assets_status_chk check (status in ('healthy', 'needs_auth', 'revoked', 'error')),
  constraint social_assets_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint social_assets_platform_identity_uniq unique (organization_id, platform, platform_asset_id),
  constraint social_assets_id_org_uniq unique (id, organization_id)
);

comment on table social_assets is 'Publishable destinations such as Facebook Pages, Instagram accounts, LinkedIn organizations, and YouTube channels. Primary access pattern: organization-scoped account listing and active-target validation.';

create index social_assets_org_platform_active_idx on social_assets (organization_id, platform, active);
create index social_assets_connection_idx on social_assets (connection_id);

create table social_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  asset_id uuid,
  platform text not null,
  token_type text not null,
  encrypted_token text not null,
  encryption_key_version text not null default 'v1',
  scopes text[] not null default '{}',
  expires_at timestamptz,
  status text not null default 'active',
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_tokens_connection_fk foreign key (connection_id, organization_id)
    references social_connections(id, organization_id) on delete cascade,
  constraint social_tokens_asset_fk foreign key (asset_id, organization_id)
    references social_assets(id, organization_id) on delete cascade,
  constraint social_tokens_platform_chk check (platform = lower(platform) and platform <> ''),
  constraint social_tokens_type_chk check (token_type in ('user', 'page', 'refresh', 'app', 'system')),
  constraint social_tokens_status_chk check (status in ('active', 'expired', 'revoked', 'error')),
  constraint social_tokens_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint social_tokens_encrypted_token_chk check (encrypted_token <> ''),
  constraint social_tokens_id_org_uniq unique (id, organization_id)
);

comment on table social_tokens is 'Encrypted credentials for provider connections and assets. Token material must never be stored plaintext or returned through API/MCP boundaries.';

create unique index social_tokens_one_active_idx
  on social_tokens (connection_id, coalesce(asset_id, '00000000-0000-0000-0000-000000000000'::uuid), token_type)
  where status = 'active';
create index social_tokens_org_status_expiry_idx on social_tokens (organization_id, status, expires_at);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_type text not null,
  source_url text,
  cloudinary_public_id text,
  storage_key text,
  media_kind text not null,
  mime_type text not null,
  bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric(10, 3),
  sha256 text,
  status text not null default 'ready',
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_created_by_fk foreign key (created_by_user_id, organization_id)
    references users(id, organization_id) on delete set null (created_by_user_id),
  constraint media_assets_source_type_chk check (source_type in ('local_upload', 'cloudinary', 'external_url', 'r2', 's3')),
  constraint media_assets_kind_chk check (media_kind in ('image', 'video', 'other')),
  constraint media_assets_status_chk check (status in ('uploading', 'ready', 'failed', 'deleted')),
  constraint media_assets_source_url_https_chk check (source_url is null or source_url like 'https://%'),
  constraint media_assets_bytes_chk check (bytes is null or bytes > 0),
  constraint media_assets_width_chk check (width is null or width > 0),
  constraint media_assets_height_chk check (height is null or height > 0),
  constraint media_assets_duration_chk check (duration_seconds is null or duration_seconds >= 0),
  constraint media_assets_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint media_assets_id_org_uniq unique (id, organization_id)
);

comment on table media_assets is 'Prepared media used by posts. Primary access pattern: organization-scoped media lookup and post attachment validation.';

create index media_assets_org_created_idx on media_assets (organization_id, created_at desc);
create index media_assets_cloudinary_idx on media_assets (organization_id, cloudinary_public_id) where cloudinary_public_id is not null;

create table posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by_user_id uuid,
  title text,
  body text not null default '',
  status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_created_by_fk foreign key (created_by_user_id, organization_id)
    references users(id, organization_id) on delete set null (created_by_user_id),
  constraint posts_status_chk check (status in ('draft', 'queued', 'publishing', 'published', 'partial', 'failed', 'canceled')),
  constraint posts_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint posts_id_org_uniq unique (id, organization_id)
);

comment on table posts is 'Canonical user publishing intent. Post status must be derived from target statuses once publishing begins.';

create index posts_org_status_created_idx on posts (organization_id, status, created_at desc);
create index posts_org_scheduled_idx on posts (organization_id, scheduled_at) where scheduled_at is not null;

create table post_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  post_id uuid not null,
  social_asset_id uuid not null,
  platform text not null,
  status text not null default 'pending',
  scheduled_at timestamptz,
  validation_errors jsonb not null default '[]'::jsonb,
  platform_post_id text,
  permalink_url text,
  idempotency_key text,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_targets_post_fk foreign key (post_id, organization_id)
    references posts(id, organization_id) on delete cascade,
  constraint post_targets_asset_fk foreign key (social_asset_id, organization_id)
    references social_assets(id, organization_id) on delete restrict,
  constraint post_targets_platform_chk check (platform = lower(platform) and platform <> ''),
  constraint post_targets_status_chk check (status in ('pending', 'valid', 'queued', 'publishing', 'published', 'failed', 'retry_wait', 'skipped', 'canceled')),
  constraint post_targets_validation_errors_array_chk check (jsonb_typeof(validation_errors) = 'array'),
  constraint post_targets_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint post_targets_post_asset_uniq unique (post_id, social_asset_id),
  constraint post_targets_id_org_uniq unique (id, organization_id)
);

comment on table post_targets is 'One destination for a post. Target status records platform-level publishing state and drives derived post status.';

create unique index post_targets_idempotency_idx
  on post_targets (organization_id, idempotency_key)
  where idempotency_key is not null;
create index post_targets_post_status_idx on post_targets (post_id, status);
create index post_targets_org_status_idx on post_targets (organization_id, status, updated_at desc);

create table post_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  post_id uuid not null,
  media_asset_id uuid not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint post_media_post_fk foreign key (post_id, organization_id)
    references posts(id, organization_id) on delete cascade,
  constraint post_media_media_fk foreign key (media_asset_id, organization_id)
    references media_assets(id, organization_id) on delete restrict,
  constraint post_media_sort_order_chk check (sort_order >= 0),
  constraint post_media_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint post_media_post_media_uniq unique (post_id, media_asset_id),
  constraint post_media_post_sort_uniq unique (post_id, sort_order)
);

comment on table post_media is 'Ordered media attachments for a canonical post.';

create index post_media_post_order_idx on post_media (post_id, sort_order);

create table publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  post_id uuid not null,
  requested_by_user_id uuid,
  status text not null default 'queued',
  idempotency_key text not null,
  priority integer not null default 100,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publish_jobs_post_fk foreign key (post_id, organization_id)
    references posts(id, organization_id) on delete cascade,
  constraint publish_jobs_requested_by_fk foreign key (requested_by_user_id, organization_id)
    references users(id, organization_id) on delete set null (requested_by_user_id),
  constraint publish_jobs_status_chk check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  constraint publish_jobs_attempt_count_chk check (attempt_count >= 0),
  constraint publish_jobs_max_attempts_chk check (max_attempts > 0),
  constraint publish_jobs_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint publish_jobs_idempotency_uniq unique (organization_id, idempotency_key),
  constraint publish_jobs_id_org_uniq unique (id, organization_id)
);

comment on table publish_jobs is 'Async workflow for publishing a post. Primary worker access pattern: claim queued jobs by run_after and priority with FOR UPDATE SKIP LOCKED.';

create index publish_jobs_claim_idx
  on publish_jobs (status, run_after, priority, created_at)
  where status = 'queued';
create index publish_jobs_org_status_idx on publish_jobs (organization_id, status, created_at desc);

create table publish_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publish_job_id uuid not null,
  post_target_id uuid not null,
  attempt_number integer not null,
  status text not null default 'running',
  platform text not null,
  request_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  retryable boolean,
  error_code text,
  error_message text,
  platform_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint publish_attempts_job_fk foreign key (publish_job_id, organization_id)
    references publish_jobs(id, organization_id) on delete cascade,
  constraint publish_attempts_target_fk foreign key (post_target_id, organization_id)
    references post_targets(id, organization_id) on delete cascade,
  constraint publish_attempts_status_chk check (status in ('running', 'succeeded', 'failed')),
  constraint publish_attempts_platform_chk check (platform = lower(platform) and platform <> ''),
  constraint publish_attempts_attempt_number_chk check (attempt_number > 0),
  constraint publish_attempts_platform_response_object_chk check (jsonb_typeof(platform_response) = 'object'),
  constraint publish_attempts_job_target_attempt_uniq unique (publish_job_id, post_target_id, attempt_number)
);

comment on table publish_attempts is 'Immutable record of one external platform API attempt. Used for support, retries, and auditability.';

create index publish_attempts_target_created_idx on publish_attempts (post_target_id, created_at desc);
create index publish_attempts_org_created_idx on publish_attempts (organization_id, created_at desc);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_type text not null,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_actor_user_fk foreign key (actor_user_id, organization_id)
    references users(id, organization_id) on delete set null (actor_user_id),
  constraint audit_events_actor_type_chk check (actor_type in ('user', 'agent', 'system')),
  constraint audit_events_metadata_object_chk check (jsonb_typeof(metadata) = 'object')
);

comment on table audit_events is 'Append-only record of security-sensitive and business-critical actions.';

create index audit_events_org_created_idx on audit_events (organization_id, created_at desc);
create index audit_events_entity_idx on audit_events (organization_id, entity_type, entity_id, created_at desc);
create index audit_events_actor_idx on audit_events (organization_id, actor_type, actor_user_id, created_at desc);

create trigger organizations_set_updated_at
before update on organizations
for each row execute function set_updated_at();

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

create trigger social_connections_set_updated_at
before update on social_connections
for each row execute function set_updated_at();

create trigger social_assets_set_updated_at
before update on social_assets
for each row execute function set_updated_at();

create trigger social_tokens_set_updated_at
before update on social_tokens
for each row execute function set_updated_at();

create trigger media_assets_set_updated_at
before update on media_assets
for each row execute function set_updated_at();

create trigger posts_set_updated_at
before update on posts
for each row execute function set_updated_at();

create trigger post_targets_set_updated_at
before update on post_targets
for each row execute function set_updated_at();

create trigger publish_jobs_set_updated_at
before update on publish_jobs
for each row execute function set_updated_at();
