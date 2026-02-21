/**
 * @file lib/gswarm/storage/errors.ts
 * @version 2.0
 * @description Error log storage with Redis persistence and 30-day TTL.
 *
 * Provides storage operations for recording, querying, and managing
 * error logs with daily organization in Redis and in-memory caching.
 * Supports filtering by type, account, project, and date range.
 */

import type { StorageResult } from "../types";
import { getTodayDateString } from "./base";
import { getRedisClient } from "./redis";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Error types for categorization
 */
export type ErrorLogType =
  | "rate_limit"
  | "auth"
  | "api"
  | "network"
  | "validation"
  | "unknown";

/**
 * Individual error log entry
 */
export interface ErrorLogEntry {
  /** Unique error ID */
  id: string;
  /** ISO timestamp when error occurred */
  timestamp: string;
  /** Error category */
  type: ErrorLogType;
  /** Associated project ID (if applicable) */
  projectId: string | null;
  /** Human-readable project name */
  projectName: string | null;
  /** Associated account ID (if applicable) */
  accountId: string | null;
  /** Associated account email */
  accountEmail: string | null;
  /** Error message */
  message: string;
  /** Additional error details */
  details: string | null;
  /** Stack trace (if available) */
  stackTrace: string | null;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Request endpoint (if applicable) */
  endpoint?: string;
  /** Request method (if applicable) */
  method?: string;
}

/**
 * Daily error log file structure
 */
