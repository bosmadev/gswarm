import * as crypto from "node:crypto";
import type {
  ApiKeyConfig,
  ApiKeyValidationResult,
  StorageResult,
} from "../types";
import { getDataPath, readJsonFile, writeJsonFile } from "./base";

// =============================================================================
// Constants
// =============================================================================

/** File name for API keys storage */
export const API_KEYS_FILE = "api-keys.json";

/** Cache TTL for API keys in milliseconds (1 minute) */
export const API_KEYS_CACHE_TTL_MS = 60000;

/** Rate limit window duration in milliseconds (1 minute) */
const RATE_LIMIT_WINDOW_MS = 60000;

// =============================================================================
// Types
// =============================================================================

/**
 * Rate limit entry for tracking request counts per key
 */
export interface RateLimitEntry {
  /** SHA256 hash of the API key */
  key_hash: string;

  /** Unix timestamp when the current window started */
  window_start: number;

  /** Number of requests in the current window */
  request_count: number;
}

/**
 * API keys storage structure
 */
export interface ApiKeysStore {
  /** List of API key configurations */
  keys: ApiKeyConfig[];

  /** Rate limit entries indexed by key hash */
  rate_limits: Record<string, RateLimitEntry>;

  /** Unix timestamp when the store was last updated */
  updated_at: number;
}

// =============================================================================
// Cache
// =============================================================================

let apiKeysCache: ApiKeysStore | null = null;
let apiKeysCacheTime = 0;

/**
 * Gets the file path for API keys storage
 */
function getApiKeysPath(): string {
  return getDataPath(API_KEYS_FILE);
}

/**
 * Clears the API keys cache
 */
export function clearApiKeysCache(): void {
  apiKeysCache = null;
  apiKeysCacheTime = 0;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Hashes an API key using SHA256
 * @param key - The raw API key to hash
 * @returns The SHA256 hash of the key as a hex string
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Generates a new API key with the specified prefix
 * @param prefix - The prefix for the key (default: "gswarm")
 * @returns A new API key in the format: sk-{prefix}-{32-char-random}
 */
export function generateApiKey(prefix = "gswarm"): string {
  const randomPart = crypto.randomBytes(16).toString("hex");
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

// =============================================================================
// Storage Operations
// =============================================================================

/**
 * Loads the API keys store from disk with caching
 */
async function loadApiKeysStore(): Promise<StorageResult<ApiKeysStore>> {
  const now = Date.now();

  // Check cache validity
  if (apiKeysCache && now - apiKeysCacheTime < API_KEYS_CACHE_TTL_MS) {
    return { success: true, data: apiKeysCache };
  }

  const filePath = getApiKeysPath();
  const result = await readJsonFile<ApiKeysStore>(filePath);

  if (!result.success) {
    if (result.error === "File not found") {
      // Initialize empty store
      const emptyStore: ApiKeysStore = {
        keys: [],
        rate_limits: {},
        updated_at: now,
      };
      apiKeysCache = emptyStore;
      apiKeysCacheTime = now;
      return { success: true, data: emptyStore };
    }
    return result;
  }

  // Update cache
  apiKeysCache = result.data;
  apiKeysCacheTime = now;
  return result;
}

/**
 * Saves the API keys store to disk
 */
async function saveApiKeysStore(
  store: ApiKeysStore,
): Promise<StorageResult<void>> {
  store.updated_at = Date.now();
  const result = await writeJsonFile(getApiKeysPath(), store);

  if (result.success) {
    // Update cache
    apiKeysCache = store;
    apiKeysCacheTime = Date.now();
  }

  return result;
}

// =============================================================================
// API Key Operations
// =============================================================================

/**
 * Loads all API keys
 * @returns Array of API key configurations
 */
export async function loadApiKeys(): Promise<StorageResult<ApiKeyConfig[]>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }
  return { success: true, data: storeResult.data.keys };
}

