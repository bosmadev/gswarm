/**
 * @file lib/gswarm/storage/base.ts
 * @version 2.0
 * @description Base storage utilities for Redis-based persistence.
 *
 * Provides Redis storage operations with:
 * - Native Redis caching (no custom caching layer)
 * - Atomic operations via ioredis
 * - Key-value and hash storage patterns
 * - Compatibility layer for file-based API surface
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import { GSwarmConfigError } from "../errors";
import type { StorageResult } from "../types";
import getRedisClient from "./redis";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * @deprecated Legacy constant from file-based storage.
 * Redis-based storage no longer uses a data directory.
 * Kept for backward compatibility with code that references STORAGE_BASE_DIR.
 */
export const STORAGE_BASE_DIR = "data";

/** Default timeout for Redis operations in milliseconds */
export const DEFAULT_LOCK_TIMEOUT_MS = 5000;

/**
 * @deprecated Use DEFAULT_LOCK_TIMEOUT_MS instead. Kept for backward compatibility.
 */
export const LOCK_TIMEOUT_MS = DEFAULT_LOCK_TIMEOUT_MS;

/** Configurable operation timeout */
let configuredLockTimeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS;

/**
 * Override the default operation timeout.
 *
 * @param timeoutMs - Timeout in milliseconds (must be > 0)
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
 * Get the currently configured operation timeout.
 */
export function getLockTimeout(): number {
	return configuredLockTimeoutMs;
}

// =============================================================================
// CACHE MANAGER (DEPRECATED - REDIS IS THE CACHE)
// =============================================================================

/**
 * @deprecated Generic cache manager is no longer needed with Redis.
 * Redis provides native caching via TTL and key expiration.
 * This class is kept for backward compatibility only.
 *
 * Migration: Replace CacheManager usage with direct Redis operations:
 * - `cache.get()` → `redis.get(key)` + JSON.parse
 * - `cache.set(data)` → `redis.set(key, JSON.stringify(data), 'EX', ttlSeconds)`
 * - `cache.invalidate()` → `redis.del(key)`
 */
export class CacheManager<T> {
	private cache: T | null = null;
	private cacheTime = 0;

