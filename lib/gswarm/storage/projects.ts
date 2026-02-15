/**
 * @file lib/gswarm/storage/projects.ts
 * @version 1.0
 * @description Project status storage with LRU tracking and cooldown management.
 *
 * File-based persistence for per-project status data including success/error
 * counts, consecutive error tracking, and exponential backoff cooldowns.
 * Adapted from GSwarm's GSwarmRedisState for file-based storage.
 */

import type {
  CooldownConfig,
  ProjectErrorType,
  ProjectStatus,
  StorageResult,
} from "../types";
import { getRedisClient } from "./redis";

// =============================================================================
// Constants
// =============================================================================

/** Redis key prefix for project status storage */
export const PROJECT_STATUS_PREFIX = "project-status:";

/** Default cooldown configuration for exponential backoff */
export const DEFAULT_COOLDOWN: CooldownConfig = {
  initialMs: 60_000, // 1 minute
  maxMs: 3_600_000, // 1 hour
  multiplier: 2,
  consecutiveErrorThreshold: 3,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the Redis key for a specific project
 */
function getProjectKey(projectId: string): string {
  return `${PROJECT_STATUS_PREFIX}${projectId}`;
}

/**
 * Convert ProjectStatus to Redis hash format
 */
function statusToHash(status: ProjectStatus): Record<string, string> {
  return {
    projectId: status.projectId,
    lastUsedAt: status.lastUsedAt.toString(),
    lastSuccessAt: status.lastSuccessAt.toString(),
    lastErrorAt: status.lastErrorAt.toString(),
    successCount: status.successCount.toString(),
    errorCount: status.errorCount.toString(),
    consecutiveErrors: status.consecutiveErrors.toString(),
    cooldownUntil: status.cooldownUntil.toString(),
    ...(status.lastErrorType && { lastErrorType: status.lastErrorType }),
    ...(status.quotaResetTime && {
      quotaResetTime: status.quotaResetTime.toString(),
    }),
    ...(status.quotaResetReason && {
      quotaResetReason: status.quotaResetReason,
    }),
  };
}

/**
 * Convert Redis hash to ProjectStatus
 */
function hashToStatus(
  hash: Record<string, string>,
): ProjectStatus | null {
  if (!hash.projectId) return null;

  return {
    projectId: hash.projectId,
    lastUsedAt: Number.parseInt(hash.lastUsedAt || "0"),
    lastSuccessAt: Number.parseInt(hash.lastSuccessAt || "0"),
    lastErrorAt: Number.parseInt(hash.lastErrorAt || "0"),
    successCount: Number.parseInt(hash.successCount || "0"),
    errorCount: Number.parseInt(hash.errorCount || "0"),
    consecutiveErrors: Number.parseInt(hash.consecutiveErrors || "0"),
    cooldownUntil: Number.parseInt(hash.cooldownUntil || "0"),
    lastErrorType: hash.lastErrorType as ProjectErrorType | undefined,
    quotaResetTime: hash.quotaResetTime
      ? Number.parseInt(hash.quotaResetTime)
      : undefined,
    quotaResetReason: hash.quotaResetReason,
  };
}

// =============================================================================
// Project Status Operations
// =============================================================================

/**
 * Load all project statuses from Redis
 * Uses SCAN to find all project-status:* keys
 */
export async function loadProjectStatuses(): Promise<
  StorageResult<Map<string, ProjectStatus>>
> {
  try {
    const redis = getRedisClient();
    const statusMap = new Map<string, ProjectStatus>();

    // Use SCAN to find all project keys
    const pattern = `${PROJECT_STATUS_PREFIX}*`;
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;

      // Fetch all hashes in a pipeline for efficiency
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.hgetall(key);
        }
        const results = await pipeline.exec();

        if (results) {
          for (let i = 0; i < results.length; i++) {
            const [err, hash] = results[i];
            if (!err && hash) {
              const status = hashToStatus(hash as Record<string, string>);
              if (status) {
                statusMap.set(status.projectId, status);
              }
            }
          }
        }
      }
    } while (cursor !== "0");

    return { success: true, data: statusMap };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to load project statuses: ${errorMessage}`,
    };
  }
}

/**
 * Get project status by ID from Redis
 */
export async function getProjectStatus(
  projectId: string,
): Promise<StorageResult<ProjectStatus>> {
  try {
    const redis = getRedisClient();
    const key = getProjectKey(projectId);
    const hash = await redis.hgetall(key);

    if (!hash || Object.keys(hash).length === 0) {
      return { success: false, error: `Project ${projectId} not found` };
    }

    const status = hashToStatus(hash);
    if (!status) {
      return {
        success: false,
        error: `Invalid project status data for ${projectId}`,
      };
    }

    return { success: true, data: status };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to get project status: ${errorMessage}`,
    };
  }
}

/**
 * Create a default project status for a new project
 */
export function createDefaultStatus(projectId: string): ProjectStatus {
  return {
    projectId,
    lastUsedAt: 0,
    lastSuccessAt: 0,
    lastErrorAt: 0,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
  };
}

