/**
 * Token Auto-Refresh Service
 *
 * Uses node-cron to schedule periodic token refresh.
 * Works both locally and on Azure VM (repo-level solution).
 *
 * Features:
 * - Scheduled refresh every 30 minutes
 * - Manual refresh trigger via API
 * - Graceful error handling with logging
 */

import { type ScheduledTask, schedule } from "node-cron";
import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import { refreshAccessToken } from "./oauth";
import {
  getTokensNeedingRefresh,
  invalidateTokenCache,
  loadToken,
  saveToken,
} from "./storage/tokens";
import type { StoredToken, TokenRefreshResult } from "./types";

// =============================================================================
// Constants
// =============================================================================

/** Cron schedule: every 30 minutes */
const REFRESH_SCHEDULE = "*/30 * * * *";

/** Buffer time before expiry to trigger refresh (5 minutes in ms) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// =============================================================================
// State
// =============================================================================

/** Scheduled cron job instance */
let refreshJob: ScheduledTask | null = null;

/** Whether the service is currently running a refresh cycle */
let isRefreshing = false;

/** Timestamp of last refresh attempt */
let lastRefreshAttempt = 0;

/** Timestamp of last successful refresh */
let lastSuccessfulRefresh = 0;

// =============================================================================
// Core Refresh Logic
// =============================================================================

/**
 * Refreshes a single token
 *
 * @param token - Token to refresh
 * @returns Refresh result with success status and details
 */
async function refreshSingleToken(
  token: StoredToken,
): Promise<TokenRefreshResult> {
  const email = token.email;

  try {
    consoleDebug(PREFIX.DEBUG, `Refreshing token for ${email}`);

    // Refresh using OAuth module
    const newTokenData = await refreshAccessToken(token);

    if (!newTokenData) {
      return {
        success: false,
        email,
        error: "Refresh returned null (no refresh_token or API error)",
      };
    }

    // Save the refreshed token
    const saveResult = await saveToken(email, newTokenData);

    if (!saveResult.success) {
      return {
        success: false,
        email,
        error: `Failed to save refreshed token: ${saveResult.error}`,
      };
    }

    consoleLog(PREFIX.SUCCESS, `Token refreshed for ${email}`);

    return {
      success: true,
      email,
      new_expiry: newTokenData.expiry_timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to refresh token for ${email}: ${errorMessage}`,
    );

    return {
      success: false,
      email,
      error: errorMessage,
    };
  }
}

/**
 * Runs a refresh cycle for all tokens needing refresh.
 * Skips if a refresh cycle is already in progress.
 *
 * @returns Array of refresh results for each token processed, or empty array if skipped
 *
 * @example
 * ```ts
 * const results = await runRefreshCycle();
 * const succeeded = results.filter(r => r.success).length;
 * console.log(`Refreshed ${succeeded} tokens`);
 * ```
 */
export async function runRefreshCycle(): Promise<TokenRefreshResult[]> {
  if (isRefreshing) {
    consoleDebug(PREFIX.DEBUG, "Refresh cycle already in progress, skipping");
    return [];
  }

  isRefreshing = true;
  lastRefreshAttempt = Date.now();

  try {
    consoleDebug(PREFIX.DEBUG, "Starting token refresh cycle");

    // Get tokens that need refresh
    const needsRefreshResult = await getTokensNeedingRefresh(REFRESH_BUFFER_MS);

    if (!needsRefreshResult.success) {
      consoleError(
        PREFIX.ERROR,
        `Failed to get tokens: ${needsRefreshResult.error}`,
      );
      return [];
    }

    const tokensToRefresh = needsRefreshResult.data;

    if (tokensToRefresh.length === 0) {
      consoleDebug(PREFIX.DEBUG, "No tokens need refresh");
      return [];
    }

    consoleLog(PREFIX.INFO, `Refreshing ${tokensToRefresh.length} tokens`);

    // Refresh all tokens in parallel
    const settled = await Promise.allSettled(
      tokensToRefresh.map((token) => refreshSingleToken(token)),
    );

    const results: TokenRefreshResult[] = settled.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        success: false,
        email: "unknown",
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    });

    // Count results
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    if (succeeded > 0) {
      lastSuccessfulRefresh = Date.now();
      // Invalidate cache to pick up refreshed tokens
      invalidateTokenCache();
    }

    consoleLog(
      PREFIX.INFO,
      `Token refresh cycle complete: ${succeeded} succeeded, ${failed} failed`,
    );

    return results;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Refreshes a specific token by email address.
 *
 * @param email - Email address of the token to refresh
 * @returns Refresh result with success status, email, new expiry, or error
 * @throws Never throws; errors are returned in the result object
 *
 * @example
 * ```ts
 * const result = await refreshTokenByEmail("user@example.com");
 * if (result.success) {
 *   console.log("New expiry:", result.new_expiry);
 * }
 * ```
 */
export async function refreshTokenByEmail(
  email: string,
): Promise<TokenRefreshResult> {
  const loadResult = await loadToken(email);

  if (!loadResult.success) {
    return {
      success: false,
      email,
      error: `Token not found: ${loadResult.error}`,
    };
  }

  return refreshSingleToken(loadResult.data);
}

// =============================================================================
// Service Management
// =============================================================================

/**
 * Starts the token refresh service
 *
 * Schedules a cron job to run every 30 minutes.
 * Safe to call multiple times - will not create duplicate jobs.
 */
export function startRefreshService(): void {
  if (refreshJob) {
    consoleDebug(PREFIX.DEBUG, "Token refresh service already running");
    return;
  }

  consoleLog(
    PREFIX.INFO,
    "Starting token refresh service (schedule: every 30 min)",
  );

  refreshJob = schedule(REFRESH_SCHEDULE, async () => {
    consoleDebug(PREFIX.DEBUG, "Cron trigger: running scheduled token refresh");
    await runRefreshCycle();
  });

  // Run initial refresh on startup (with delay to let app boot)
  setTimeout(() => {
    consoleDebug(PREFIX.DEBUG, "Running initial token refresh on startup");
    runRefreshCycle();
  }, 5000);
}

/**
 * Stops the token refresh service
 */
export function stopRefreshService(): void {
  if (refreshJob) {
    refreshJob.stop();
    refreshJob = null;
    consoleLog(PREFIX.INFO, "Token refresh service stopped");
  }
}

/**
 * Gets the status of the refresh service
 *
 * @returns Service status object
 */
export function getRefreshServiceStatus(): {
  running: boolean;
  isRefreshing: boolean;
  lastRefreshAttempt: number;
  lastSuccessfulRefresh: number;
  schedule: string;
} {
  return {
    running: refreshJob !== null,
    isRefreshing,
    lastRefreshAttempt,
    lastSuccessfulRefresh,
    schedule: REFRESH_SCHEDULE,
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  startRefreshService,
  stopRefreshService,
  runRefreshCycle,
  refreshTokenByEmail,
  getRefreshServiceStatus,
};