export interface DailyErrorLog {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Array of error entries */
  errors: ErrorLogEntry[];
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Options for recording an error
 */
export interface RecordErrorOptions {
  type: ErrorLogType;
  message: string;
  projectId?: string | null;
  projectName?: string | null;
  accountId?: string | null;
  accountEmail?: string | null;
  details?: string | null;
  stackTrace?: string | null;
  statusCode?: number;
  endpoint?: string;
  method?: string;
}

/**
 * Options for querying errors
 */
export interface QueryErrorsOptions {
  /** Filter by error type */
  type?: ErrorLogType | "all";
  /** Filter by account ID */
  accountId?: string | "all";
  /** Filter by project ID */
  projectId?: string | "all";
  /** Start date (YYYY-MM-DD) for date range query */
  startDate?: string;
  /** End date (YYYY-MM-DD) for date range query */
  endDate?: string;
  /** Maximum number of errors to return */
  limit?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** TTL for error logs in Redis (30 days) */
export const ERRORS_TTL_SECONDS = 2592000; // 30 days

/** Cache TTL in milliseconds (30 seconds) */
export const ERRORS_CACHE_TTL_MS = 30_000;

/** Maximum errors per day before rotation (prevents unbounded growth) */
export const MAX_ERRORS_PER_DAY = 10_000;

// In-memory cache for errors by date (reduces Redis round-trips)
const errorsCacheByDate = new Map<
  string,
  { data: DailyErrorLog; expiresAt: number }
>();

// =============================================================================
// CACHE HELPERS
// =============================================================================

/**
 * Gets cached errors for a specific date if still valid
 */
function getCachedErrors(date: string): DailyErrorLog | null {
  const cached = errorsCacheByDate.get(date);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  errorsCacheByDate.delete(date);
  return null;
}

/**
 * Updates the in-memory cache for a specific date
 */
function setCachedErrors(date: string, data: DailyErrorLog): void {
  errorsCacheByDate.set(date, {
    data,
    expiresAt: Date.now() + ERRORS_CACHE_TTL_MS,
  });
}

/**
 * Evicts all expired entries from the errors cache.
 * Runs on a periodic interval to prevent unbounded Map growth.
 */
function evictExpiredErrors(): void {
  const now = Date.now();
  for (const [key, entry] of errorsCacheByDate.entries()) {
    if (now >= entry.expiresAt) {
      errorsCacheByDate.delete(key);
    }
  }
}

// Periodic cleanup every 5 minutes — prevents unbounded memory growth when
// many distinct dates accumulate (e.g., long-running server instances).
if (typeof setInterval !== "undefined") {
  const interval = setInterval(evictExpiredErrors, 5 * 60 * 1000);
  // Allow process to exit without being held by this timer
  if (
    typeof interval === "object" &&
    interval !== null &&
    "unref" in interval
  ) {
    (interval as NodeJS.Timeout).unref();
  }
}

/**
 * Gets the Redis key for errors on a specific date
 */
export function getErrorsKey(date: string): string {
  return `errors:${date}`;
}

/**
 * Gets the file path for errors on a specific date
 * @deprecated Kept for backward compatibility, use getErrorsKey() instead
 */
export function getErrorsPath(date: string): string {
  return getErrorsKey(date);
}

/**
 * Generates a unique error ID
 */
function generateErrorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `err-${timestamp}-${random}`;
}

/**
 * Creates an empty daily error log
 */
export function createEmptyDailyErrorLog(date: string): DailyErrorLog {
  return {
    date,
    errors: [],
    updated_at: new Date().toISOString(),
  };
}

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Loads error log for a specific date (defaults to today)
 */
export async function loadErrorLog(
  date?: string,
): Promise<StorageResult<DailyErrorLog>> {
  const targetDate = date || getTodayDateString();

  // Check in-memory cache first
  const cached = getCachedErrors(targetDate);
  if (cached) {
    return { success: true, data: cached };
  }

  try {
    const redis = getRedisClient();
    const key = getErrorsKey(targetDate);
    const rawData = await redis.get(key);

    if (!rawData) {
      // No data for this date - return empty log
      const emptyLog = createEmptyDailyErrorLog(targetDate);
      return { success: true, data: emptyLog };
    }

    let data: DailyErrorLog;
    try {
      data = JSON.parse(rawData);
    } catch {
      return {
        success: false,
        error: "Failed to parse stored error log: invalid JSON",
      };
    }

    // Update cache
    setCachedErrors(targetDate, data);

    return { success: true, data };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to load error log: ${error}` };
  }
}

/**
 * Records a new error to the daily log file.
 * Automatically manages log rotation to prevent unbounded growth.
 *
 * @param options - Error details including type, message, and context
 * @returns The created error log entry
 *
 * @example
 * ```ts
 * const result = await recordError({
 *   type: "api",
 *   message: "Generation failed",
 *   projectId: "my-project-123",
 *   statusCode: 500,
 *   endpoint: "/api/gswarm/generate",
 * });
 * ```
 */
export async function recordError(
  options: RecordErrorOptions,
): Promise<StorageResult<ErrorLogEntry>> {
  const now = new Date();
  const errorDate =
    now.toISOString().split("T")[0] ?? now.toISOString().slice(0, 10);
  const loadResult = await loadErrorLog(errorDate);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const dailyLog = loadResult.data;

  // Prevent unbounded growth
  if (dailyLog.errors.length >= MAX_ERRORS_PER_DAY) {
    // Remove oldest errors to make room
    dailyLog.errors = dailyLog.errors.slice(-MAX_ERRORS_PER_DAY + 100);
  }

  // Create error entry
  const errorEntry: ErrorLogEntry = {
    id: generateErrorId(),
    timestamp: now.toISOString(),
    type: options.type,
    projectId: options.projectId ?? null,
    projectName: options.projectName ?? null,
    accountId: options.accountId ?? null,
    accountEmail: options.accountEmail ?? null,
    message: options.message,
    details: options.details ?? null,
    stackTrace: options.stackTrace ?? null,
    statusCode: options.statusCode,
    endpoint: options.endpoint,
    method: options.method,
  };

  // Add to list
  dailyLog.errors.push(errorEntry);
  dailyLog.updated_at = now.toISOString();

  // Write to Redis with 30-day TTL
  try {
    const redis = getRedisClient();
    const key = getErrorsKey(errorDate);
    await redis.set(key, JSON.stringify(dailyLog), "EX", ERRORS_TTL_SECONDS);

    // Update cache
    setCachedErrors(errorDate, dailyLog);

    return { success: true, data: errorEntry };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to record error: ${error}` };
  }
}

/**
 * Queries errors with optional filtering by type, account, project, and date range.
 * Results are sorted by timestamp descending (most recent first).
 *
 * @param options - Query options for filtering and pagination
 * @returns Array of matching error log entries
 *
 * @example
 * ```ts
 * const result = await queryErrors({
 *   type: "rate_limit",
 *   startDate: "2026-01-01",
 *   endDate: "2026-01-31",
 *   limit: 50,
 * });
 * if (result.success) {
 *   console.log(`Found ${result.data.length} rate limit errors`);
 * }
 * ```
 */
