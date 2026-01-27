/**
 * Projects - High-level project management and GCP project discovery
 *
 * This module provides:
 * 1. Local project management (storage-based ProjectInfo)
 * 2. GCP project discovery with Cloud AI Companion API enablement status
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import {
  createDefaultStatus,
  invalidateProjectCache,
  loadProjectStatuses,
  clearProjectCooldown as storageClearProjectCooldown,
  getAvailableProjects as storageGetAvailableProjects,
  getProjectStatus as storageGetProjectStatus,
  getQuotaExhaustedProjects as storageGetQuotaExhaustedProjects,
  isProjectInCooldown as storageIsProjectInCooldown,
  recordProjectError as storageRecordProjectError,
  recordProjectSuccess as storageRecordProjectSuccess,
  updateProjectStatus as storageUpdateProjectStatus,
} from "./storage/projects";
import { getValidTokens } from "./storage/tokens";
import type {
  GcpProject,
  GcpProjectInfo,
  GcpProjectsResponse,
  ProjectErrorType,
  ProjectStatus,
  ServiceUsageResponse,
  StoredToken,
} from "./types";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default cooldown duration in milliseconds (5 minutes)
 */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Cache duration for GCP projects list (5 minutes)
 */
export const PROJECTS_CACHE_DURATION = 5 * 60 * 1000;

/** Cloud AI Companion API service name */
const CLOUD_AI_COMPANION_API = "cloudaicompanion.googleapis.com";

/** GCP Resource Manager API base URL */
const RESOURCE_MANAGER_API = "https://cloudresourcemanager.googleapis.com/v1";

/** GCP Service Usage API base URL */
const SERVICE_USAGE_API = "https://serviceusage.googleapis.com/v1";

/** Google Cloud Console base URL */
const CONSOLE_BASE_URL = "https://console.cloud.google.com";

// =============================================================================
// In-Memory Cache for GCP Projects
// =============================================================================

/** Cached list of discovered GCP projects */
let cachedProjects: GcpProjectInfo[] = [];

/** Timestamp when GCP projects were last cached */
let projectsCacheTime = 0;

// =============================================================================
// Project Status Operations
// =============================================================================

/**
 * Get project status by ID
 * Returns null if project not found (instead of error)
 */