	constructor(private ttlMs: number) {
		consoleDebug(
			PREFIX.DEBUG,
			"[DEPRECATED] CacheManager instantiated - consider migrating to Redis TTL",
		);
	}

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

/**
 * Get a logical path within the data namespace.
 *
 * @deprecated This function is kept for backward compatibility.
 * In Redis-based storage, this is used to construct Redis key prefixes,
 * not file system paths.
 *
 * @param segments - Path segments to join
 * @returns Logical path string (used as Redis key prefix)
 */
export function getDataPath(...segments: string[]): string {
	return segments.join("/");
}

/**
 * Alias for getDataPath for backward compatibility
 *
 * @deprecated Use getDataPath() instead
 */
export function getStoragePath(...segments: string[]): string {
	return getDataPath(...segments);
}

// =============================================================================
// REDIS OPERATIONS - COMPATIBILITY LAYER
// =============================================================================

/**
 * Options for reading JSON from Redis
 */
interface ReadJsonOptions {
	/** @deprecated Redis handles caching natively - this option is ignored */
	useCache?: boolean;
	/** @deprecated Redis handles TTL natively - this option is ignored */
	cacheTtlMs?: number;
}

/**
 * Read and parse JSON data from Redis
 *
 * Compatibility wrapper that mimics file-based readJsonFile API.
 * The `filePath` parameter is treated as a Redis key.
 *
 * @param key - Redis key to read from
 * @param options - Read options (ignored - kept for API compatibility)
 * @returns StorageResult with parsed data or error
 */
export async function readJsonFile<T>(
	key: string,
	options: ReadJsonOptions = {},
): Promise<StorageResult<T>> {
	try {
		const redis = getRedisClient();
		const data = await redis.get(key);

		if (data === null) {
			return {
				success: false,
				error: `Key not found: ${key}`,
			};
		}

		const parsed = JSON.parse(data) as T;
		return { success: true, data: parsed };
	} catch (error) {
		const err = error as Error;

		if (err instanceof SyntaxError) {
			consoleError(PREFIX.ERROR, `Invalid JSON in key: ${key}`);
			return {
				success: false,
				error: `Invalid JSON in key: ${key}`,
			};
		}

		consoleError(PREFIX.ERROR, `Failed to read key: ${key}`, err.message);
		return {
			success: false,
			error: `Failed to read key: ${err.message}`,
		};
	}
}

/**
 * Options for writing JSON to Redis
 */
interface WriteJsonOptions {
	/** @deprecated Redis doesn't need pretty-printing - this option is ignored */
	pretty?: boolean;
	/** @deprecated Redis handles cache invalidation automatically - this option is ignored */
	invalidateCache?: boolean;
	/** TTL in seconds for Redis key expiration (optional) */
	ttlSeconds?: number;
}

/**
 * Write data to Redis as JSON
 *
 * Compatibility wrapper that mimics file-based writeJsonFile API.
 * The `filePath` parameter is treated as a Redis key.
 *
 * @param key - Redis key to write to
 * @param data - Data to write
 * @param options - Write options
 * @returns StorageResult indicating success or error
 */
export async function writeJsonFile<T>(
	key: string,
	data: T,
	options: WriteJsonOptions = {},
): Promise<StorageResult<void>> {
	const { ttlSeconds } = options;

	try {
		const redis = getRedisClient();
		const content = JSON.stringify(data);

		if (ttlSeconds !== undefined && ttlSeconds > 0) {
			await redis.set(key, content, "EX", ttlSeconds);
		} else {
			await redis.set(key, content);
		}

		consoleDebug(PREFIX.DEBUG, `Key written: ${key}`);
		return { success: true, data: undefined };
	} catch (error) {
		const err = error as Error;
		consoleError(PREFIX.ERROR, `Failed to write key: ${key}`, err.message);

		return {
			success: false,
			error: `Failed to write key: ${err.message}`,
		};
	}
}

/**
 * Delete a key from Redis
 *
 * @param key - Redis key to delete
 * @returns StorageResult indicating success or error
 */
export async function deleteFile(key: string): Promise<StorageResult<void>> {
	try {
		const redis = getRedisClient();
		await redis.del(key);
		consoleDebug(PREFIX.DEBUG, `Key deleted: ${key}`);
		return { success: true, data: undefined };
	} catch (error) {
		const err = error as Error;
		consoleError(PREFIX.ERROR, `Failed to delete key: ${key}`, err.message);
		return {
			success: false,
			error: `Failed to delete key: ${err.message}`,
		};
	}
}

/**
 * List keys matching a pattern in Redis
 *
 * Compatibility wrapper that mimics file-based listFiles API.
 * Uses Redis SCAN for safe iteration.
 *
 * @param pattern - Redis key pattern (e.g., "oauth-tokens:*")
 * @param extension - Optional filter string (e.g., ".json") - applied as suffix match
 * @returns StorageResult with array of matching keys
 */
export async function listFiles(
	pattern: string,
	extension?: string,
): Promise<StorageResult<string[]>> {
	try {
		const redis = getRedisClient();
		const keys: string[] = [];

		// Use SCAN for safe iteration (no blocking)
		let cursor = "0";
		do {
			const [newCursor, matchedKeys] = await redis.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				100,
			);
			cursor = newCursor;
			keys.push(...matchedKeys);
		} while (cursor !== "0");

		// Apply extension filter if provided
		let filtered = keys;
		if (extension) {
			filtered = keys.filter((key) => key.endsWith(extension));
		}

		return { success: true, data: filtered };
	} catch (error) {
		const err = error as Error;
		consoleError(
			PREFIX.ERROR,
			`Failed to list keys matching: ${pattern}`,
			err.message,
		);
		return {
			success: false,
			error: `Failed to list keys: ${err.message}`,
		};
	}
}

