/**
 * Projects - High-level project management and GCP project discovery
 *
 * This module provides:
 * 1. Local project management (storage-based ProjectInfo)
 * 2. GCP project discovery with Cloud AI Companion API enablement status
 *
 * All consumers should import from this facade module rather than
 * reaching into ./storage/projects directly.
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import {
  createDefaultStatus,
  loadProjectStatuses,
  clearProjectCooldown as storageClearProjectCooldown,
  getAvailableProjects as storageGetAvailableProjects,
  getEnabledProjects as storageGetEnabledProjects,
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
// Re-exports from storage layer
// =============================================================================
// These allow consumers to use the facade instead of bypassing to storage/projects.

export { storageGetEnabledProjects as getEnabledProjects };
export { loadProjectStatuses };

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

/** Default timeout for external API calls (30 seconds) */
const DEFAULT_API_TIMEOUT_MS = 30_000;

// =============================================================================
// In-Memory Cache for GCP Projects
// =============================================================================

/** Cached list of discovered GCP projects */
let cachedProjects: GcpProjectInfo[] = [];

/** Timestamp when GCP projects were last cached */
let projectsCacheTime = 0;

/**
 * In-flight fetch promise — coalesces concurrent callers when the cache is
 * stale so that only one upstream request is issued per cache miss.
 */
let fetchInFlight: Promise<GcpProjectInfo[]> | null = null;

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Creates a fetch request with an AbortController timeout.
 * Automatically aborts if the request exceeds `timeoutMs`.
 */
function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// =============================================================================
// Project Status Operations
// =============================================================================

/**
 * Get project status by ID.
 * Returns null if the project is not found instead of throwing.
 *
 * @param projectId - The unique GCP project identifier
 * @returns The project status, or null if the project is not found
 *
 * @example
 * ```ts
 * const status = await getProjectStatus("my-project-123");
 * if (status) {
 *   console.log("Success count:", status.successCount);
 * }
 * ```
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
 * Get or create project status.
 * Creates a default status if the project does not exist in storage.
 *
 * @param projectId - The unique GCP project identifier
 * @returns The existing or newly created project status
 *
 * @example
 * ```ts
 * const status = await getOrCreateProjectStatus("my-project-123");
 * console.log("Consecutive errors:", status.consecutiveErrors);
 * ```
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
 * Check if a project is currently in cooldown.
 * A project in cooldown should not be selected for new requests.
 *
 * @param projectId - The unique GCP project identifier
 * @returns True if the project is in cooldown, false otherwise
 */
export async function isProjectInCooldown(projectId: string): Promise<boolean> {
  const result = await storageIsProjectInCooldown(projectId);
  return result.success ? result.data : false;
}

/**
 * Get the cooldown end time for a project.
 *
 * @param projectId - The unique GCP project identifier
 * @returns Unix timestamp (ms since epoch) when cooldown expires, or 0 if not in cooldown
 */
export async function getProjectCooldownUntil(
  projectId: string,
): Promise<number> {
  const status = await getProjectStatus(projectId);
  return status?.cooldownUntil ?? 0;
}

/**
 * Update project status with partial updates.
 * Delegates to the storage layer for persistence.
 *
 * @param projectId - The unique GCP project identifier
 * @param updates - Partial project status fields to update
 */
export async function updateProjectStatus(
  projectId: string,
  updates: Partial<ProjectStatus>,
): Promise<void> {
  await storageUpdateProjectStatus(projectId, updates);
}

/**
 * Set a project into cooldown for a specific duration.
 * The project will not be selected for requests until the cooldown expires.
 *
 * @param projectId - The unique GCP project identifier
 * @param durationMs - Cooldown duration in milliseconds (default: 5 minutes)
 */
export async function setProjectCooldown(
  projectId: string,
  durationMs: number = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  const cooldownUntil = Date.now() + durationMs;
  await storageUpdateProjectStatus(projectId, { cooldownUntil });
}

/**
 * Clear a project's cooldown, making it immediately available for selection.
 *
 * @param projectId - The unique GCP project identifier
 * @returns The updated project status, or null if not found
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
 * Record a successful request for a project.
 * Resets consecutive errors and updates success timestamps.
 *
 * @param projectId - The unique GCP project identifier
 * @returns The updated project status, or null on failure
 */
export async function recordProjectSuccess(
  projectId: string,
): Promise<ProjectStatus | null> {
  const result = await storageRecordProjectSuccess(projectId);
  return result.success ? result.data : null;
}

/**
 * Record an error for a project with exponential backoff cooldown.
 * Increments consecutive error count and may trigger cooldown.
 *
 * @param projectId - The unique GCP project identifier
 * @param errorType - The type of error encountered (e.g., "rate_limit", "auth", "server")
 * @param quotaResetTime - Optional Unix timestamp (ms) when the quota resets
 * @returns The updated project status, or null on failure
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
 * Get all available projects (not in cooldown), sorted by LRU.
 *
 * @returns Array of project statuses for available projects
 */