export async function getProjectStatus(
  projectId: string,
): Promise<ProjectStatus | null> {
  const result = await storageGetProjectStatus(projectId);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * Get or create project status
 * Creates a default status if project doesn't exist
 */
export async function getOrCreateProjectStatus(
  projectId: string,
): Promise<ProjectStatus> {
  const result = await storageGetProjectStatus(projectId);
  if (result.success) {
    return result.data;
  }
  return createDefaultStatus(projectId);
}

/**
 * Check if a project is currently in cooldown
 */
export async function isProjectInCooldown(projectId: string): Promise<boolean> {
  const result = await storageIsProjectInCooldown(projectId);
  return result.success ? result.data : false;
}

/**
 * Get the cooldown end time for a project (in ms since epoch)
 * Returns 0 if not in cooldown
 */
export async function getProjectCooldownUntil(
  projectId: string,
): Promise<number> {
  const status = await getProjectStatus(projectId);
  return status?.cooldownUntil ?? 0;
}

/**
 * Set a project into cooldown for a specific duration
 */
export async function setProjectCooldown(
  projectId: string,
  durationMs: number = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  const cooldownUntil = Date.now() + durationMs;
  await storageUpdateProjectStatus(projectId, { cooldownUntil });
}

/**
 * Clear a project's cooldown
 */
export async function clearProjectCooldown(
  projectId: string,
): Promise<ProjectStatus | null> {
  const result = await storageClearProjectCooldown(projectId);
  return result.success ? result.data : null;
}

// =============================================================================
// Success/Error Recording
// =============================================================================

/**
 * Record a successful request for a project
 * Resets consecutive errors and updates timestamps
 */
export async function recordProjectSuccess(
  projectId: string,
): Promise<ProjectStatus | null> {
  const result = await storageRecordProjectSuccess(projectId);
  return result.success ? result.data : null;
}

/**
 * Record an error for a project with exponential backoff cooldown
 */
export async function recordProjectError(
  projectId: string,
  errorType: ProjectErrorType,
  quotaResetTime?: number,
): Promise<ProjectStatus | null> {
  const result = await storageRecordProjectError(
    projectId,
    errorType,
    quotaResetTime,
  );
  return result.success ? result.data : null;
}

// =============================================================================
// Project Selection
// =============================================================================

/**
 * Get all available projects (not in cooldown), sorted by LRU
 */
export async function getAvailableProjects(): Promise<ProjectStatus[]> {
  const result = await storageGetAvailableProjects();
  return result.success ? result.data : [];
}

/**
 * Get all projects with exhausted quota
 */
export async function getQuotaExhaustedProjects(): Promise<ProjectStatus[]> {
  const result = await storageGetQuotaExhaustedProjects();
  return result.success ? result.data : [];
}

/**
 * Get all project statuses
 */
export async function getAllProjectStatuses(): Promise<
  Map<string, ProjectStatus>
> {
  const result = await loadProjectStatuses();
  return result.success ? result.data : new Map();
}

// =============================================================================
// Legacy Compatibility (deprecated - use new functions instead)
// =============================================================================

/**
 * @deprecated Use recordProjectSuccess instead
 */
export async function incrementProjectSuccess(
  projectId: string,
): Promise<void> {
  await recordProjectSuccess(projectId);
}

/**
 * @deprecated Use recordProjectError instead
 */
export async function incrementProjectError(projectId: string): Promise<void> {
  await recordProjectError(projectId, "server");
}

// =============================================================================
// Console URL Helpers
// =============================================================================

/**
 * Gets the Google Cloud Console URL to enable the Cloud AI Companion API for a project
 *
 * @param projectId - GCP project ID
 * @returns URL to enable the API in the Google Cloud Console
 */
export function getConsoleEnableUrl(projectId: string): string {
  return `${CONSOLE_BASE_URL}/apis/library/${CLOUD_AI_COMPANION_API}?project=${encodeURIComponent(projectId)}`;
}

/**
 * Gets the Google Cloud Console URL for bulk API enabling
 *
 * @returns URL to the API library in Google Cloud Console
 */
export function getBulkConsoleEnableUrl(): string {
  return `${CONSOLE_BASE_URL}/apis/library/${CLOUD_AI_COMPANION_API}`;
}

/**
 * Gets the Google Cloud Console URL for the preview channel
 *
 * @param projectId - GCP project ID
 * @returns URL to the Gemini preview channel console
 */
export function getPreviewChannelConsoleUrl(projectId: string): string {
  return `${CONSOLE_BASE_URL}/gemini/aistudio?project=${encodeURIComponent(projectId)}`;
}

// =============================================================================
// GCP API Enablement Check
// =============================================================================

/**
 * Checks if the Cloud AI Companion API is enabled for a specific project
 *
 * @param projectId - GCP project ID to check
 * @param authToken - OAuth access token for authentication
 * @returns True if the API is enabled, false otherwise
 */
export async function checkApiEnabled(
  projectId: string,
  authToken: string,
): Promise<boolean> {
  const url = `${SERVICE_USAGE_API}/projects/${encodeURIComponent(projectId)}/services/${CLOUD_AI_COMPANION_API}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // 404 means the API is not enabled, other errors we log
      if (response.status !== 404) {
        consoleDebug(
          PREFIX.DEBUG,
          `API check failed for ${projectId}: ${response.status} ${response.statusText}`,
        );
      }
      return false;
    }

    const data: ServiceUsageResponse = await response.json();
    return data.state === "ENABLED";
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `Error checking API status for ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

// =============================================================================
// GCP Project Discovery
// =============================================================================

/**
 * Fetches all active GCP projects for a given token
 *
 * @param token - OAuth token with access credentials
 * @returns Array of GCP projects accessible by this token
 */
async function fetchProjectsForToken(
  token: StoredToken,
): Promise<GcpProject[]> {
  const projects: GcpProject[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${RESOURCE_MANAGER_API}/projects`);
    url.searchParams.set("filter", "lifecycleState:ACTIVE");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        consoleError(
          PREFIX.ERROR,
          `Failed to fetch projects for ${token.email}: ${response.status} ${response.statusText}`,
        );
        break;
      }

      const data: GcpProjectsResponse = await response.json();

      if (data.projects) {
        projects.push(...data.projects);
      }

      pageToken = data.nextPageToken;
    } catch (error) {
      consoleError(
        PREFIX.ERROR,
        `Error fetching projects for ${token.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
  } while (pageToken);

  return projects;
}

/**
 * Gets all GCP projects across all valid tokens, with API enablement status
 *
 * @param forceRefresh - If true, bypasses the cache and fetches fresh data
 * @returns Array of GcpProjectInfo with API enablement status
 */
export async function getAllGcpProjects(
  forceRefresh = false,
): Promise<GcpProjectInfo[]> {
  // Return cached projects if still valid and not forcing refresh
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedProjects.length > 0 &&
    now - projectsCacheTime < PROJECTS_CACHE_DURATION
  ) {
    consoleDebug(
      PREFIX.DEBUG,
      `Returning ${cachedProjects.length} cached GCP projects`,
    );
    return cachedProjects;
  }

  consoleLog(PREFIX.INFO, "Discovering GCP projects...");

  // Get all valid tokens
  const tokensResult = await getValidTokens();
  if (!tokensResult.success) {
    consoleError(
      PREFIX.ERROR,
      `Failed to get valid tokens: ${tokensResult.error}`,
    );
    return cachedProjects; // Return stale cache on error
  }

  const tokens = tokensResult.data;
  if (tokens.length === 0) {
    consoleDebug(
      PREFIX.DEBUG,
      "No valid tokens available for project discovery",
    );
    return [];
  }

  consoleDebug(
    PREFIX.DEBUG,
    `Discovering projects for ${tokens.length} token(s)`,
  );

  const allProjects: GcpProjectInfo[] = [];
  const seenProjectIds = new Set<string>();

  // Fetch projects for each token
  for (const token of tokens) {
    const gcpProjects = await fetchProjectsForToken(token);

    consoleDebug(
      PREFIX.DEBUG,
      `Found ${gcpProjects.length} projects for ${token.email}`,
    );

    // Check API enablement for each project
    for (const project of gcpProjects) {
      // Skip duplicate projects (same project accessible by multiple accounts)
      if (seenProjectIds.has(project.projectId)) {
        continue;
      }
      seenProjectIds.add(project.projectId);

      const apiEnabled = await checkApiEnabled(
        project.projectId,
        token.access_token,
      );

      const projectInfo: GcpProjectInfo = {
        project_id: project.projectId,
        name: project.name,
        project_number: project.projectNumber,
        api_enabled: apiEnabled,
        owner_email: token.email,
        token_id: token.email, // Using email as token identifier
      };

      allProjects.push(projectInfo);
    }
  }

  // Update cache
  cachedProjects = allProjects;
  projectsCacheTime = now;

  consoleLog(
    PREFIX.SUCCESS,
    `Discovered ${allProjects.length} GCP projects (${allProjects.filter((p) => p.api_enabled).length} with API enabled)`,
  );

  return allProjects;
}

/**
 * Gets only GCP projects that have the Cloud AI Companion API enabled
 *
 * @returns Array of GcpProjectInfo where api_enabled is true
 */
export async function getEnabledGcpProjects(): Promise<GcpProjectInfo[]> {
  const projects = await getAllGcpProjects();
  return projects.filter((project) => project.api_enabled);
}

/**
 * Groups GCP projects by their owner email
 *
 * @param projects - Array of projects to group
 * @returns Record mapping owner email to their projects
 */
export function groupProjectsByOwner(
  projects: GcpProjectInfo[],
): Record<string, GcpProjectInfo[]> {
  const grouped: Record<string, GcpProjectInfo[]> = {};

  for (const project of projects) {
    const owner = project.owner_email;
    if (!grouped[owner]) {
      grouped[owner] = [];
    }
    grouped[owner].push(project);
  }

  return grouped;
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Clears the GCP project cache, forcing a refresh on next access
 */
export function invalidateProjectsCache(): void {
  cachedProjects = [];
  projectsCacheTime = 0;
  consoleDebug(PREFIX.DEBUG, "GCP projects cache invalidated");
}

/**
 * Invalidate the project status cache
 * Forces a reload from disk on next access
 */
export function invalidateStatusCache(): void {
  invalidateProjectCache();
  consoleDebug(PREFIX.DEBUG, "Project status cache invalidated");
}

/**
 * Gets the current GCP projects cache status
 *
 * @returns Object with cache status information
 */
export function getProjectsCacheStatus(): {
  cached: boolean;
  count: number;
  age_ms: number;
  expires_in_ms: number;
} {
  const now = Date.now();
  const age = now - projectsCacheTime;
  const expiresIn = Math.max(0, PROJECTS_CACHE_DURATION - age);

  return {
    cached: cachedProjects.length > 0 && age < PROJECTS_CACHE_DURATION,
    count: cachedProjects.length,
    age_ms: projectsCacheTime > 0 ? age : 0,
    expires_in_ms: projectsCacheTime > 0 ? expiresIn : 0,
  };
}
