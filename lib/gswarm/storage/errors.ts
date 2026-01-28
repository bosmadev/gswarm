/**
 * Error Log Storage - File-based persistence for error tracking
 *
 * Provides storage operations for recording, querying, and managing
 * error logs with daily file organization and in-memory caching.
 */

import * as path from "node:path";
import type { StorageResult } from "../types";
import {
  deleteFile,
  getFromCache,
  getStoragePath,
  getTodayDateString,
  invalidateCache,
  invalidateCachePattern,
  listFiles,
  readJsonFile,
  setCache,
  writeJsonFile,
} from "./base";

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

/** Directory for error log files */
export const ERRORS_DIR = "errors";

/** Cache TTL in milliseconds (30 seconds) */
export const ERRORS_CACHE_TTL_MS = 30_000;

/** Maximum errors per day before rotation (prevents unbounded growth) */
export const MAX_ERRORS_PER_DAY = 10_000;

// =============================================================================
// CACHE KEY HELPERS
// =============================================================================

/**
 * Gets the cache key for errors on a specific date
 */
function getErrorsCacheKey(date: string): string {
  return `errors:${date}`;
}

/**
 * Gets the file path for errors on a specific date
 */
export function getErrorsPath(date: string): string {
  return getStoragePath(ERRORS_DIR, `${date}.json`);
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
  const filePath = getErrorsPath(targetDate);
  const cacheKey = getErrorsCacheKey(targetDate);

  // Check cache
  const cached = getFromCache<DailyErrorLog>(cacheKey);
  if (cached) {
    return { success: true, data: cached };
  }

  const result = await readJsonFile<DailyErrorLog>(filePath);

  if (!result.success) {
    if (
      result.error === "File not found" ||
      result.error?.includes("File not found")
    ) {
      const emptyLog = createEmptyDailyErrorLog(targetDate);
      return { success: true, data: emptyLog };
    }
    return result;
  }

  // Update cache
  setCache(cacheKey, result.data, ERRORS_CACHE_TTL_MS);

  return result;
}

/**
 * Records a new error to the log
 */
export async function recordError(
  options: RecordErrorOptions,
): Promise<StorageResult<ErrorLogEntry>> {
  const now = new Date();
  const errorDate = now.toISOString().split("T")[0];
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

  // Write to file
  const filePath = getErrorsPath(errorDate);
  const writeResult = await writeJsonFile(filePath, dailyLog);

  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

  // Update cache
  setCache(getErrorsCacheKey(errorDate), dailyLog, ERRORS_CACHE_TTL_MS);

  return { success: true, data: errorEntry };
}

/**
 * Queries errors with optional filtering
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
  const allErrors: ErrorLogEntry[] = [];

  // Iterate through each day in the range
  const startDt = new Date(start);
  const endDt = new Date(end);

  for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const dailyResult = await loadErrorLog(dateStr);

    if (dailyResult.success && dailyResult.data.errors.length > 0) {
      allErrors.push(...dailyResult.data.errors);
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
  const filePath = getErrorsPath(today);

  const writeResult = await writeJsonFile(filePath, emptyLog);

  if (!writeResult.success) {
    return writeResult;
  }

  // Update cache
  setCache(getErrorsCacheKey(today), emptyLog, ERRORS_CACHE_TTL_MS);

  return { success: true, data: undefined };
}

/**
 * Clears all error logs (all dates)
 */
export async function clearAllErrors(): Promise<StorageResult<number>> {
  const errorsDir = getStoragePath(ERRORS_DIR);
  const listResult = await listFiles(errorsDir, ".json");

  if (!listResult.success) {
    // Directory doesn't exist = nothing to clear
    if (listResult.error?.includes("not found")) {
      return { success: true, data: 0 };
    }
    return { success: false, error: listResult.error };
  }

  let deletedCount = 0;
  const errors: string[] = [];

  for (const file of listResult.data) {
    const filePath = path.join(errorsDir, file);
    const deleteResult = await deleteFile(filePath);

    if (deleteResult.success) {
      deletedCount++;
      // Remove from cache
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (dateMatch) {
        invalidateCache(getErrorsCacheKey(dateMatch[1]));
      }
    } else if (deleteResult.error) {
      errors.push(deleteResult.error);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Deleted ${deletedCount} files but encountered errors: ${errors.join(", ")}`,
    };
  }

  return { success: true, data: deletedCount };
}

/**
 * Cleans up error log files older than the specified number of days
 */
export async function cleanupOldErrors(
  keepDays = 30,
): Promise<StorageResult<number>> {
  const errorsDir = getStoragePath(ERRORS_DIR);
  const listResult = await listFiles(errorsDir, ".json");

  if (!listResult.success) {
    // Directory doesn't exist = nothing to clean
    if (listResult.error?.includes("not found")) {
      return { success: true, data: 0 };
    }
    return { success: false, error: listResult.error };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  let deletedCount = 0;
  const errors: string[] = [];

  for (const file of listResult.data) {
    // Extract date from filename (format: YYYY-MM-DD.json)
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!dateMatch) continue;

    const fileDate = dateMatch[1];
    if (fileDate < cutoffStr) {
      const filePath = path.join(errorsDir, file);
      const deleteResult = await deleteFile(filePath);

      if (deleteResult.success) {
        deletedCount++;
        // Remove from cache
        invalidateCache(getErrorsCacheKey(fileDate));
      } else if (deleteResult.error) {
        errors.push(deleteResult.error);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Deleted ${deletedCount} files but encountered errors: ${errors.join(", ")}`,
    };
  }

  return { success: true, data: deletedCount };
}

/**
 * Invalidate the errors cache for a specific date
 */
export function invalidateErrorsCache(date?: string): void {
  if (date) {
    invalidateCache(getErrorsCacheKey(date));
  } else {
    // Clear all errors cache entries
    invalidateCachePattern(/^errors:/);
  }
}
