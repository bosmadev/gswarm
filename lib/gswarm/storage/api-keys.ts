/**
 * @file lib/gswarm/storage/api-keys.ts
 * @version 1.0
 * @description API key management with in-memory rate limiting.
 *
 * Provides CRUD operations for API keys, hashed storage, IP/endpoint
 * allowlisting, and atomic in-memory rate limit enforcement.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { storageError, storageSuccess } from "../schemas";
import type {
  ApiKeyConfig,
  ApiKeyValidationResult,
  StorageResult,
} from "../types";
import { getRedisClient } from "./redis";

// =============================================================================
// Constants
// =============================================================================

/** Redis key for API keys JSON storage */
const REDIS_API_KEYS_KEY = "gswarm:api-keys";

/** Redis key prefix for rate limiting counters */
const REDIS_RATE_LIMIT_PREFIX = "gswarm:rate-limit";

/** Rate limit window duration in seconds (1 minute) */
const RATE_LIMIT_WINDOW_SEC = 60;

// =============================================================================
// Rate Limiting Helper
// =============================================================================

/**
 * Gets the current minute timestamp for rate limiting windows
 * @returns Unix timestamp truncated to the current minute
 */
function getCurrentMinute(): number {
  return Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SEC);
}

// =============================================================================
// Types
// =============================================================================

/**
 * API keys storage structure (stored in Redis as JSON)
 */
export interface ApiKeysStore {
  /** List of API key configurations */
  keys: ApiKeyConfig[];

  /** Unix timestamp when the store was last updated */
  updated_at: number;
}

// =============================================================================
// Redis Storage Operations
// =============================================================================

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generates a cryptographic salt for HMAC-SHA256 key hashing.
 * @returns A 16-byte random salt as a hex string
 */
export function generateKeySalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Hashes an API key using HMAC-SHA256 with a per-key salt.
 * Falls back to plain SHA256 when no salt is provided (legacy compatibility).
 *
 * @param key - The raw API key to hash
 * @param salt - Per-key salt for HMAC-SHA256 (omit for legacy plain SHA256)
 * @returns The hash as a hex string
 */
