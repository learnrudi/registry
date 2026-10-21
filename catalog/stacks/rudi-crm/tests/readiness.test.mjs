import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { closePool, createPoolConfig, getConfigStatus, getSetupStatus } from "../dist/contract.js";
import { applyMigrations, validateDatabaseUrl } from "../dist/migrate.js";

test("configuration advertises the required contact classification function", () => {
  assert.ok(
    getConfigStatus().expected_database_functions.includes("classify_contact_address"),
    "the classification tool must declare its database prerequisite"
  );
});

test("setup requires classification migration objects before reporting readiness", {
  skip: process.env.RUDI_CRM_BOOTSTRAP_TESTS !== "1"
    ? "Set RUDI_CRM_BOOTSTRAP_TESTS=1 and RUDI_CRM_TEST_ADMIN_URL for isolated readiness proof"
    : false,
}, async () => {
  const adminUrl = validateDatabaseUrl(process.env.RUDI_CRM_TEST_ADMIN_URL);
  const databaseName = `rudi_crm_readiness_${randomUUID().replaceAll("-", "")}`;
  const targetUrl = new URL(adminUrl);
  targetUrl.pathname = `/${databaseName}`;
  const adminPool = new pg.Pool(createPoolConfig(adminUrl));
  const legacyDirectory = await mkdtemp(path.join(os.tmpdir(), "rudi-crm-legacy-"));
  const migrations = fileURLToPath(new URL("../sql/migrations/", import.meta.url));
  const previousUrl = process.env.RUDI_CRM_DATABASE_URL;

  try {
    await adminPool.query(`create database "${databaseName}"`);
    for (const filename of [
      "0001_engagement_crm.sql",
      "0002_contact_discovery_promotion.sql",
      "0003_contact_candidate_noise.sql",
    ]) {
      await copyFile(path.join(migrations, filename), path.join(legacyDirectory, filename));
    }
    await applyMigrations({ databaseUrl: targetUrl.toString(), directory: legacyDirectory });
    await closePool();
    process.env.RUDI_CRM_DATABASE_URL = targetUrl.toString();

    const before = await getSetupStatus();
    assert.equal(before.ok, false, "a pre-classification database is not ready for the new tool");
    assert.deepEqual(before.missing.toSorted(), [
      "classify_contact_address",
      "contact_address_classifications",
    ]);

    const migrated = await applyMigrations({ databaseUrl: targetUrl.toString() });
    assert.deepEqual(migrated.applied, ["0004_contact_address_classification.sql"]);
    const after = await getSetupStatus();
    assert.equal(after.ok, true);
    assert.deepEqual(after.missing, []);
  } finally {
    await closePool();
    if (previousUrl === undefined) delete process.env.RUDI_CRM_DATABASE_URL;
    else process.env.RUDI_CRM_DATABASE_URL = previousUrl;
    try {
      await adminPool.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminPool.end();
      await rm(legacyDirectory, { recursive: true, force: true });
    }
  }
});