/**
 * Check if a key exists in Redis
 *
 * @param key - Redis key to check
 * @returns StorageResult with boolean indicating existence
 */
export async function fileExists(key: string): Promise<StorageResult<boolean>> {
	try {
		const redis = getRedisClient();
		const exists = await redis.exists(key);
		return { success: true, data: exists === 1 };
	} catch (error) {
		const err = error as Error;
		consoleError(
			PREFIX.ERROR,
			`Failed to check key existence: ${key}`,
			err.message,
		);
		return {
			success: false,
			error: `Failed to check key existence: ${err.message}`,
		};
	}
}

/**
 * Check if a key exists (simple boolean version)
 *
 * @param key - Redis key to check
 * @returns true if key exists, false otherwise (swallows errors)
 * @deprecated Prefer fileExists() which returns StorageResult for proper error handling
 */
export async function fileExistsSimple(key: string): Promise<boolean> {
	const result = await fileExists(key);
	return result.success ? result.data : false;
}

// =============================================================================
// REDIS-SPECIFIC OPERATIONS
// =============================================================================

/**
 * Read a Redis hash and return as object
 *
 * @param key - Redis hash key
 * @returns StorageResult with hash object or error
 */
export async function readHash<T extends Record<string, string>>(
	key: string,
): Promise<StorageResult<T>> {
	try {
		const redis = getRedisClient();
		const data = await redis.hgetall(key);

		if (Object.keys(data).length === 0) {
			return {
				success: false,
				error: `Hash not found: ${key}`,
			};
		}

		return { success: true, data: data as T };
	} catch (error) {
		const err = error as Error;
		consoleError(PREFIX.ERROR, `Failed to read hash: ${key}`, err.message);
		return {
			success: false,
			error: `Failed to read hash: ${err.message}`,
		};
	}
}

/**
 * Write multiple fields to a Redis hash
 *
 * @param key - Redis hash key
 * @param data - Hash fields and values
 * @param ttlSeconds - Optional TTL in seconds
 * @returns StorageResult indicating success or error
 */
export async function writeHash<T extends Record<string, string>>(
	key: string,
	data: T,
	ttlSeconds?: number,
): Promise<StorageResult<void>> {
	try {
		const redis = getRedisClient();
		await redis.hset(key, data);

		if (ttlSeconds !== undefined && ttlSeconds > 0) {
			await redis.expire(key, ttlSeconds);
		}

		consoleDebug(PREFIX.DEBUG, `Hash written: ${key}`);
		return { success: true, data: undefined };
	} catch (error) {
		const err = error as Error;
		consoleError(PREFIX.ERROR, `Failed to write hash: ${key}`, err.message);
		return {
			success: false,
			error: `Failed to write hash: ${err.message}`,
		};
	}
}

// =============================================================================
// DEPRECATED / NO-OP FUNCTIONS
// =============================================================================

/**
 * @deprecated Redis does not need directory structures.
 * This function is a no-op kept for backward compatibility.
 */
export async function ensureDir(dirPath: string): Promise<StorageResult<void>> {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] ensureDir called with ${dirPath} - no-op in Redis storage`,
	);
	return { success: true, data: undefined };
}

/**
 * @deprecated Redis does not need directory structures.
 * This function is a no-op kept for backward compatibility.
 */
export async function ensureDataStructure(): Promise<StorageResult<void>> {
	consoleLog(
		PREFIX.INFO,
		"[DEPRECATED] ensureDataStructure called - no-op in Redis storage",
	);
	return { success: true, data: undefined };
}

/**
 * @deprecated File stats are not applicable to Redis keys.
 * This function throws an error.
 */
export async function getFileStats(
	key: string,
): Promise<StorageResult<never>> {
	return {
		success: false,
		error: `getFileStats is not supported in Redis storage. Use redis.exists("${key}") instead.`,
	};
}

/**
 * @deprecated File locking is not needed with Redis atomic operations.
 * This function is a no-op that always succeeds.
 */
export async function acquireLock(
	key: string,
	timeout?: number,
): Promise<boolean> {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] acquireLock called for ${key} - no-op in Redis storage`,
	);
	return true;
}