export function hashApiKey(key: string, salt?: string): string {
  if (salt) {
    return createHmac("sha256", salt).update(key).digest("hex");
  }
  // Legacy fallback: plain SHA256 for keys created before salted hashing
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Timing-safe comparison of an API key against a stored hash + optional salt.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param key - The raw API key to verify
 * @param storedHash - The stored hash to compare against
 * @param salt - Per-key salt (omit for legacy plain SHA256 keys)
 * @returns true if the key matches the stored hash
 */
export function verifyApiKey(
  key: string,
  storedHash: string,
  salt?: string,
): boolean {
  const candidateHash = hashApiKey(key, salt);
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Generates a new API key with the specified prefix
 * @param prefix - The prefix for the key (default: "gswarm")
 * @returns A new API key in the format: sk-{prefix}-{32-char-random}
 */
export function generateApiKey(
  prefix = process.env.GLOBAL_APP_NAME ?? "gswarm",
): string {
  const randomPart = randomBytes(16).toString("hex");
  return `sk-${prefix}-${randomPart}`;
}

/**
 * Masks an API key for safe logging
 * @param key - The API key to mask
 * @returns The masked key showing only prefix and last 4 characters
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return "****";
  }
  const prefix = key.slice(0, 8);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Loads the API keys store from Redis
 */
async function loadApiKeysStore(): Promise<StorageResult<ApiKeysStore>> {
  try {
    const redis = getRedisClient();
    const data = await redis.get(REDIS_API_KEYS_KEY);

    if (!data) {
      // Initialize empty store
      const emptyStore: ApiKeysStore = {
        keys: [],
        updated_at: Date.now(),
      };
      return { success: true, data: emptyStore };
    }

    let parsed: ApiKeysStore;
    try {
      parsed = JSON.parse(data);
    } catch {
      return storageError("Failed to parse stored API keys: invalid JSON");
    }
    return { success: true, data: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return storageError(`Failed to load API keys from Redis: ${message}`);
  }
}

/**
 * Saves the API keys store to Redis
 */
async function saveApiKeysStore(
  store: ApiKeysStore,
): Promise<StorageResult<void>> {
  try {
    store.updated_at = Date.now();
    const redis = getRedisClient();
    await redis.set(REDIS_API_KEYS_KEY, JSON.stringify(store));
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return storageError(`Failed to save API keys to Redis: ${message}`);
  }
}

// =============================================================================
// API Key Operations
// =============================================================================

/**
 * Loads all API keys from storage.
 *
 * @returns Array of API key configurations
 *
 * @example
 * ```ts
 * const result = await loadApiKeys();
 * if (result.success) {
 *   console.log(`Found ${result.data.length} keys`);
 * }
 * ```
 */
export async function loadApiKeys(): Promise<StorageResult<ApiKeyConfig[]>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }
  return { success: true, data: storeResult.data.keys };
}

/**
 * Validates an API key against storage, checking active status, expiration,
 * IP allowlist, endpoint restrictions, and rate limits.
 *
 * @param key - The raw API key to validate
 * @param clientIp - Optional client IP address for IP allowlist checking
 * @param endpoint - Optional endpoint path for endpoint restriction checking
 * @returns Validation result with key info or error details
 *
 * @example
 * ```ts
 * const result = await validateApiKey("sk-gswarm-abc123", "192.168.1.1", "/api/gswarm/chat");
 * if (result.valid) {
 *   console.log(`Key "${result.name}" is valid, ${result.rate_limit_remaining} requests left`);
 * } else {
 *   console.log(`Validation failed: ${result.error}`);
 * }
 * ```
 */
export async function validateApiKey(
  key: string,
  clientIp?: string,
  endpoint?: string,
): Promise<ApiKeyValidationResult> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { valid: false, error: `Storage error: ${storeResult.error}` };
  }

  const store = storeResult.data;

  // Find the key configuration using timing-safe comparison
  const keyConfig = store.keys.find((k) =>
    verifyApiKey(key, k.key_hash, k.key_salt),
  );
  if (!keyConfig) {
    return { valid: false, error: "Invalid API key" };
  }

  // Check if key is active
  if (!keyConfig.is_active) {
    return { valid: false, error: "API key is inactive" };
  }

  // Check expiration
  if (keyConfig.expires_at) {
    const expiresAt = new Date(keyConfig.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return { valid: false, error: "API key has expired" };
    }
  }

  // Check IP whitelist (exact match only, "*" means all IPs allowed)
  if (clientIp && keyConfig.allowed_ips && keyConfig.allowed_ips.length > 0) {
    const allowsAllIps = keyConfig.allowed_ips.includes("*");
    if (!allowsAllIps && !keyConfig.allowed_ips.includes(clientIp)) {
      return { valid: false, error: "IP address not allowed" };
    }
  }

  // Check endpoint restriction
  if (
    endpoint &&
    keyConfig.allowed_endpoints &&
    keyConfig.allowed_endpoints.length > 0
  ) {
    const isEndpointAllowed = keyConfig.allowed_endpoints.some((pattern) => {
      // Simple pattern matching: exact match or wildcard suffix
      if (pattern.endsWith("*")) {
        return endpoint.startsWith(pattern.slice(0, -1));
      }
      return endpoint === pattern;
    });
    if (!isEndpointAllowed) {
      return { valid: false, error: "Endpoint not allowed for this API key" };
    }
  }

  // Check rate limit (skip if unlimited: 0 or undefined)
  if (keyConfig.rate_limit && keyConfig.rate_limit > 0) {
    const rateLimitResult = await checkRateLimit(
      keyConfig.key_hash,
      keyConfig.rate_limit,
    );

    if (!rateLimitResult.success) {
      // Rate limit exceeded
      const currentMinute = getCurrentMinute();
      const resetTime = (currentMinute + 1) * RATE_LIMIT_WINDOW_SEC;

      return {
        valid: false,
        error: "Rate limit exceeded",
        rate_limit_remaining: 0,
        rate_limit_reset: resetTime,
      };
    }

    // Rate limit passed - get remaining count
    // Safety: success=true guarantees data exists
    if (!rateLimitResult.data) {
      return { valid: false, error: "Invalid rate limit response" };
    }
    const { remaining, resetTime } = rateLimitResult.data;

    return {
      valid: true,
      key_hash: keyConfig.key_hash,
      name: keyConfig.name,
      rate_limit_remaining: remaining,
      rate_limit_reset: resetTime,
    };
  }

  // No rate limit or unlimited (0 or undefined)
  return {
    valid: true,
    key_hash: keyConfig.key_hash,
    name: keyConfig.name,
  };
}

/**
 * Checks and updates rate limit for an API key using Redis atomic counters
 * @param keyHash - The SHA256 hash of the API key
 * @param limit - Maximum requests per minute
 * @returns Success with remaining count and reset time, or error if exceeded
 */
