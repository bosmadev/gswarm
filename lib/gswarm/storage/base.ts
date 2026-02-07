/**
 * @file lib/gswarm/storage/base.ts
 * @version 1.0
 * @description Base storage utilities for file-based persistence.
 *
 * Provides file-based storage operations with:
 * - In-memory caching with TTL support
 * - Simple optimistic file locking
 * - Atomic file writes (temp file + rename)
 * - Directory structure management
 * - Injectable FileSystem for testability
 */

import * as nodeFs from "node:fs/promises";
import * as path from "node:path";
import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import { GSwarmConfigError } from "../errors";
import type { StorageResult } from "../types";

// =============================================================================
// FILE SYSTEM ABSTRACTION
// =============================================================================

/**
 * Abstraction over async file system operations.
 * Defaults to Node.js `fs/promises`. Pass a custom implementation
 * for testing or alternative storage backends.
 */
export interface FileSystem {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(
    path: string,
    data: string,
    encoding: BufferEncoding,
  ): Promise<void>;
  mkdir(
    path: string,
    options?: { recursive: boolean },
  ): Promise<string | undefined>;
  unlink(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(path: string): Promise<{
    size: number;
    birthtime: Date;
    mtime: Date;
    isFile(): boolean;
    isDirectory(): boolean;
  }>;
  readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Array<{ name: string; isFile(): boolean }>>;
}

/** Default file system backed by Node.js fs/promises */
const defaultFs: FileSystem = {
  readFile: (p, enc) => nodeFs.readFile(p, enc) as Promise<string>,
  writeFile: (p, data, enc) => nodeFs.writeFile(p, data, enc),
  mkdir: (p, opts) => nodeFs.mkdir(p, opts),
  unlink: (p) => nodeFs.unlink(p),
  rename: (oldP, newP) => nodeFs.rename(oldP, newP),
  stat: (p) => nodeFs.stat(p),
  readdir: (p, opts) =>
    nodeFs.readdir(p, opts) as Promise<
      Array<{ name: string; isFile(): boolean }>
    >,
};

/** Module-level file system instance, replaceable via `setFileSystem` */
let activeFs: FileSystem = defaultFs;

/**
 * Replace the file system implementation used by all storage operations.
 * Primarily intended for testing. Pass `undefined` to restore the default.
 *
 * @param fs - Custom file system or undefined to reset
 */
export function setFileSystem(fs: FileSystem | undefined): void {
  activeFs = fs ?? defaultFs;
}

/**
 * Get the currently active file system implementation.
 */
export function getFileSystem(): FileSystem {
  return activeFs;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Root directory for all data storage */
const DATA_DIR = path.join(process.cwd(), "data");

/** Public export for storage base directory */
export const STORAGE_BASE_DIR = DATA_DIR;

/** Default timeout for file locks in milliseconds */
export const DEFAULT_LOCK_TIMEOUT_MS = 5000;

/**
 * @deprecated Use DEFAULT_LOCK_TIMEOUT_MS instead. Kept for backward compatibility.
 */
export const LOCK_TIMEOUT_MS = DEFAULT_LOCK_TIMEOUT_MS;

/** Configurable lock timeout -- call `setLockTimeout` to override */
let configuredLockTimeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS;

/**
 * Override the default lock timeout used when no explicit timeout is passed.
 *
 * @param timeoutMs - Lock timeout in milliseconds (must be > 0)
 */
export function setLockTimeout(timeoutMs: number): void {
  if (timeoutMs <= 0) {
    throw new GSwarmConfigError("Lock timeout must be a positive number", {
      configKey: "lockTimeout",
    });
  }
  configuredLockTimeoutMs = timeoutMs;
}

/**
 * Get the currently configured lock timeout.
 */
export function getLockTimeout(): number {
  return configuredLockTimeoutMs;
}

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

/**
 * Generic cache manager for storage modules
 * Provides TTL-based caching with invalidation support
 */
export class CacheManager<T> {
  private cache: T | null = null;
  private cacheTime = 0;

  constructor(private ttlMs: number) {}

  get(): T | null {
    if (this.cache && Date.now() - this.cacheTime < this.ttlMs) {
      return this.cache;
    }
    return null;
  }

  set(data: T): void {
    this.cache = data;
    this.cacheTime = Date.now();
  }

  invalidate(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  isValid(): boolean {
    return this.cache !== null && Date.now() - this.cacheTime < this.ttlMs;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get today's date as YYYY-MM-DD string
 */
export function getTodayDateString(): string {
  const datePart = new Date().toISOString().split("T")[0];
  if (!datePart) {
    return new Date().toISOString().slice(0, 10);
  }
  return datePart;
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
 * @param timeout - Lock timeout in milliseconds (default: configurable via setLockTimeout)
 * @returns true if lock acquired, false if already locked
 */
export async function acquireLock(
  filePath: string,
  timeout: number = configuredLockTimeoutMs,
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
    await activeFs.mkdir(dirPath, { recursive: true });
    return { success: true, data: undefined };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Ignore EEXIST errors
    if (err.code === "EEXIST") {
      return { success: true, data: undefined };
    }
    consoleError(
      PREFIX.ERROR,
      `Failed to create directory: ${dirPath}`,
      err.message,
    );
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
    const stat = await activeFs.stat(filePath);
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
    consoleError(
      PREFIX.ERROR,
      `Failed to get file stats: ${filePath}`,
      err.message,
    );
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
    const content = await activeFs.readFile(filePath, "utf-8");
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
    await activeFs.writeFile(tempPath, content, "utf-8");

    // Atomic rename
    await activeFs.rename(tempPath, filePath);

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
      await activeFs.unlink(tempPath);
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
    await activeFs.unlink(filePath);
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
    const entries = await activeFs.readdir(dirPath, { withFileTypes: true });
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
 * @returns StorageResult with boolean indicating existence
 */
export async function fileExists(
  filePath: string,
): Promise<StorageResult<boolean>> {
  try {
    const stat = await activeFs.stat(filePath);
    return { success: true, data: stat.isFile() };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return { success: true, data: false };
    }
    consoleError(
      PREFIX.ERROR,
      `Failed to check file existence: ${filePath}`,
      err.message,
    );
    return {
      success: false,
      error: `Failed to check file existence: ${err.message}`,
    };
  }
}

/**
 * Check if a file exists (simple boolean version)
 *
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise (swallows errors)
 * @deprecated Prefer fileExists() which returns StorageResult for proper error handling
 */
export async function fileExistsSimple(filePath: string): Promise<boolean> {
  const result = await fileExists(filePath);
  return result.success ? result.data : false;
}