/**
 * @deprecated File locking is not needed with Redis atomic operations.
 * This function is a no-op.
 */
export function releaseLock(key: string): void {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] releaseLock called for ${key} - no-op in Redis storage`,
	);
}

/**
 * @deprecated Redis handles caching natively via TTL.
 * This function is a no-op.
 */
export function getFromCache<T>(key: string): T | undefined {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] getFromCache called for ${key} - use Redis GET directly`,
	);
	return undefined;
}

/**
 * @deprecated Redis handles caching natively via TTL.
 * This function is a no-op.
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] setCache called for ${key} - use Redis SET with EX flag directly`,
	);
}

/**
 * @deprecated Redis handles cache invalidation via DEL.
 * This function is a no-op.
 */
export function invalidateCache(key: string): void {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] invalidateCache called for ${key} - use redis.del() directly`,
	);
}

/**
 * @deprecated Redis handles cache pattern invalidation via pattern matching.
 * This function is a no-op.
 */
export function invalidateCachePattern(pattern: RegExp): void {
	consoleDebug(
		PREFIX.DEBUG,
		`[DEPRECATED] invalidateCachePattern called with ${pattern} - use Redis SCAN + DEL directly`,
	);
}

/**
 * @deprecated Redis cache is per-key, not global.
 * This function is a no-op.
 */
export function clearCache(): void {
	consoleDebug(
		PREFIX.DEBUG,
		"[DEPRECATED] clearCache called - no global cache to clear in Redis storage",
	);
}

// =============================================================================
// LEGACY FILE SYSTEM ABSTRACTION (REMOVED)
// =============================================================================

/**
 * @deprecated FileSystem abstraction has been removed.
 * Redis operations do not use a file system interface.
 *
 * For testing, mock the ioredis client directly using libraries like:
 * - ioredis-mock: https://github.com/stipsan/ioredis-mock
 * - redis-memory-server: https://github.com/nodkz/redis-memory-server
 */
export interface FileSystem {
	/** @deprecated */
	readFile(path: string, encoding: BufferEncoding): Promise<string>;
	/** @deprecated */
	writeFile(
		path: string,
		data: string,
		encoding: BufferEncoding,
	): Promise<void>;
	/** @deprecated */
	mkdir(path: string, options?: { recursive: boolean }): Promise<string | undefined>;
	/** @deprecated */
	unlink(path: string): Promise<void>;
	/** @deprecated */
	rename(oldPath: string, newPath: string): Promise<void>;
	/** @deprecated */
	stat(path: string): Promise<{
		size: number;
		birthtime: Date;
		mtime: Date;
		isFile(): boolean;
		isDirectory(): boolean;
	}>;
	/** @deprecated */
	readdir(
		path: string,
		options: { withFileTypes: true },
	): Promise<Array<{ name: string; isFile(): boolean }>>;
}

/**
 * @deprecated FileSystem injection has been removed.
 * Use ioredis mocking libraries for testing instead.
 */
export function setFileSystem(fs: FileSystem | undefined): void {
	throw new Error(
		"setFileSystem is not supported in Redis storage. Mock the Redis client instead using ioredis-mock.",
	);
}

/**
 * @deprecated FileSystem abstraction has been removed.
 */
export function getFileSystem(): FileSystem {
	throw new Error(
		"getFileSystem is not supported in Redis storage. Redis operations do not use a file system interface.",
	);
}

/**
 * @deprecated FileLock interface is no longer needed.
 * Redis operations are atomic.
 */
export interface FileLock {
	filePath: string;
	acquiredAt: number;
}

/**
 * @deprecated FileStats interface is no longer needed.
 * Use redis.exists() or redis.ttl() for key metadata.
 */
export interface FileStats {
	size: number;
	createdAt: Date;
	modifiedAt: Date;
	isFile: boolean;
	isDirectory: boolean;
}
