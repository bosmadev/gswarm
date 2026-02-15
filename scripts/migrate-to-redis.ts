#!/usr/bin/env tsx
/**
 * @file scripts/migrate-to-redis.ts
 * @description One-time migration script: data/ files → Upstash Redis
 *
 * Reads existing data from the file-based storage structure and writes
 * to Redis using the new key schema. Verifies migration by reading back.
 *
 * Usage:
 *   tsx scripts/migrate-to-redis.ts
 *
 * Prerequisites:
 *   - REDIS_URL in .env (decrypted via dotenvx)
 *   - data/ directory with existing files (if none exist, migration is a no-op)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRedisClient } from "../lib/gswarm/storage/redis";

interface MigrationStats {
  tokensCount: number;
  apiKeysCount: number;
  configMigrated: boolean;
  projectsCount: number;
  metricsCount: number;
  errorsCount: number;
  adminUsersMigrated: boolean;
  errors: string[];
}

const stats: MigrationStats = {
  tokensCount: 0,
  apiKeysCount: 0,
  configMigrated: false,
  projectsCount: 0,
  metricsCount: 0,
  errorsCount: 0,
  adminUsersMigrated: false,
  errors: [],
};

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Migrate OAuth tokens from data/oauth-tokens/{email}.json to Redis hashes
 */
async function migrateTokens(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Tokens] Migrating OAuth tokens...");

  const tokensDir = path.join(DATA_DIR, "oauth-tokens");
  try {
    await fs.access(tokensDir);
  } catch {
    console.log("[Tokens] No oauth-tokens directory found, skipping");
    return;
  }

  const files = await fs.readdir(tokensDir);
  const tokenFiles = files.filter((f) => f.endsWith(".json"));

  for (const file of tokenFiles) {
    try {
      const filePath = path.join(tokensDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const tokenData = JSON.parse(content);

      const email = file.replace(".json", "");
      const redisKey = `oauth-tokens:${email}`;

      // Store as hash: each field is a top-level property
      await redis.hmset(redisKey, tokenData);
      stats.tokensCount++;

      console.log(`[Tokens] ✓ Migrated ${email}`);
    } catch (err) {
      const error = `[Tokens] Failed to migrate ${file}: ${err}`;
      console.error(error);
      stats.errors.push(error);
    }
  }

  console.log(`[Tokens] Migrated ${stats.tokensCount} tokens`);
}

/**
 * Migrate API keys from data/api-keys.json to Redis string
 */
async function migrateApiKeys(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[API Keys] Migrating API keys...");

  const apiKeysFile = path.join(DATA_DIR, "api-keys.json");
  try {
    await fs.access(apiKeysFile);
  } catch {
    console.log("[API Keys] No api-keys.json found, skipping");
    return;
  }

  try {
    const content = await fs.readFile(apiKeysFile, "utf-8");
    const apiKeysData = JSON.parse(content);

    await redis.set("api-keys", JSON.stringify(apiKeysData));
    stats.apiKeysCount = apiKeysData.keys?.length || 0;

    console.log(`[API Keys] ✓ Migrated ${stats.apiKeysCount} keys`);
  } catch (err) {
    const error = `[API Keys] Failed to migrate: ${err}`;
    console.error(error);
    stats.errors.push(error);
  }
}

/**
 * Migrate config from data/config.json to Redis string
 */
async function migrateConfig(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Config] Migrating config...");

  const configFile = path.join(DATA_DIR, "config.json");
  try {
    await fs.access(configFile);
  } catch {
    console.log("[Config] No config.json found, skipping");
    return;
  }

  try {
    const content = await fs.readFile(configFile, "utf-8");
    const configData = JSON.parse(content);

    await redis.set("config", JSON.stringify(configData));
    stats.configMigrated = true;

    console.log("[Config] ✓ Migrated config");
  } catch (err) {
    const error = `[Config] Failed to migrate: ${err}`;
    console.error(error);
    stats.errors.push(error);
  }
}

/**
 * Migrate projects from data/project-status.json to Redis hashes
 */
async function migrateProjects(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Projects] Migrating project status...");

  const projectsFile = path.join(DATA_DIR, "project-status.json");
  try {
    await fs.access(projectsFile);
  } catch {
    console.log("[Projects] No project-status.json found, skipping");
    return;
  }

  try {
    const content = await fs.readFile(projectsFile, "utf-8");
    const projectsData = JSON.parse(content);

    // projectsData is an object like { "project-id": {...}, ... }
    for (const [projectId, statusData] of Object.entries(projectsData)) {
      const redisKey = `project-status:${projectId}`;
      await redis.hmset(redisKey, statusData as Record<string, unknown>);
      stats.projectsCount++;
    }

    console.log(`[Projects] ✓ Migrated ${stats.projectsCount} projects`);
  } catch (err) {
    const error = `[Projects] Failed to migrate: ${err}`;
    console.error(error);
    stats.errors.push(error);
  }
}

/**
 * Migrate metrics from data/metrics/{YYYY-MM-DD}.json to Redis with TTL
 */