export async function checkRateLimit(
  keyHash: string,
  limit: number,
): Promise<StorageResult<{ remaining: number; resetTime: number }>> {
  // Unlimited rate limit: if limit is 0 or undefined, allow all requests
  if (limit === 0 || limit === undefined) {
    return { success: true, data: { remaining: limit, resetTime: 0 } };
  }

  try {
    const redis = getRedisClient();
    const currentMinute = getCurrentMinute();
    const rateLimitKey = `${REDIS_RATE_LIMIT_PREFIX}:${keyHash}:${currentMinute}`;

    // Atomic rate limit check using Lua script
    // Ensures check-and-increment is atomic across concurrent requests
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local ttl = tonumber(ARGV[2])

      local current = redis.call('GET', key)
      if current == false then
        redis.call('SETEX', key, ttl, 1)
        return {1, limit - 1}
      end

      local count = tonumber(current)
      if count >= limit then
        return {0, 0}
      end

      redis.call('INCR', key)
      return {1, limit - count - 1}
    `;

    const result = (await redis.eval(
      luaScript,
      1,
      rateLimitKey,
      limit.toString(),
      RATE_LIMIT_WINDOW_SEC.toString(),
    )) as number[];

    const [allowed, remaining] = result;

    if (allowed === 0) {
      return storageError("Rate limit exceeded");
    }

    const resetTime = (currentMinute + 1) * RATE_LIMIT_WINDOW_SEC;

    return {
      success: true,
      data: { remaining, resetTime },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return storageError(`Rate limit check failed: ${message}`);
  }
}

/**
 * Options for creating a new API key
 */
export interface CreateApiKeyOptions {
  /** Optional expiration date (ISO string) */
  expires_at?: string;

  /** Rate limit in requests per minute */
  rate_limit?: number;

  /** Allowed endpoint patterns */
  allowed_endpoints?: string[];

  /** Allowed IP addresses ("*" for all) */
  allowed_ips?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new API key with a unique hash and stores it.
 * The raw key is only returned at creation time and cannot be retrieved later.
 *
 * @param name - Human-readable name for the key (must be unique)
 * @param options - Optional configuration for expiration, rate limits, IP/endpoint restrictions
 * @returns The created key configuration including the raw key
 *
 * @example
 * ```ts
 * const result = await createApiKey("production-app", {
 *   rate_limit: 100,
 *   allowed_ips: ["10.0.0.1"],
 *   allowed_endpoints: ["/api/gswarm/*"],
 * });
 * if (result.success) {
 *   console.log(`Store this key securely: ${result.data.raw_key}`);
 * }
 * ```
 */
export async function createApiKey(
  name: string,
  options: CreateApiKeyOptions = {},
): Promise<StorageResult<ApiKeyConfig & { raw_key: string }>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return storageError(storeResult.error);
  }

  const store = storeResult.data;
  const rawKey = generateApiKey();
  const keySalt = generateKeySalt();
  const keyHash = hashApiKey(rawKey, keySalt);

  // Check for duplicate name
  const existingKey = store.keys.find((k) => k.name === name);
  if (existingKey) {
    return storageError(`API key with name "${name}" already exists`);
  }

  const newKey: ApiKeyConfig = {
    key_hash: keyHash,
    key_salt: keySalt,
    name,
    created_at: new Date().toISOString(),
    is_active: true,
    ...(options.expires_at && { expires_at: options.expires_at }),
    ...(options.rate_limit && { rate_limit: options.rate_limit }),
    ...(options.allowed_endpoints && {
      allowed_endpoints: options.allowed_endpoints,
    }),
    ...(options.allowed_ips && { allowed_ips: options.allowed_ips }),
    ...(options.metadata && { metadata: options.metadata }),
  };

  store.keys.push(newKey);

  const saveResult = await saveApiKeysStore(store);
  if (!saveResult.success) {
    return storageError(saveResult.error);
  }

  // Return the key config with the raw key (only available on creation)
  return storageSuccess({ ...newKey, raw_key: rawKey });
}

/**
 * Revokes an API key (marks as inactive but keeps in storage)
 * @param key - The API key to revoke
 * @returns Success or error
 */
export async function revokeApiKey(key: string): Promise<StorageResult<void>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }

  const store = storeResult.data;

  const keyConfig = store.keys.find((k) =>
    verifyApiKey(key, k.key_hash, k.key_salt),
  );
  if (!keyConfig) {
    return { success: false, error: "API key not found" };
  }

  if (!keyConfig.is_active) {
    return { success: false, error: "API key is already revoked" };
  }

  keyConfig.is_active = false;

  return saveApiKeysStore(store);
}

/**
 * Deletes an API key permanently
 * @param key - The API key to delete
 * @returns Success or error
 */
export async function deleteApiKey(key: string): Promise<StorageResult<void>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }

  const store = storeResult.data;

  const keyIndex = store.keys.findIndex((k) =>
    verifyApiKey(key, k.key_hash, k.key_salt),
  );
  if (keyIndex === -1) {
    return { success: false, error: "API key not found" };
  }

  // Remove the key (rate limits in Redis auto-expire)
  store.keys.splice(keyIndex, 1);

  return saveApiKeysStore(store);
}

/**
 * Deletes an API key permanently by its hash
 * @param keyHash - The SHA256 hash of the API key to delete
 * @returns Success or error
 */
export async function deleteApiKeyByHash(
  keyHash: string,
): Promise<StorageResult<void>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }

  const store = storeResult.data;

  const keyIndex = store.keys.findIndex((k) => k.key_hash === keyHash);
  if (keyIndex === -1) {
    return { success: false, error: "API key not found" };
  }

  // Remove the key (rate limits in Redis auto-expire)
  store.keys.splice(keyIndex, 1);

  return saveApiKeysStore(store);
}