export async function getAvailableProjects(): Promise<ProjectStatus[]> {
  const result = await storageGetAvailableProjects();
  return result.success ? result.data : [];
}

/**
 * Get all projects with exhausted quota.
 *
 * @returns Array of project statuses for quota-exhausted projects
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
    const response = await fetchWithTimeout(url, {
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

    const data: unknown = await response.json();
    const serviceData =
      typeof data === "object" && data !== null
        ? (data as ServiceUsageResponse)
        : null;
    return serviceData?.state === "ENABLED";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout =
      error instanceof DOMException && error.name === "AbortError";
    consoleError(
      PREFIX.ERROR,
      `${isTimeout ? "Timeout" : "Error"} checking API status for ${projectId}: ${message}`,
    );
    return false;
  }
}

// =============================================================================
// GCP Project Discovery
// =============================================================================

/**
 * Fetches all active GCP projects for a given token.
 * Uses pagination and returns partial results on error (pages fetched before failure).
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
      const response = await fetchWithTimeout(url.toString(), {
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

      const rawData: unknown = await response.json();
      const data =
        typeof rawData === "object" && rawData !== null
          ? (rawData as GcpProjectsResponse)
          : null;

      if (data?.projects) {
        projects.push(...data.projects);
      }

      pageToken = data?.nextPageToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout =
        error instanceof DOMException && error.name === "AbortError";
      consoleError(
        PREFIX.ERROR,
        `${isTimeout ? "Timeout" : "Error"} fetching projects for ${token.email}: ${message}`,
      );
      break; // Return whatever pages we successfully fetched
    }
  } while (pageToken);

  return projects;
}

/**
 * Gets all GCP projects across all valid tokens, with API enablement status.
 *
 * - Fetches projects from all tokens in parallel (Promise.allSettled)
 * - Checks API enablement for all discovered projects in parallel
 * - Returns partial results if any individual call fails
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

  // Coalesce concurrent callers: if a fetch is already in-flight, all
  // callers that missed the cache share that single Promise.
  if (fetchInFlight) {
    consoleDebug(PREFIX.DEBUG, "GCP project fetch already in-flight, coalescing");
    return fetchInFlight;
  }

  // Start the fetch and store the Promise so concurrent callers can join it.
  fetchInFlight = (async (): Promise<GcpProjectInfo[]> => {
    try {
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

      // Fetch projects for ALL tokens in parallel
      const tokenResults = await Promise.allSettled(
        tokens.map((token) => fetchProjectsForToken(token)),
      );

      // Deduplicate projects across tokens, tracking which token discovered each
      const seenProjectIds = new Set<string>();
      const projectTokenPairs: { project: GcpProject; token: StoredToken }[] = [];

      tokenResults.forEach((result, i) => {
        const token = tokens[i];
        if (!token) return;

        if (result.status === "rejected") {
          consoleError(
            PREFIX.ERROR,
            `Project discovery failed for ${token.email}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          );
          return; // Skip this token, proceed with others
        }

        const gcpProjects = result.value;
        consoleDebug(
          PREFIX.DEBUG,
          `Found ${gcpProjects.length} projects for ${token.email}`,
        );

        for (const project of gcpProjects) {
          if (seenProjectIds.has(project.projectId)) {
            continue;
          }
          seenProjectIds.add(project.projectId);
          projectTokenPairs.push({ project, token });
        }
      });

      // Check API enablement for ALL unique projects in parallel
      const apiCheckResults = await Promise.allSettled(
        projectTokenPairs.map(({ project, token }) =>
          checkApiEnabled(project.projectId, token.access_token),
        ),
      );

      const allProjects: GcpProjectInfo[] = [];

      projectTokenPairs.forEach(({ project, token }, i) => {
        const apiResult = apiCheckResults[i];
        if (!apiResult) return;

        // If the API check itself rejected, treat as disabled (partial recovery)
        const apiEnabled =
          apiResult.status === "fulfilled" ? apiResult.value : false;

        if (apiResult.status === "rejected") {
          consoleError(
            PREFIX.ERROR,
            `API check rejected for ${project.projectId}: ${apiResult.reason instanceof Error ? apiResult.reason.message : String(apiResult.reason)}`,
          );
        }

        const projectInfo: GcpProjectInfo = {
          project_id: project.projectId,
          name: project.name,
          project_number: project.projectNumber,
          api_enabled: apiEnabled,
          owner_email: token.email,
          token_id: token.email, // Using email as token identifier
        };

        allProjects.push(projectInfo);
      });

      // Update cache
      cachedProjects = allProjects;
      projectsCacheTime = now;

      consoleLog(
        PREFIX.SUCCESS,
        `Discovered ${allProjects.length} GCP projects (${allProjects.filter((p) => p.api_enabled).length} with API enabled)`,
      );

      return allProjects;
    } finally {
      // Always clear the in-flight Promise so subsequent calls start fresh
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
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
  fetchInFlight = null;
  consoleDebug(PREFIX.DEBUG, "GCP projects cache invalidated");
}