/**
 * Save a single project status to Redis
 */
export async function saveProjectStatus(
  status: ProjectStatus,
): Promise<StorageResult<void>> {
  try {
    const redis = getRedisClient();
    const key = getProjectKey(status.projectId);
    const hash = statusToHash(status);

    // Delete existing hash and set new one
    await redis.del(key);
    await redis.hset(key, hash);

    return { success: true, data: undefined };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to save project status: ${errorMessage}`,
    };
  }
}

/**
 * Save multiple project statuses to Redis using a pipeline for efficiency
 */
export async function saveProjectStatuses(
  statuses: ProjectStatus[],
): Promise<StorageResult<void>> {
  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    for (const status of statuses) {
      const key = getProjectKey(status.projectId);
      const hash = statusToHash(status);
      pipeline.del(key);
      pipeline.hset(key, hash);
    }

    await pipeline.exec();
    return { success: true, data: undefined };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to save project statuses: ${errorMessage}`,
    };
  }
}

/**
 * Records a successful request for a project.
 * Resets consecutive error count and clears the last error type.
 *
 * @param projectId - The project to record success for
 * @returns Updated project status
 *
 * @example
 * ```ts
 * const result = await recordProjectSuccess("my-project-123");
 * if (result.success) {
 *   console.log(`Total successes: ${result.data.successCount}`);
 * }
 * ```
 */
export async function recordProjectSuccess(
  projectId: string,
): Promise<StorageResult<ProjectStatus>> {
  const loadResult = await loadProjectStatuses();
  const statusMap = loadResult.success ? loadResult.data : new Map();

  const existing = statusMap.get(projectId);
  const now = Date.now();

  const status: ProjectStatus = {
    ...(existing ?? createDefaultStatus(projectId)),
    projectId,
    lastUsedAt: now,
    lastSuccessAt: now,
    successCount: (existing?.successCount ?? 0) + 1,
    consecutiveErrors: 0, // Reset on success
    lastErrorType: undefined, // Clear error type on success
  };

  const saveResult = await saveProjectStatus(status);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error };
  }

  return { success: true, data: status };
}

/**
 * Records an error for a project with exponential backoff cooldown.
 * Increments consecutive error count and calculates cooldown duration
 * based on the configured backoff multiplier and threshold.
 *
 * @param projectId - The project to record the error for
 * @param errorType - The type of error that occurred
 * @param quotaResetTime - Optional Unix timestamp (ms) when quota resets
 * @returns Updated project status with cooldown information
 *
 * @example
 * ```ts
 * const result = await recordProjectError("my-project-123", "quota_exhausted", Date.now() + 3600000);
 * if (result.success) {
 *   console.log(`Project in cooldown until: ${new Date(result.data.cooldownUntil)}`);
 * }
 * ```
 */
export async function recordProjectError(
  projectId: string,
  errorType: ProjectErrorType,
  quotaResetTime?: number,
): Promise<StorageResult<ProjectStatus>> {
  const loadResult = await loadProjectStatuses();
  const statusMap = loadResult.success ? loadResult.data : new Map();

  const existing = statusMap.get(projectId);
  const now = Date.now();

  const consecutiveErrors = (existing?.consecutiveErrors ?? 0) + 1;

  // Calculate cooldown with exponential backoff
  let cooldownMs = DEFAULT_COOLDOWN.initialMs;
  if (consecutiveErrors >= DEFAULT_COOLDOWN.consecutiveErrorThreshold) {
    const backoffMultiplier =
      DEFAULT_COOLDOWN.multiplier **
      (consecutiveErrors - DEFAULT_COOLDOWN.consecutiveErrorThreshold);
    cooldownMs = Math.min(
      DEFAULT_COOLDOWN.initialMs * backoffMultiplier,
      DEFAULT_COOLDOWN.maxMs,
    );
  }

  // For quota exhausted errors, use the provided reset time if available
  let cooldownUntil = now + cooldownMs;
  if (errorType === "quota_exhausted" && quotaResetTime) {
    cooldownUntil = Math.max(cooldownUntil, quotaResetTime);
  }

  // For auth errors that can be fixed by re-login, use shorter cooldown
  if (errorType === "not_logged_in") {
    cooldownUntil = now + DEFAULT_COOLDOWN.initialMs;
  }

  const status: ProjectStatus = {
    ...(existing ?? createDefaultStatus(projectId)),
    projectId,
    lastUsedAt: now,
    lastErrorAt: now,
    errorCount: (existing?.errorCount ?? 0) + 1,
    consecutiveErrors,
    cooldownUntil,
    lastErrorType: errorType,
    quotaResetTime: quotaResetTime ?? existing?.quotaResetTime,
    quotaResetReason: quotaResetTime
      ? formatDuration(quotaResetTime - now)
      : existing?.quotaResetReason,
  };

  const saveResult = await saveProjectStatus(status);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error };
  }

  return { success: true, data: status };
}

