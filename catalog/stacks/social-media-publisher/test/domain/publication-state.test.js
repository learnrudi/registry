import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { beginTargetPublishAttempt } from '../../src/domain/publish-jobs.js';
import { enqueuePublish } from '../../src/domain/posts.js';
import { withTransaction } from '../../src/db/transaction.js';
import { runPublishWorkerOnce } from '../../src/workers/publish-worker.js';
import { encryptToken } from '../../src/security/token-crypto.js';
import { closePool } from '../../src/db/pool.js';

const hasPostgres = (() => { try { const version = execFileSync('initdb', ['--version'], { stdio: 'pipe' }).toString(); return Number(version.match(/(\d+)\./)?.[1]) >= 15; } catch { return false; } })();

async function database(run) {
  const root = mkdtempSync(join(tmpdir(), 'social-state-'));
  const data = join(root, 'data');
  let pool;
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-A', 'trust', '-U', 'test', '--no-locale'], { stdio: 'pipe' });
    execFileSync('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${root} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
    const url = `postgresql://test@localhost/postgres?host=${encodeURIComponent(root)}`;
    pool = new pg.Pool({ connectionString: url });
    await pool.query(readFileSync(new URL('../../migrations/001_initial_schema.sql', import.meta.url), 'utf8'));
    const org = (await pool.query("insert into organizations(external_auth_subject,name) values ('test','test') returning id")).rows[0].id;
    const connection = (await pool.query("insert into social_connections(organization_id,platform,status) values ($1,'twitter','healthy') returning id", [org])).rows[0].id;
    const asset = (await pool.query("insert into social_assets(organization_id,connection_id,platform,asset_type,platform_asset_id,name) values ($1,$2,'twitter','profile','fake','test') returning id", [org, connection])).rows[0].id;
    const post = (await pool.query("insert into posts(organization_id,body) values ($1,'Test post') returning id", [org])).rows[0].id;
    const target = (await pool.query("insert into post_targets(organization_id,post_id,social_asset_id,platform,status) values ($1,$2,$3,'twitter','valid') returning *", [org, post, asset])).rows[0];
    await run({ pool, org, post, target, url, connection, asset });
  } finally {
    await closePool();
    await pool?.end();
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(root, { recursive: true, force: true });
  }
}

test('distinct caller jobs cannot both claim a shared target', { skip: !hasPostgres }, async () => database(async ({ pool, org, post, target }) => {
  const first = await withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'first' }));
  const second = await withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'second' }));
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const claim = job => withTransaction(pool, async client => {
    const wrapped = { query: async (sql, args) => {
      const result = await client.query(sql, args);
      if (/from post_targets pt/.test(sql)) { reads += 1; if (reads === 2) release(); await barrier; }
      return result;
    } };
    return beginTargetPublishAttempt(wrapped, { job, target });
  });
  const attempts = await Promise.all([claim(first.job ?? first), claim(second.job ?? second)]);
  assert.equal(attempts.filter(Boolean).length, 1);
  assert.equal((await pool.query('select count(*)::int as n from publish_attempts')).rows[0].n, 1);
}));

test('queued preview preserves post and targets and permits real publication with the same caller key', { skip: !hasPostgres }, async () => database(async ({ pool, org, post, url }) => {
  const beforePost = (await pool.query('select * from posts')).rows;
  const beforeTargets = (await pool.query('select * from post_targets')).rows;
  const preview = await withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'request', dryRun: true }));
  const result = await runPublishWorkerOnce({ databaseUrl: url }, { publishJobId: preview.job.id });
  assert.deepEqual((await pool.query('select * from posts')).rows, beforePost);
  assert.deepEqual((await pool.query('select * from post_targets')).rows, beforeTargets);
  assert.equal(result.jobStatus, 'completed');
  assert.equal((await pool.query('select count(*)::int as n from publish_attempts')).rows[0].n, 0);
  const real = await withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'request' }));
  assert.notEqual(real.job.id, preview.job.id);
  assert.equal(real.job.metadata.dry_run, false);
  assert.equal(real.aggregate.targets[0].status, 'queued');
}));


test('concurrent workers issue one provider call using immutable target identity', { skip: !hasPostgres }, async () => database(async ({ pool, org, post, target, url, connection, asset }) => {
  const key = Buffer.alloc(32, 7).toString('base64');
  await pool.query("insert into social_tokens(organization_id,connection_id,asset_id,platform,token_type,encrypted_token) values ($1,$2,$3,'twitter','user',$4)", [org, connection, asset, encryptToken('fake-token', { keyMaterial: key })]);
  const first = await withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'first' }));
  const second = await withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'second' }));
  const calls = [];
  const adapter = {
    platform: 'twitter',
    tokenType: 'user',
    validatePost: () => ({ ok: true, errors: [] }),
    checkAuth: async () => ({ ok: true }),
    publish: async input => { calls.push(input.idempotencyKey); return { platformPostId: 'fake-provider-id', platformResponse: {} }; },
  };
  {
    await Promise.all([first, second].map(({ job }) => runPublishWorkerOnce({ databaseUrl: url, tokenEncryptionKey: key }, { publishJobId: job.id, resolveAdapter: () => adapter })));
    assert.deepEqual(calls, [`target:${org}:${target.id}`]);
    assert.equal((await pool.query('select count(*)::int as n from publish_attempts')).rows[0].n, 1);
    assert.equal((await pool.query('select status from post_targets')).rows[0].status, 'published');
    await assert.rejects(withTransaction(pool, client => enqueuePublish(client, { organizationId: org, postId: post, idempotencyKey: 'third' })), /cannot be published/);
  }
}));
