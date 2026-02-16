/**
 * LRU Selector - Hybrid rotation engine with health scoring
 *
 * Based on GSwarm's LRU rotation logic, enhanced with:
 * - Cross-account project rotation (3 accounts × 12 projects = 36 slots)
 * - Health scoring: successRate × recencyBonus × (1 - cooldownPenalty)
 * - Automatic cooldown management with rate limit parsing
 * - Project-to-token binding for hybrid rotation
 */

import { PREFIX, consoleDebug, consoleWarn } from "@/lib/console";
import {
  getEnabledGcpProjects,
  getProjectCooldownUntil,
  getProjectStatus,
  isProjectInCooldown,
  updateProjectStatus,
} from "./projects";
import { loadToken } from "./storage/tokens";
import type {
  CallSource,
  GcpProjectInfo,
  ProjectSelectionStats,
  ProjectStatus,
} from "./types";

/**
 * Selection result with GCP project info and account token
 */
export interface GcpProjectSelectionResult {
  project: GcpProjectInfo;
  accessToken: string;
  email: string;
  fromCache: boolean;
  healthScore?: number;
}

/**
 * Cache for recently selected projects to reduce repeated selections
 */
interface SelectionCache {
  project: GcpProjectInfo;
  accessToken: string;
  email: string;
  selectedAt: number;
  callSource?: CallSource;
  healthScore?: number;
}

/**
 * Simple in-memory cache with TTL.
 *
 * NOTE: This module-level variable is intentionally unsynchronized.
 * In a serverless/multi-request environment, concurrent requests may read
 * stale cache entries. This is benign — the cache is purely an optimization
 * with a 1-second TTL, so a stale read causes at most one redundant
 * selectProject() call before the cache naturally expires.
 */
let selectionCache: SelectionCache | null = null;
const CACHE_TTL_MS = 1000; // 1 second cache to prevent rapid re-selection

/**
 * Health score calculation constants
 */
const HEALTH_SCORE_CONFIG = {
  /** Weight for success rate (0-1 range) */
  SUCCESS_WEIGHT: 0.5,
  /** Weight for recency bonus (0-1 range) */
  RECENCY_WEIGHT: 0.3,
  /** Weight for cooldown penalty (0-1 range) */
  COOLDOWN_WEIGHT: 0.2,
  /** Time window for recency calculation (5 minutes) */
  RECENCY_WINDOW_MS: 5 * 60 * 1000,
} as const;

/**
 * Calculate health score for a project
 *
 * Health score formula: successRate × recencyBonus × (1 - cooldownPenalty)
 *
 * @param status - Project status with usage metrics
 * @param cooldownUntil - Timestamp when cooldown expires (ms since epoch)
 * @returns Health score (0-1 range, higher is better)
 */
function calculateHealthScore(
  status: ProjectStatus,
  cooldownUntil: number,
): number {
  const now = Date.now();

  // Success rate: successCount / (successCount + errorCount)
  const total = status.successCount + status.errorCount;
  const successRate = total > 0 ? status.successCount / total : 1;

  // Recency bonus: 1 if used within window, decay linearly to 0
  const timeSinceUse = now - (status.lastUsedAt || 0);
  const recencyBonus = Math.max(
    0,
    1 - timeSinceUse / HEALTH_SCORE_CONFIG.RECENCY_WINDOW_MS,
  );

  // Cooldown penalty: 0 if not in cooldown, 1 if in cooldown
  const inCooldown = cooldownUntil > now;
  const cooldownPenalty = inCooldown ? 1 : 0;

  // Composite score
  const score =
    HEALTH_SCORE_CONFIG.SUCCESS_WEIGHT * successRate +
    HEALTH_SCORE_CONFIG.RECENCY_WEIGHT * recencyBonus +
    HEALTH_SCORE_CONFIG.COOLDOWN_WEIGHT * (1 - cooldownPenalty);

  return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}

/**
 * Select the best available project based on hybrid LRU rotation with health scoring
 *
 * Selection algorithm:
 * 1. Get all enabled projects (cross-account, 36 slots)
 * 2. Calculate health score for each project
 * 3. Sort by health score (highest first)
 * 4. Return best available project with its account token
 *
 * @returns The selected project with account credentials, or null if no projects available
 */
