/**
 * Base Storage Utilities
 *
 * Provides file-based storage operations with:
 * - In-memory caching with TTL support
 * - Simple optimistic file locking
 * - Atomic file writes (temp file + rename)
 * - Directory structure management
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import type { StorageResult } from "../types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Root directory for all data storage */
export const DATA_DIR = path.join(process.cwd(), "data");

/** Alias for DATA_DIR for backward compatibility */
export const STORAGE_BASE_DIR = DATA_DIR;

/** Default timeout for file locks in milliseconds */
export const LOCK_TIMEOUT_MS = 5000;

// =============================================================================
// IN-MEMORY CACHE SYSTEM
// =============================================================================

/**
 * Cache entry with data, load timestamp, and TTL
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Timestamp when data was loaded */
  loadedAt: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

/** In-memory cache storage */
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get data from cache if it exists and hasn't expired
 *
 * @param key - Cache key
 * @returns Cached data or undefined if not found/expired
 */
export function getFromCache<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return undefined;
  }

  const now = Date.now();
  const isExpired = now - entry.loadedAt > entry.ttlMs;

  if (isExpired) {
    cache.delete(key);
    consoleDebug(PREFIX.DEBUG, `Cache expired for key: ${key}`);
    return undefined;
  }

  consoleDebug(PREFIX.DEBUG, `Cache hit for key: ${key}`);
  return entry.data;
}

/**
 * Store data in cache with TTL
 *
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttlMs - Time-to-live in milliseconds
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, {
    data,
    loadedAt: Date.now(),
    ttlMs,
  });
  consoleDebug(PREFIX.DEBUG, `Cache set for key: ${key} (TTL: ${ttlMs}ms)`);
}

/**
 * Remove a specific key from cache
 *
 * @param key - Cache key to invalidate
 */
export function invalidateCache(key: string): void {
  const deleted = cache.delete(key);
  if (deleted) {
    consoleDebug(PREFIX.DEBUG, `Cache invalidated for key: ${key}`);
  }
}

/**
 * Invalidate all cache entries matching a pattern
 *
 * @param pattern - RegExp pattern to match keys
 */
export function invalidateCachePattern(pattern: RegExp): void {
  let count = 0;
  for (const key of cache.keys()) {
    if (pattern.test(key)) {
      cache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    consoleDebug(
      PREFIX.DEBUG,
      `Cache invalidated ${count} entries matching pattern: ${pattern}`,
    );
  }
}

/**
 * Clear all entries from cache
 */
export function clearCache(): void {
  const size = cache.size;
  cache.clear();
  consoleDebug(PREFIX.DEBUG, `Cache cleared (${size} entries removed)`);
}

// =============================================================================
// FILE LOCKING (SIMPLE OPTIMISTIC)
// =============================================================================

/**
 * Represents an acquired file lock
 */
export interface FileLock {
  /** Path to the locked file */
  filePath: string;
  /** Timestamp when lock was acquired */
  acquiredAt: number;
}

/** Active locks storage */
const activeLocks = new Map<string, FileLock>();

/**
 * Attempt to acquire a lock on a file
 *
 * Uses simple optimistic locking - checks if lock exists and is not timed out.
 * This is not a distributed lock and only works within a single process.
 *
 * @param filePath - Path to file to lock
 * @param timeout - Lock timeout in milliseconds (default: LOCK_TIMEOUT_MS)
 * @returns true if lock acquired, false if already locked
 */
export async function acquireLock(
  filePath: string,
  timeout: number = LOCK_TIMEOUT_MS,
): Promise<boolean> {
  const normalizedPath = path.resolve(filePath);
  const existingLock = activeLocks.get(normalizedPath);
  const now = Date.now();

  // Check if existing lock has timed out
  if (existingLock) {
    const lockAge = now - existingLock.acquiredAt;
    if (lockAge < timeout) {
      consoleDebug(
        PREFIX.DEBUG,
        `Lock acquisition failed for ${normalizedPath} - already locked`,
      );
      return false;
    }
    // Lock has timed out, release it
    consoleDebug(
      PREFIX.DEBUG,
      `Releasing timed out lock for ${normalizedPath}`,
    );
    activeLocks.delete(normalizedPath);
  }

  // Acquire new lock
  activeLocks.set(normalizedPath, {
    filePath: normalizedPath,
    acquiredAt: now,
  });

  consoleDebug(PREFIX.DEBUG, `Lock acquired for ${normalizedPath}`);
  return true;
}

/**
 * Release a file lock
 *
 * @param filePath - Path to file to unlock
 */
export function releaseLock(filePath: string): void {
  const normalizedPath = path.resolve(filePath);
  const deleted = activeLocks.delete(normalizedPath);
  if (deleted) {
    consoleDebug(PREFIX.DEBUG, `Lock released for ${normalizedPath}`);
  }
}

// =============================================================================
// FILE OPERATIONS
// =============================================================================

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dirPath - Directory path to ensure exists
 * @returns StorageResult indicating success or error
 */
export async function ensureDir(dirPath: string): Promise<StorageResult<void>> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true, data: undefined };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Ignore EEXIST errors
    if (err.code === "EEXIST") {
      return { success: true, data: undefined };
    }
    return {
      success: false,
      error: `Failed to create directory: ${err.message}`,
    };
  }
}

/**
 * Ensure the standard data directory structure exists
 *
 * Creates:
 * - data/
 * - data/oauth-tokens/
 * - data/metrics/
 * - data/errors/
 */