async function migrateMetrics(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Metrics] Migrating metrics...");

  const metricsDir = path.join(DATA_DIR, "metrics");
  try {
    await fs.access(metricsDir);
  } catch {
    console.log("[Metrics] No metrics directory found, skipping");
    return;
  }

  const files = await fs.readdir(metricsDir);
  const metricFiles = files.filter((f) => f.endsWith(".json"));

  const TTL_30_DAYS = 30 * 24 * 60 * 60; // seconds

  for (const file of metricFiles) {
    try {
      const filePath = path.join(metricsDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const metricsData = JSON.parse(content);

      const dateKey = file.replace(".json", ""); // YYYY-MM-DD
      const redisKey = `metrics:${dateKey}`;

      await redis.set(redisKey, JSON.stringify(metricsData), "EX", TTL_30_DAYS);
      stats.metricsCount++;

      console.log(`[Metrics] ✓ Migrated ${dateKey} (30-day TTL)`);
    } catch (err) {
      const error = `[Metrics] Failed to migrate ${file}: ${err}`;
      console.error(error);
      stats.errors.push(error);
    }
  }

  console.log(`[Metrics] Migrated ${stats.metricsCount} metric files`);
}

/**
 * Migrate errors from data/errors/{YYYY-MM-DD}.json to Redis with TTL
 */
async function migrateErrors(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Errors] Migrating error logs...");

  const errorsDir = path.join(DATA_DIR, "errors");
  try {
    await fs.access(errorsDir);
  } catch {
    console.log("[Errors] No errors directory found, skipping");
    return;
  }

  const files = await fs.readdir(errorsDir);
  const errorFiles = files.filter((f) => f.endsWith(".json"));

  const TTL_30_DAYS = 30 * 24 * 60 * 60; // seconds

  for (const file of errorFiles) {
    try {
      const filePath = path.join(errorsDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const errorsData = JSON.parse(content);

      const dateKey = file.replace(".json", ""); // YYYY-MM-DD
      const redisKey = `errors:${dateKey}`;

      await redis.set(redisKey, JSON.stringify(errorsData), "EX", TTL_30_DAYS);
      stats.errorsCount++;

      console.log(`[Errors] ✓ Migrated ${dateKey} (30-day TTL)`);
    } catch (err) {
      const error = `[Errors] Failed to migrate ${file}: ${err}`;
      console.error(error);
      stats.errors.push(error);
    }
  }

  console.log(`[Errors] Migrated ${stats.errorsCount} error log files`);
}

/**
 * Migrate admin credentials from process.env to Redis
 */
async function migrateAdminUsers(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Admin] Migrating admin credentials to Redis...");

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const dashboardUsers = process.env.DASHBOARD_USERS;

  if (!adminUsername && !adminPassword && !dashboardUsers) {
    console.log("[Admin] No admin credentials found in .env, skipping");
    return;
  }

  const adminData = {
    adminUsername: adminUsername || "",
    adminPassword: adminPassword || "",
    dashboardUsers: dashboardUsers || "",
  };

  try {
    await redis.set("admin-users", JSON.stringify(adminData));
    stats.adminUsersMigrated = true;
    console.log("[Admin] ✓ Migrated admin credentials to Redis");
  } catch (err) {
    const error = `[Admin] Failed to migrate: ${err}`;
    console.error(error);
    stats.errors.push(error);
  }
}

/**
 * Verify migration by reading back from Redis
 */
async function verifyMigration(redis: ReturnType<typeof getRedisClient>) {
  console.log("\n[Verification] Reading back from Redis...");

  const checks: { key: string; exists: boolean }[] = [];

  // Check a few sample keys
  if (stats.tokensCount > 0) {
    const tokenKeys = await redis.keys("oauth-tokens:*");
    checks.push({
      key: "oauth-tokens:*",
      exists: tokenKeys.length === stats.tokensCount,
    });
  }

  if (stats.apiKeysCount > 0) {
    const apiKeysExists = await redis.exists("api-keys");
    checks.push({ key: "api-keys", exists: apiKeysExists === 1 });
  }

  if (stats.configMigrated) {
    const configExists = await redis.exists("config");
    checks.push({ key: "config", exists: configExists === 1 });
  }

  if (stats.projectsCount > 0) {
    const projectKeys = await redis.keys("project-status:*");
    checks.push({
      key: "project-status:*",
      exists: projectKeys.length === stats.projectsCount,
    });
  }

  if (stats.adminUsersMigrated) {
    const adminExists = await redis.exists("admin-users");
    checks.push({ key: "admin-users", exists: adminExists === 1 });
  }

  for (const check of checks) {
    const status = check.exists ? "✅" : "❌";
    console.log(`[Verification] ${status} ${check.key}`);
  }
}

/**
 * Main migration entry point
 */
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  GSwarm: File Storage → Redis Migration");
  console.log("═══════════════════════════════════════════════");

  const redis = getRedisClient();

  try {
    await migrateTokens(redis);
    await migrateApiKeys(redis);
    await migrateConfig(redis);
    await migrateProjects(redis);
    await migrateMetrics(redis);
    await migrateErrors(redis);
    await migrateAdminUsers(redis);
    await verifyMigration(redis);

    console.log("\n═══════════════════════════════════════════════");
    console.log("  Migration Summary");
    console.log("═══════════════════════════════════════════════");
    console.log(`OAuth Tokens:      ${stats.tokensCount}`);
    console.log(`API Keys:          ${stats.apiKeysCount}`);
    console.log(`Config:            ${stats.configMigrated ? "✓" : "✗"}`);
    console.log(`Projects:          ${stats.projectsCount}`);
    console.log(`Metrics:           ${stats.metricsCount}`);
    console.log(`Error Logs:        ${stats.errorsCount}`);
    console.log(`Admin Users:       ${stats.adminUsersMigrated ? "✓" : "✗"}`);
    console.log(`Errors:            ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log("\n❌ Migration completed with errors:");
      for (const err of stats.errors) {
        console.error(`   ${err}`);
      }
      process.exit(1);
    }

    console.log("\n✅ Migration completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Fatal migration error:", err);
    process.exit(1);
  }
}

main();
