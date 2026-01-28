/**
 * Project Status Storage - File-based persistence for project status data
 * Adapted from pulsona's GSwarmRedisState for file-based storage
 */

import type {
  CooldownConfig,
  ProjectErrorType,
  ProjectStatus,
  StorageResult,
} from "../types";
import { CacheManager, getDataPath, readJsonFile, writeJsonFile } from "./base";

// =============================================================================
// Constants
// =============================================================================

/** File name for project status storage */
export const PROJECT_STATUS_FILE = "project-status.json";

/** Cache TTL in milliseconds (30 seconds) */
export const PROJECT_CACHE_TTL_MS = 30_000;

/** Default cooldown configuration for exponential backoff */
export const DEFAULT_COOLDOWN: CooldownConfig = {
  initialMs: 60_000, // 1 minute
  maxMs: 3_600_000, // 1 hour
  multiplier: 2,
  consecutiveErrorThreshold: 3,
};

// =============================================================================
// Types
// =============================================================================

/**
 * Structure for the project status file
 */
export interface ProjectStatusMap {
  projects: Record<string, ProjectStatus>;
  updated_at: number;
}

// =============================================================================
// In-memory cache
// =============================================================================

const projectCache = new CacheManager<Map<string, ProjectStatus>>(
  PROJECT_CACHE_TTL_MS,
);

/**
 * Get the file path for project status storage
 */
function getProjectStatusPath(): string {
  return getDataPath(PROJECT_STATUS_FILE);
}

// =============================================================================
// Project Status Operations
// =============================================================================

/**
 * Load all project statuses from storage
 */
export async function loadProjectStatuses(): Promise<
  StorageResult<Map<string, ProjectStatus>>
> {
  // Return cached data if valid
  const cached = projectCache.get();
  if (cached) {
    return { success: true, data: cached };
  }

  const filePath = getProjectStatusPath();
  const result = await readJsonFile<ProjectStatusMap>(filePath);

  if (!result.success) {
    // File not found is not an error - return empty map
    if (result.error === "File not found") {
      const emptyMap = new Map<string, ProjectStatus>();
      projectCache.set(emptyMap);
      return { success: true, data: emptyMap };
    }
    return result;
  }

  // Convert to Map
  const statusMap = new Map<string, ProjectStatus>();
  for (const [projectId, status] of Object.entries(result.data.projects)) {
    statusMap.set(projectId, status);
  }

  // Update cache
  projectCache.set(statusMap);

  return { success: true, data: statusMap };
}

/**
 * Get project status by ID
 */
export async function getProjectStatus(
  projectId: string,
): Promise<StorageResult<ProjectStatus>> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return loadResult;
  }

  const status = loadResult.data.get(projectId);
  if (!status) {
    return { success: false, error: `Project ${projectId} not found` };
  }

  return { success: true, data: status };
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
 * Save a single project status to storage
 */
export async function saveProjectStatus(
  status: ProjectStatus,
): Promise<StorageResult<void>> {
  const loadResult = await loadProjectStatuses();
  const statusMap = loadResult.success
    ? loadResult.data
    : new Map<string, ProjectStatus>();
  statusMap.set(status.projectId, status);

  // Update cache
  projectCache.set(statusMap);

  // Convert to storage format
  const storageData: ProjectStatusMap = {
    projects: Object.fromEntries(statusMap),
    updated_at: Date.now(),
  };

  return writeJsonFile(getProjectStatusPath(), storageData);
}

/**
 * Save multiple project statuses to storage
 */
export async function saveProjectStatuses(
  statuses: ProjectStatus[],
): Promise<StorageResult<void>> {
  const loadResult = await loadProjectStatuses();
  const statusMap = loadResult.success
    ? loadResult.data
    : new Map<string, ProjectStatus>();

  // Update all statuses
  for (const status of statuses) {
    statusMap.set(status.projectId, status);
  }

  // Update cache
  projectCache.set(statusMap);

  // Convert to storage format
  const storageData: ProjectStatusMap = {
    projects: Object.fromEntries(statusMap),
    updated_at: Date.now(),
  };

  return writeJsonFile(getProjectStatusPath(), storageData);
}

/**
 * Record a successful request for a project
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
    return saveResult;
  }

  return { success: true, data: status };
}

/**
 * Record an error for a project with exponential backoff cooldown
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
    return saveResult;
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
 * Get all available projects (not in cooldown), sorted by lastUsedAt ascending
 */
export async function getAvailableProjects(): Promise<
  StorageResult<ProjectStatus[]>
> {
  const loadResult = await loadProjectStatuses();
  if (!loadResult.success) {
    return loadResult;
  }

  const now = Date.now();
  const available: ProjectStatus[] = [];

  for (const status of loadResult.data.values()) {
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
    return saveResult;
  }

  return { success: true, data: status };
}

/**
 * Invalidate the in-memory cache, forcing a reload from disk
 */
export function invalidateProjectCache(): void {
  projectCache.invalidate();
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
    return saveResult;
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
 * Clear all project status data
 */
export async function clearAllProjectStatus(): Promise<StorageResult<void>> {
  projectCache.set(new Map());

  const storageData: ProjectStatusMap = {
    projects: {},
    updated_at: Date.now(),
  };

  return writeJsonFile(getProjectStatusPath(), storageData);
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