export async function ensureDataStructure(): Promise<StorageResult<void>> {
  const directories = [
    DATA_DIR,
    path.join(DATA_DIR, "oauth-tokens"),
    path.join(DATA_DIR, "metrics"),
    path.join(DATA_DIR, "errors"),
  ];

  for (const dir of directories) {
    const result = await ensureDir(dir);
    if (!result.success) {
      return result;
    }
  }

  consoleLog(PREFIX.INFO, "Data directory structure ensured");
  return { success: true, data: undefined };
}

/**
 * Get a path within the data directory
 *
 * @param segments - Path segments to join with DATA_DIR
 * @returns Full path within data directory
 */
export function getDataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}

/**
 * Alias for getDataPath for backward compatibility
 *
 * @param segments - Path segments to join with DATA_DIR
 * @returns Full path within data directory
 */
export function getStoragePath(...segments: string[]): string {
  return getDataPath(...segments);
}

/**
 * File stats result
 */
export interface FileStats {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * Get file statistics
 *
 * @param filePath - Path to the file
 * @returns StorageResult with file stats or error
 */
export async function getFileStats(
  filePath: string,
): Promise<StorageResult<FileStats>> {
  try {
    const stat = await fs.stat(filePath);
    return {
      success: true,
      data: {
        size: stat.size,
        createdAt: stat.birthtime,
        modifiedAt: stat.mtime,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
      },
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }
    return {
      success: false,
      error: `Failed to get file stats: ${err.message}`,
    };
  }
}

/**
 * Options for reading JSON files
 */
interface ReadJsonOptions {
  /** Use cache if available */
  useCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Read and parse a JSON file
 *
 * @param filePath - Path to JSON file
 * @param options - Read options
 * @returns StorageResult with parsed data or error
 */
export async function readJsonFile<T>(
  filePath: string,
  options: ReadJsonOptions = {},
): Promise<StorageResult<T>> {
  const { useCache = false, cacheTtlMs = 60000 } = options;

  // Check cache first
  if (useCache) {
    const cached = getFromCache<T>(filePath);
    if (cached !== undefined) {
      return { success: true, data: cached };
    }
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as T;

    // Store in cache if requested
    if (useCache) {
      setCache(filePath, data, cacheTtlMs);
    }

    return { success: true, data };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    if (err instanceof SyntaxError) {
      consoleError(PREFIX.ERROR, `Invalid JSON in file: ${filePath}`);
      return {
        success: false,
        error: `Invalid JSON in file: ${filePath}`,
      };
    }

    consoleError(PREFIX.ERROR, `Failed to read file: ${filePath}`, err.message);
    return {
      success: false,
      error: `Failed to read file: ${err.message}`,
    };
  }
}

/**
 * Options for writing JSON files
 */
interface WriteJsonOptions {
  /** Pretty print JSON with indentation */
  pretty?: boolean;
  /** Invalidate cache after write */
  invalidateCache?: boolean;
}

/**
 * Write data to a JSON file atomically
 *
 * Uses atomic write pattern: write to temp file, then rename.
 * This prevents partial writes on crash/interruption.
 *
 * @param filePath - Path to JSON file
 * @param data - Data to write
 * @param options - Write options
 * @returns StorageResult indicating success or error
 */
export async function writeJsonFile<T>(
  filePath: string,
  data: T,
  options: WriteJsonOptions = {},
): Promise<StorageResult<void>> {
  const { pretty = true, invalidateCache: shouldInvalidate = true } = options;

  const tempPath = `${filePath}.tmp.${Date.now()}`;

  try {
    // Ensure parent directory exists
    const dirPath = path.dirname(filePath);
    const ensureResult = await ensureDir(dirPath);
    if (!ensureResult.success) {
      return ensureResult;
    }

    // Serialize data
    const content = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    // Write to temp file
    await fs.writeFile(tempPath, content, "utf-8");

    // Atomic rename
    await fs.rename(tempPath, filePath);

    // Invalidate cache if requested
    if (shouldInvalidate) {
      invalidateCache(filePath);
    }

    consoleDebug(PREFIX.DEBUG, `File written: ${filePath}`);
    return { success: true, data: undefined };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    consoleError(
      PREFIX.ERROR,
      `Failed to write file: ${filePath}`,
      err.message,
    );

    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: `Failed to write file: ${err.message}`,
    };
  }
}

/**
 * Delete a file
 *
 * @param filePath - Path to file to delete
 * @returns StorageResult indicating success or error
 */
export async function deleteFile(
  filePath: string,
): Promise<StorageResult<void>> {
  try {
    await fs.unlink(filePath);
    invalidateCache(filePath);
    consoleDebug(PREFIX.DEBUG, `File deleted: ${filePath}`);
    return { success: true, data: undefined };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      // File doesn't exist - consider this success
      return { success: true, data: undefined };
    }

    consoleError(
      PREFIX.ERROR,
      `Failed to delete file: ${filePath}`,
      err.message,
    );
    return {
      success: false,
      error: `Failed to delete file: ${err.message}`,
    };
  }
}

/**
 * List files in a directory
 *
 * @param dirPath - Directory to list
 * @param extension - Optional file extension filter (e.g., ".json")
 * @returns StorageResult with array of file names
 */
export async function listFiles(
  dirPath: string,
  extension?: string,
): Promise<StorageResult<string[]>> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    if (extension) {
      files = files.filter((file) => file.endsWith(extension));
    }

    return { success: true, data: files };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      // Directory doesn't exist - return empty array
      return { success: true, data: [] };
    }

    consoleError(
      PREFIX.ERROR,
      `Failed to list directory: ${dirPath}`,
      err.message,
    );
    return {
      success: false,
      error: `Failed to list directory: ${err.message}`,
    };
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