/**
 * Validates an API key
 * @param key - The API key to validate
 * @param clientIp - Optional client IP address for IP whitelist checking
 * @param endpoint - Optional endpoint for endpoint restriction checking
 * @returns Validation result with key info or error
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
  const keyHash = hashApiKey(key);

  // Find the key configuration
  const keyConfig = store.keys.find((k) => k.key_hash === keyHash);
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
    const rateLimitResult = await checkRateLimit(key, keyConfig.rate_limit);
    if (!rateLimitResult.success) {
      // Get rate limit info for response
      const rateLimit = store.rate_limits[keyHash];
      const resetTime = rateLimit
        ? rateLimit.window_start + RATE_LIMIT_WINDOW_MS
        : Date.now() + RATE_LIMIT_WINDOW_MS;

      return {
        valid: false,
        error: "Rate limit exceeded",
        rate_limit_remaining: 0,
        rate_limit_reset: Math.ceil(resetTime / 1000),
      };
    }

    // Calculate remaining requests
    const rateLimit = store.rate_limits[keyHash];
    const remaining = rateLimit
      ? Math.max(0, keyConfig.rate_limit - rateLimit.request_count)
      : keyConfig.rate_limit;
    const resetTime = rateLimit
      ? rateLimit.window_start + RATE_LIMIT_WINDOW_MS
      : Date.now() + RATE_LIMIT_WINDOW_MS;

    return {
      valid: true,
      key_hash: keyHash,
      name: keyConfig.name,
      rate_limit_remaining: remaining,
      rate_limit_reset: Math.ceil(resetTime / 1000),
    };
  }

  // No rate limit or unlimited (0 or undefined)
  return {
    valid: true,
    key_hash: keyHash,
    name: keyConfig.name,
  };
}

/**
 * Checks and updates rate limit for an API key (sliding window)
 * @param key - The API key to check
 * @param limit - Maximum requests per minute
 * @returns Success if within limit, error if exceeded
 */
export async function checkRateLimit(
  key: string,
  limit: number,
): Promise<StorageResult<void>> {
  // Unlimited rate limit: if limit is 0 or undefined, allow all requests
  if (limit === 0 || limit === undefined) {
    return { success: true, data: undefined };
  }

  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }

  const store = storeResult.data;
  const keyHash = hashApiKey(key);
  const now = Date.now();

  // Get or create rate limit entry
  let rateLimit = store.rate_limits[keyHash];

  if (!rateLimit) {
    // First request, create new entry
    rateLimit = {
      key_hash: keyHash,
      window_start: now,
      request_count: 1,
    };
    store.rate_limits[keyHash] = rateLimit;
  } else {
    // Check if window has expired
    const windowAge = now - rateLimit.window_start;
    if (windowAge >= RATE_LIMIT_WINDOW_MS) {
      // Start new window
      rateLimit.window_start = now;
      rateLimit.request_count = 1;
    } else {
      // Within current window, check limit
      if (rateLimit.request_count >= limit) {
        return { success: false, error: "Rate limit exceeded" };
      }
      rateLimit.request_count++;
    }
  }

  // Save updated store
  const saveResult = await saveApiKeysStore(store);
  if (!saveResult.success) {
    return saveResult;
  }

  return { success: true, data: undefined };
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
 * Creates a new API key
 * @param name - Human-readable name for the key
 * @param options - Optional configuration for the key
 * @returns The created key configuration (includes the raw key only on creation)
 */
export async function createApiKey(
  name: string,
  options: CreateApiKeyOptions = {},
): Promise<StorageResult<ApiKeyConfig & { raw_key: string }>> {
  const storeResult = await loadApiKeysStore();
  if (!storeResult.success) {
    return { success: false, error: storeResult.error };
  }

  const store = storeResult.data;
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);

  // Check for duplicate name
  const existingKey = store.keys.find((k) => k.name === name);
  if (existingKey) {
    return {
      success: false,
      error: `API key with name "${name}" already exists`,
    };
  }

  const newKey: ApiKeyConfig = {
    key_hash: keyHash,
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
    return { success: false, error: saveResult.error };
  }

  // Return the key config with the raw key (only available on creation)
  return {
    success: true,
    data: { ...newKey, raw_key: rawKey },
  };
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
  const keyHash = hashApiKey(key);

  const keyConfig = store.keys.find((k) => k.key_hash === keyHash);
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
  const keyHash = hashApiKey(key);

  const keyIndex = store.keys.findIndex((k) => k.key_hash === keyHash);
  if (keyIndex === -1) {
    return { success: false, error: "API key not found" };
  }

  // Remove the key
  store.keys.splice(keyIndex, 1);

  // Also remove any rate limit entries
  delete store.rate_limits[keyHash];

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

  // Remove the key
  store.keys.splice(keyIndex, 1);

  // Also remove any rate limit entries
  delete store.rate_limits[keyHash];

  return saveApiKeysStore(store);
}