export async function queryErrors(
  options: QueryErrorsOptions = {},
): Promise<StorageResult<ErrorLogEntry[]>> {
  const {
    type,
    accountId,
    projectId,
    startDate,
    endDate,
    limit = 1000,
  } = options;

  const start = startDate || getTodayDateString();
  const end = endDate || getTodayDateString();

  // Collect all dates in the range
  const dates: string[] = [];
  const startDt = new Date(start);
  const endDt = new Date(end);

  for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0] ?? d.toISOString().slice(0, 10));
  }

  // Load all days in parallel
  const settled = await Promise.allSettled(
    dates.map((dateStr) => loadErrorLog(dateStr)),
  );

  const allErrors: ErrorLogEntry[] = [];
  for (const dayResult of settled) {
    if (
      dayResult.status === "fulfilled" &&
      dayResult.value.success &&
      dayResult.value.data.errors.length > 0
    ) {
      allErrors.push(...dayResult.value.data.errors);
    }
  }

  // Apply filters
  let filtered = allErrors;

  if (type && type !== "all") {
    filtered = filtered.filter((e) => e.type === type);
  }

  if (accountId && accountId !== "all") {
    filtered = filtered.filter((e) => e.accountId === accountId);
  }

  if (projectId && projectId !== "all") {
    filtered = filtered.filter((e) => e.projectId === projectId);
  }

  // Sort by timestamp descending (most recent first)
  filtered.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Apply limit
  if (limit && filtered.length > limit) {
    filtered = filtered.slice(0, limit);
  }

  return { success: true, data: filtered };
}

/**
 * Gets error counts grouped by type for a date range
 */
export async function getErrorCountsByType(
  startDate?: string,
  endDate?: string,
): Promise<StorageResult<Record<ErrorLogType, number>>> {
  const queryResult = await queryErrors({ startDate, endDate, limit: 100_000 });

  if (!queryResult.success) {
    return { success: false, error: queryResult.error };
  }

  const counts: Record<ErrorLogType, number> = {
    rate_limit: 0,
    auth: 0,
    api: 0,
    network: 0,
    validation: 0,
    unknown: 0,
  };

  for (const error of queryResult.data) {
    counts[error.type] = (counts[error.type] || 0) + 1;
  }

  return { success: true, data: counts };
}

/**
 * Clears all errors for today
 */
export async function clearTodaysErrors(): Promise<StorageResult<void>> {
  const today = getTodayDateString();
  const emptyLog = createEmptyDailyErrorLog(today);

  try {
    const redis = getRedisClient();
    const key = getErrorsKey(today);
    await redis.set(key, JSON.stringify(emptyLog), "EX", ERRORS_TTL_SECONDS);

    // Update cache
    setCachedErrors(today, emptyLog);

    return { success: true, data: undefined };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to clear today's errors: ${error}`,
    };
  }
}

/**
 * Clears all error logs (all dates)
 * @deprecated With Redis TTL, this requires scanning all keys which is slow. Use clearTodaysErrors() instead.
 */
export async function clearAllErrors(): Promise<StorageResult<number>> {
  try {
    const redis = getRedisClient();
    let cursor = "0";
    let deletedCount = 0;

    // Scan for all errors:* keys and delete them
    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "errors:*",
        "COUNT",
        100,
      );
      cursor = newCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;

        // Invalidate cache for deleted keys
        for (const key of keys) {
          const dateMatch = key.match(/^errors:(\d{4}-\d{2}-\d{2})$/);
          if (dateMatch) {
            errorsCacheByDate.delete(dateMatch[1]!);
          }
        }
      }
    } while (cursor !== "0");

    return { success: true, data: deletedCount };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to clear all errors: ${error}` };
  }
}

/**
 * Cleans up error log files older than the specified number of days
 * @deprecated With Redis TTL, cleanup happens automatically. This is a no-op for compatibility.
 */
export async function cleanupOldErrors(
  _keepDays = 30,
): Promise<StorageResult<number>> {
  // Redis TTL handles automatic cleanup - no manual intervention needed
  // Return success with 0 deleted files for backward compatibility
  return { success: true, data: 0 };
}

/**
 * Invalidate the errors cache for a specific date
 */
export function invalidateErrorsCache(date?: string): void {
  if (date) {
    errorsCacheByDate.delete(date);
  } else {
    // Clear all errors cache entries
    errorsCacheByDate.clear();
  }
}
