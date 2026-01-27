/**
 * LRU Selector - Least Recently Used project selection with cooldown handling
 *
 * Based on pulsona's LRU rotation logic, this module provides:
 * - Selection of projects based on least quota used (most remaining first)
 * - Cooldown filtering to skip temporarily unavailable projects
 * - Fallback to soonest-expiring cooldown when all projects are in cooldown
 */

import {
  getEnabledGcpProjects,
  getProjectCooldownUntil,
  getProjectStatus,
  isProjectInCooldown,
} from "./projects";
import { updateProjectStatus } from "./storage/projects";
import type {
  CallSource,
  GcpProjectInfo,
  ProjectSelectionStats,
  ProjectStatus,
} from "./types";

/**
 * Selection result with GCP project info
 */
export interface GcpProjectSelectionResult {
  project: GcpProjectInfo;
  fromCache: boolean;
}

/**
 * Cache for recently selected projects to reduce repeated selections
 */
interface SelectionCache {
  project: GcpProjectInfo;
  selectedAt: number;
  callSource?: CallSource;
}

// Simple in-memory cache with TTL
let selectionCache: SelectionCache | null = null;
const CACHE_TTL_MS = 1000; // 1 second cache to prevent rapid re-selection

/**
 * Select the best available project based on LRU rotation logic
 *
 * Selection algorithm:
 * 1. Get all enabled projects
 * 2. Filter out projects currently in cooldown
 * 3. Sort by least quota used (successCount ascending)
 * 4. If all in cooldown, pick the one with soonest expiring cooldown
 *
 * @returns The selected project or null if no projects available
 */
export async function selectProject(): Promise<GcpProjectInfo | null> {
  const allProjects = await getEnabledGcpProjects();

  if (allProjects.length === 0) {
    return null;
  }

  // 1. Filter: remove projects in cooldown
  const availableProjects: GcpProjectInfo[] = [];
  for (const project of allProjects) {
    const inCooldown = await isProjectInCooldown(project.project_id);
    if (!inCooldown) {
      availableProjects.push(project);
    }
  }

  // 2. If we have available projects, sort by least quota used
  if (availableProjects.length > 0) {
    const projectsWithStatus = await Promise.all(
      availableProjects.map(async (project: GcpProjectInfo) => ({
        project,
        status: await getProjectStatus(project.project_id),
      })),
    );

    // Sort by successCount ascending (least used first)
    projectsWithStatus.sort(
      (
        a: { project: GcpProjectInfo; status: ProjectStatus | null },
        b: { project: GcpProjectInfo; status: ProjectStatus | null },
      ) => {
        const usedA = a.status?.successCount ?? 0;
        const usedB = b.status?.successCount ?? 0;
        return usedA - usedB;
      },
    );

    return projectsWithStatus[0]?.project ?? null;
  }

  // 3. All projects in cooldown - pick soonest to expire
  const projectsWithCooldown = await Promise.all(
    allProjects.map(async (project: GcpProjectInfo) => ({
      project,
      cooldownUntil: await getProjectCooldownUntil(project.project_id),
    })),
  );

  // Sort by cooldownUntil ascending (soonest first)
  // cooldownUntil is a number (ms since epoch), not a Date
  projectsWithCooldown.sort(
    (
      a: { project: GcpProjectInfo; cooldownUntil: number },
      b: { project: GcpProjectInfo; cooldownUntil: number },
    ) => {
      const timeA = a.cooldownUntil || Number.POSITIVE_INFINITY;
      const timeB = b.cooldownUntil || Number.POSITIVE_INFINITY;
      return timeA - timeB;
    },
  );

  return projectsWithCooldown[0]?.project ?? null;
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
    return {
      project: selectionCache.project,
      fromCache: true,
    };
  }

  // Select fresh project
  const project = await selectProject();

  if (!project) {
    selectionCache = null;
    return null;
  }

  // Update cache
  selectionCache = {
    project,
    selectedAt: now,
    callSource,
  };

  return {
    project,
    fromCache: false,
  };
}

/**
 * Mark a project as used (increment success count and update lastUsedAt)
 *
 * Call this after a successful API request to track usage for LRU rotation.
 *
 * @param projectId - The ID of the project to mark as used
 */
export async function markProjectUsed(projectId: string): Promise<void> {
  const status = await getProjectStatus(projectId);
  const successCount = (status?.successCount ?? 0) + 1;

  await updateProjectStatus(projectId, {
    successCount,
    lastUsedAt: Date.now(),
  });

  // Invalidate cache if the used project was cached
  if (selectionCache?.project.project_id === projectId) {
    selectionCache = null;
  }
}

/**
 * Get statistics about project selection availability
 *
 * @returns Stats including available, in cooldown, and total project counts
 */
export async function getProjectSelectionStats(): Promise<ProjectSelectionStats> {
  const allProjects = await getEnabledGcpProjects();

  let available = 0;
  let inCooldown = 0;

  for (const project of allProjects) {
    const projectInCooldown = await isProjectInCooldown(project.project_id);
    if (projectInCooldown) {
      inCooldown++;
    } else {
      available++;
    }
  }

  return {
    available,
    inCooldown,
    total: allProjects.length,
  };
}

/**
 * Clear the selection cache (useful for testing or forced refresh)
 */
export function clearSelectionCache(): void {
  selectionCache = null;
}

/**
 * Get detailed information about all projects and their selection eligibility
 *
 * @returns Array of projects with their status and eligibility info
 */
export async function getProjectSelectionDetails(): Promise<
  Array<{
    project: GcpProjectInfo;
    status: ProjectStatus | null;
    inCooldown: boolean;
    cooldownUntil: number;
  }>
> {
  const allProjects = await getEnabledGcpProjects();

  return Promise.all(
    allProjects.map(async (project: GcpProjectInfo) => ({
      project,
      status: await getProjectStatus(project.project_id),
      inCooldown: await isProjectInCooldown(project.project_id),
      cooldownUntil: await getProjectCooldownUntil(project.project_id),
    })),
  );
}