/**
 * Check if a project is currently in cooldown
 */
export async function isProjectInCooldown(
  projectId: string,
): Promise<StorageResult<boolean>> {
  const statusResult = await getProjectStatus(projectId);

  // Project not found = not in cooldown
  if (!statusResult.success) {
    return { success: true, data: false };
  }

  const status = statusResult.data;
  const now = Date.now();

  // Check cooldown or quota reset time
  const inCooldown =
    now < status.cooldownUntil ||
    (status.quotaResetTime ? now < status.quotaResetTime : false);

  return { success: true, data: inCooldown };
}

/**
 * Gets all available projects (not in cooldown), sorted by lastUsedAt ascending (LRU first).
 *
 * @returns Array of project statuses for available projects
 *
 * @example
 * ```ts
 * const result = await getAvailableProjects();
 * if (result.success && result.data.length > 0) {
 *   const leastRecentlyUsed = result.data[0];
 *   console.log(`Next project to use: ${leastRecentlyUsed.projectId}`);
 * }
 * ```
 */
export async function getAvailableProjects(): Promise<
  StorageResult<ProjectStatus[]>
> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const now = Date.now();
  const available: ProjectStatus[] = [];

  for (const status of Array.from(loadResult.data.values())) {
    const inCooldown =
      now < status.cooldownUntil ||
      (status.quotaResetTime ? now < status.quotaResetTime : false);

    if (!inCooldown) {
      available.push(status);
    }
  }

  // Sort by lastUsedAt ascending (least recently used first)
  available.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  return { success: true, data: available };
}

/**
 * Get all projects with exhausted quota
 */
export async function getQuotaExhaustedProjects(): Promise<
  StorageResult<ProjectStatus[]>
> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return loadResult;
  }

  const now = Date.now();
  const exhausted: ProjectStatus[] = [];

  for (const status of loadResult.data.values()) {
    if (
      status.lastErrorType === "quota_exhausted" ||
      (status.quotaResetTime && now < status.quotaResetTime)
    ) {
      exhausted.push(status);
    }
  }

  return { success: true, data: exhausted };
}

/**
 * Clear cooldown for a specific project
 */
export async function clearProjectCooldown(
  projectId: string,
): Promise<StorageResult<ProjectStatus>> {
  const loadResult = await loadProjectStatuses();
  const statusMap = loadResult.success ? loadResult.data : new Map();

  const existing = statusMap.get(projectId);

  const status: ProjectStatus = {
    ...(existing ?? createDefaultStatus(projectId)),
    projectId,
    cooldownUntil: 0,
    consecutiveErrors: 0,
    quotaResetTime: undefined,
    quotaResetReason: undefined,
    lastErrorType: undefined,
  };

  const saveResult = await saveProjectStatus(status);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error };
  }

  return { success: true, data: status };
}

/**
 * Invalidate the in-memory cache, forcing a reload from Redis
 * Note: With Redis, this is a no-op since Redis is the source of truth
 */
export function invalidateProjectCache(): void {
  // No-op: Redis is the cache, no in-memory cache to clear
}

// =============================================================================
// Legacy compatibility functions (for existing API)
// =============================================================================

/**
 * Get all enabled projects - returns project IDs from status storage
 * Note: This is for compatibility. Full project info should come from project discovery.
 */
export async function getEnabledProjects(): Promise<string[]> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return [];
  }
  return Array.from(loadResult.data.keys());
}

/**
 * Get all projects - returns all project IDs from status storage
 */
export async function getAllProjects(): Promise<string[]> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return [];
  }
  return Array.from(loadResult.data.keys());
}

/**
 * Update project status with partial updates
 */
export async function updateProjectStatus(
  projectId: string,
  updates: Partial<ProjectStatus>,
): Promise<StorageResult<ProjectStatus>> {
  const loadResult = await loadProjectStatuses();
  const statusMap = loadResult.success ? loadResult.data : new Map();

  const existing = statusMap.get(projectId);
  const status: ProjectStatus = {
    ...(existing ?? createDefaultStatus(projectId)),
    ...updates,
    projectId, // Ensure projectId is always correct
  };

  const saveResult = await saveProjectStatus(status);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error };
  }

  return { success: true, data: status };
}

/**
 * Get all project statuses as an array
 */
export async function getAllProjectStatuses(): Promise<ProjectStatus[]> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return [];
  }
  return Array.from(loadResult.data.values());
}

/**
 * Clear all project status data from Redis
 */
export async function clearAllProjectStatus(): Promise<StorageResult<void>> {
  try {
    const redis = getRedisClient();
    const pattern = `${PROJECT_STATUS_PREFIX}*`;
    let cursor = "0";
    const keysToDelete: string[] = [];

    // Use SCAN to find all project keys
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== "0");

    // Delete all keys in a pipeline
    if (keysToDelete.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keysToDelete) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }

    return { success: true, data: undefined };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to clear project statuses: ${errorMessage}`,
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

  return parts.join("");
}