export async function selectProject(): Promise<GcpProjectSelectionResult | null> {
  const allProjects = await getEnabledGcpProjects();

  if (allProjects.length === 0) {
    consoleWarn(
      PREFIX.WARNING,
      "[LruSelector] No enabled projects found in any account",
    );
    return null;
  }

  consoleDebug(
    PREFIX.DEBUG,
    `[LruSelector] Evaluating ${allProjects.length} projects across all accounts`,
  );

  // Fetch status and cooldown for all projects in parallel
  const settled = await Promise.allSettled(
    allProjects.map(async (project: GcpProjectInfo) => {
      const status = await getProjectStatus(project.project_id);
      const cooldownUntil = await getProjectCooldownUntil(project.project_id);
      return { project, status, cooldownUntil };
    }),
  );

  const projectsWithHealth = settled
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        project: GcpProjectInfo;
        status: ProjectStatus | null;
        cooldownUntil: number;
      }> => r.status === "fulfilled",
    )
    .map((r) => {
      const { project, status, cooldownUntil } = r.value;
      // Use default status if not found
      const actualStatus = status ?? {
        projectId: project.project_id,
        lastUsedAt: 0,
        lastSuccessAt: 0,
        lastErrorAt: 0,
        successCount: 0,
        errorCount: 0,
        consecutiveErrors: 0,
        cooldownUntil: 0,
      };

      const healthScore = calculateHealthScore(actualStatus, cooldownUntil);

      return {
        project,
        status: actualStatus,
        cooldownUntil,
        healthScore,
      };
    });

  if (projectsWithHealth.length === 0) {
    consoleWarn(
      PREFIX.WARNING,
      "[LruSelector] All project health evaluations failed",
    );
    return null;
  }

  // Sort by health score (highest first)
  projectsWithHealth.sort((a, b) => b.healthScore - a.healthScore);

  const best = projectsWithHealth[0];

  consoleDebug(
    PREFIX.DEBUG,
    `[LruSelector] Selected project ${best.project.project_id} (account: ${best.project.owner_email}, health: ${best.healthScore.toFixed(3)})`,
  );

  // Load token for the selected project's owner
  const tokenResult = await loadToken(best.project.owner_email);

  if (!tokenResult.success) {
    consoleWarn(
      PREFIX.WARNING,
      `[LruSelector] Failed to load token for ${best.project.owner_email}: ${tokenResult.error}`,
    );
    return null;
  }

  return {
    project: best.project,
    accessToken: tokenResult.data.access_token,
    email: best.project.owner_email,
    fromCache: false,
    healthScore: best.healthScore,
  };
}

/**
 * Select a project for an incoming request with caching support
 *
 * This function adds a thin caching layer on top of selectProject() to
 * prevent rapid re-selection when multiple requests arrive in quick succession.
 *
 * @param callSource - Optional source identifier for the request
 * @returns Selection result with project and cache status, or null if none available
 */
export async function selectProjectForRequest(
  callSource?: CallSource,
): Promise<GcpProjectSelectionResult | null> {
  const now = Date.now();

  // Check cache validity
  if (
    selectionCache &&
    now - selectionCache.selectedAt < CACHE_TTL_MS &&
    selectionCache.callSource === callSource
  ) {
    consoleDebug(
      PREFIX.DEBUG,
      `[LruSelector] Using cached project ${selectionCache.project.project_id}`,
    );
    return {
      project: selectionCache.project,
      accessToken: selectionCache.accessToken,
      email: selectionCache.email,
      fromCache: true,
      healthScore: selectionCache.healthScore,
    };
  }

  // Select fresh project
  const result = await selectProject();

  if (!result) {
    selectionCache = null;
    return null;
  }

  // Update cache
  selectionCache = {
    project: result.project,
    accessToken: result.accessToken,
    email: result.email,
    selectedAt: now,
    callSource,
    healthScore: result.healthScore,
  };

  return result;
}

/**
 * Mark a project as used (increment success count and update lastUsedAt).
 * Call this after a successful API request to track usage for LRU rotation.
 * Invalidates the selection cache if the used project was cached.
 *
 * @param projectId - The ID of the project to mark as used
 *
 * @example
 * ```ts
 * await markProjectUsed("my-project-123");
 * ```
 */
export async function markProjectUsed(projectId: string): Promise<void> {
  const status = await getProjectStatus(projectId);
  const successCount = (status?.successCount ?? 0) + 1;

  await updateProjectStatus(projectId, {
    successCount,
    lastUsedAt: Date.now(),
    lastSuccessAt: Date.now(),
  });

  // Invalidate cache if the used project was cached
  if (selectionCache?.project.project_id === projectId) {
    selectionCache = null;
  }

  consoleDebug(
    PREFIX.DEBUG,
    `[LruSelector] Marked project ${projectId} as used (count: ${successCount})`,
  );
}

/**
 * Get statistics about project selection availability
 *
 * @returns Stats including available, in cooldown, and total project counts
 */
export async function getProjectSelectionStats(): Promise<ProjectSelectionStats> {
  const allProjects = await getEnabledGcpProjects();

  // Check all cooldowns in parallel
  const cooldownResults = await Promise.allSettled(
    allProjects.map(async (project) => ({
      project,
      inCooldown: await isProjectInCooldown(project.project_id),
    })),
  );

  let available = 0;
  let inCooldown = 0;

  for (const result of cooldownResults) {
    if (result.status === "fulfilled") {
      if (result.value.inCooldown) {
        inCooldown++;
      } else {
        available++;
      }
    }
  }

  return {
    available,
    inCooldown,
    total: allProjects.length,
  };
}
