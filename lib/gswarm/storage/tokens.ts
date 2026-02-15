/**
 * @file lib/gswarm/storage/tokens.ts
 * @version 2.0
 * @description OAuth token storage with Redis persistence and caching.
 *
 * Manages OAuth token persistence using Redis hashes with caching and lifecycle operations.
 * Tokens are stored in Redis as hashes: oauth-tokens:{email}
 */

import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import type { StorageResult, StoredToken, TokenData } from "../types";
import { getRedisClient } from "./redis";

// =============================================================================
// Constants
// =============================================================================

/** Redis key prefix for token storage */
const TOKEN_KEY_PREFIX = "oauth-tokens:";

/** Cache TTL in milliseconds (5 minutes) */
export const TOKEN_CACHE_TTL_MS = 300_000;

/** Default token expiry buffer in seconds (60 seconds before actual expiry) */
const EXPIRY_BUFFER_SECONDS = 60;

/** Default token lifetime in seconds (1 hour) */
const DEFAULT_EXPIRES_IN = 3600;

// =============================================================================
// Cache
// =============================================================================

/** In-memory cache for tokens */
let tokenCache: Map<string, StoredToken> | null = null;
let cacheTimestamp = 0;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the Redis key for a token by email
 *
 * @param email - Email address
 * @returns Redis key for the token hash
 */
function getTokenKey(email: string): string {
  return `${TOKEN_KEY_PREFIX}${email.toLowerCase().trim()}`;
}

/**
 * Checks if a token is expired (with buffer)
 *
 * @param token - Token to check
 * @returns True if the token is expired or will expire within the buffer period
 */
export function isTokenExpired(token: StoredToken): boolean {
  const now = Date.now() / 1000;
  const expiresAt = getTokenExpiryTime(token);
  return now >= expiresAt - EXPIRY_BUFFER_SECONDS;
}

/**
 * Gets the expiry timestamp for a token
 *
 * @param token - Token to get expiry time for
 * @returns Unix timestamp (seconds) when the token expires
 */
export function getTokenExpiryTime(token: StoredToken): number {
  // Use explicit expiry_timestamp if available
  if (token.expiry_timestamp) {
    return token.expiry_timestamp;
  }

  // Calculate from created_at + expires_in
  const expiresIn = token.expires_in ?? DEFAULT_EXPIRES_IN;
  return token.created_at + expiresIn;
}

/**
 * Gets the cached tokens if valid
 */
function getCachedTokens(): Map<string, StoredToken> | null {
  const now = Date.now();
  if (tokenCache && now - cacheTimestamp < TOKEN_CACHE_TTL_MS) {
    return tokenCache;
  }
  return null;
}

/**
 * Updates the token cache
 */
function updateCache(tokens: Map<string, StoredToken>): void {
  tokenCache = tokens;
  cacheTimestamp = Date.now();
}

// =============================================================================
// Token Operations
// =============================================================================

/**
 * Loads all tokens from Redis storage
 *
 * @returns Map of email to StoredToken
 */
export async function loadAllTokens(): Promise<
  StorageResult<Map<string, StoredToken>>
> {
  // Return cached tokens if valid
  const cachedTokens = getCachedTokens();
  if (cachedTokens) {
    consoleDebug(PREFIX.DEBUG, "Returning cached tokens");
    return { success: true, data: cachedTokens };
  }

  try {
    const redis = getRedisClient();
    const tokens = new Map<string, StoredToken>();

    // Scan for all oauth-tokens:* keys
    let cursor = "0";
    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${TOKEN_KEY_PREFIX}*`,
        "COUNT",
        100,
      );
      cursor = newCursor;

      // Load all tokens in parallel
      const settled = await Promise.allSettled(
        keys.map(async (key) => {
          const email = key.replace(TOKEN_KEY_PREFIX, "");
          const data = await redis.hgetall(key);
          return { email, data };
        }),
      );

      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        const { email, data } = result.value;

        if (Object.keys(data).length > 0) {
          // Parse numeric fields back to numbers
          const token: StoredToken = {
            ...data,
            email,
            created_at: Number(data.created_at),
            updated_at: Number(data.updated_at),
            expires_in: data.expires_in ? Number(data.expires_in) : undefined,
            expiry_timestamp: data.expiry_timestamp
              ? Number(data.expiry_timestamp)
              : undefined,
            is_invalid: data.is_invalid === "true",
            invalid_at: data.invalid_at ? Number(data.invalid_at) : undefined,
            projects: data.projects ? JSON.parse(data.projects) : undefined,
          } as StoredToken;

          tokens.set(email, token);
        }
      }
    } while (cursor !== "0");

    // Update cache
    updateCache(tokens);

    consoleDebug(PREFIX.DEBUG, `Loaded ${tokens.size} tokens from Redis`);
    return { success: true, data: tokens };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    consoleError(PREFIX.ERROR, `Failed to load tokens: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Loads a single token by email
 *
 * @param email - Email address to load token for
 * @returns StoredToken if found
 */
export async function loadToken(
  email: string,
): Promise<StorageResult<StoredToken>> {
  // Check cache first
  const cachedTokens = getCachedTokens();
  if (cachedTokens) {
    const cached = cachedTokens.get(email);
    if (cached) {
      return { success: true, data: cached };
    }
  }

  try {
    const redis = getRedisClient();
    const key = getTokenKey(email);
    const data = await redis.hgetall(key);

    if (Object.keys(data).length === 0) {
      return { success: false, error: `Token not found for ${email}` };
    }

    // Parse numeric fields back to numbers
    const token: StoredToken = {
      ...data,
      email,
      created_at: Number(data.created_at),
      updated_at: Number(data.updated_at),
      expires_in: data.expires_in ? Number(data.expires_in) : undefined,
      expiry_timestamp: data.expiry_timestamp
        ? Number(data.expiry_timestamp)
        : undefined,
      is_invalid: data.is_invalid === "true",
      invalid_at: data.invalid_at ? Number(data.invalid_at) : undefined,
      projects: data.projects ? JSON.parse(data.projects) : undefined,
    } as StoredToken;

    // Update cache if it exists
    const existingCache = getCachedTokens();
    if (existingCache) {
      existingCache.set(email, token);
    }

    return { success: true, data: token };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to load token for ${email}: ${errorMessage}`,
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Saves a token to Redis storage
 *
 * @param email - Email address to save token for
 * @param tokenData - Token data to save (can include client, projects)
 * @param preserveMetadata - Whether to preserve existing client/projects from Redis (default: true)
 * @returns The saved StoredToken
 */
export async function saveToken(
  email: string,
  tokenData: TokenData,
  preserveMetadata = true,
): Promise<StorageResult<StoredToken>> {
  try {
    // Load existing token to preserve metadata if requested
    let existingToken: StoredToken | undefined;
    if (preserveMetadata) {
      const loadResult = await loadToken(email);
      if (loadResult.success) {
        existingToken = loadResult.data;
      }
    }

    // Create StoredToken from TokenData
    const storedToken: StoredToken = {
      ...tokenData,
      email,
      created_at: existingToken?.created_at ?? Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      // Preserve metadata from existing token if not provided in tokenData
      client: (tokenData as StoredToken).client ?? existingToken?.client,
      projects: (tokenData as StoredToken).projects ?? existingToken?.projects,
    };

    // Calculate expiry_timestamp if not set
    if (!storedToken.expiry_timestamp && storedToken.expires_in) {
      storedToken.expiry_timestamp =
        storedToken.created_at + storedToken.expires_in;
    }

    const redis = getRedisClient();
    const key = getTokenKey(email);

    // Convert token to hash fields (stringify complex types)
    const hashData: Record<string, string> = {
      access_token: storedToken.access_token,
      refresh_token: storedToken.refresh_token || "",
      token_type: storedToken.token_type || "Bearer",
      scope: storedToken.scope || "",
      created_at: String(storedToken.created_at),
      updated_at: String(storedToken.updated_at),
    };

    if (storedToken.expires_in !== undefined) {
      hashData.expires_in = String(storedToken.expires_in);
    }
    if (storedToken.expiry_timestamp !== undefined) {
      hashData.expiry_timestamp = String(storedToken.expiry_timestamp);
    }
    if (storedToken.is_invalid !== undefined) {
      hashData.is_invalid = String(storedToken.is_invalid);
    }
    if (storedToken.invalid_reason) {
      hashData.invalid_reason = storedToken.invalid_reason;
    }
    if (storedToken.invalid_at !== undefined) {
      hashData.invalid_at = String(storedToken.invalid_at);
    }
    if (storedToken.client) {
      hashData.client = storedToken.client;
    }
    if (storedToken.projects) {
      hashData.projects = JSON.stringify(storedToken.projects);
    }

    // Save to Redis
    await redis.hset(key, hashData);

    // Update cache
    const existingCache = getCachedTokens();
    if (existingCache) {
      existingCache.set(email, storedToken);
    }

    consoleDebug(PREFIX.DEBUG, `Saved token for ${email} to Redis`);
    return { success: true, data: storedToken };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to save token for ${email}: ${errorMessage}`,
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Deletes a token from Redis storage
 *
 * @param email - Email address to delete token for
 */
export async function deleteToken(email: string): Promise<StorageResult<void>> {
  try {
    const redis = getRedisClient();
    const key = getTokenKey(email);

    await redis.del(key);

    // Remove from cache
    const existingCache = getCachedTokens();
    if (existingCache) {
      existingCache.delete(email);
    }

    consoleDebug(PREFIX.DEBUG, `Deleted token for ${email} from Redis`);
    return { success: true, data: undefined };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to delete token for ${email}: ${errorMessage}`,
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Marks a token as invalid with an error message
 *
 * @param email - Email address of the token to mark invalid
 * @param errorMessage - Reason for invalidation
 * @returns Updated StoredToken
 */
export async function markTokenInvalid(
  email: string,
  errorMessage: string,
): Promise<StorageResult<StoredToken>> {
  const loadResult = await loadToken(email);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const token = loadResult.data;
  token.is_invalid = true;
  token.invalid_reason = errorMessage;
  token.invalid_at = Math.floor(Date.now() / 1000);

  try {
    const redis = getRedisClient();
    const key = getTokenKey(email);

    // Update the token fields in Redis
    await redis.hset(key, {
      is_invalid: "true",
      invalid_reason: errorMessage,
      invalid_at: String(token.invalid_at),
      updated_at: String(token.invalid_at),
    });

    // Update cache
    const existingCache = getCachedTokens();
    if (existingCache) {
      existingCache.set(email, token);
    }

    consoleDebug(
      PREFIX.DEBUG,
      `Marked token invalid for ${email}: ${errorMessage}`,
    );
    return { success: true, data: token };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to mark token invalid for ${email}: ${errorMsg}`,
    );
    return { success: false, error: errorMsg };
  }
}

/**
 * Gets all valid (non-expired, non-invalid) tokens
 *
 * @returns Array of valid StoredTokens
 */
export async function getValidTokens(): Promise<StorageResult<StoredToken[]>> {
  const loadResult = await loadAllTokens();

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const validTokens: StoredToken[] = [];

  for (const token of loadResult.data.values()) {
    // Skip invalid tokens
    if (token.is_invalid) {
      continue;
    }

    // Skip expired tokens
    if (isTokenExpired(token)) {
      continue;
    }

    validTokens.push(token);
  }

  return { success: true, data: validTokens };
}

/**
 * Gets tokens that need refresh (expired or expiring soon)
 *
 * @param bufferMs - Additional buffer time in milliseconds (default: 5 minutes)
 * @returns Array of tokens needing refresh
 */
export async function getTokensNeedingRefresh(
  bufferMs: number = 300_000,
): Promise<StorageResult<StoredToken[]>> {
  const loadResult = await loadAllTokens();

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const needsRefresh: StoredToken[] = [];
  const now = Date.now() / 1000;
  const bufferSeconds = bufferMs / 1000;

  for (const token of loadResult.data.values()) {
    // Skip invalid tokens
    if (token.is_invalid) {
      continue;
    }

    // Skip tokens without refresh_token
    if (!token.refresh_token) {
      continue;
    }

    const expiresAt = getTokenExpiryTime(token);

    // Token needs refresh if it expires within the buffer period
    if (now >= expiresAt - bufferSeconds) {
      needsRefresh.push(token);
    }
  }

  return { success: true, data: needsRefresh };
}

/**
 * Invalidates the token cache, forcing a reload on next access
 */
export function invalidateTokenCache(): void {
  tokenCache = null;
  cacheTimestamp = 0;
  consoleDebug(PREFIX.DEBUG, "Token cache invalidated");
}

/**
 * Updates the projects array for a token
 *
 * @param email - Email address of the token
 * @param projects - Array of GCP project IDs
 * @returns Updated StoredToken
 */
export async function updateTokenProjects(
  email: string,
  projects: string[],
): Promise<StorageResult<StoredToken>> {
  const loadResult = await loadToken(email);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const token = loadResult.data;
  token.projects = projects;
  token.updated_at = Math.floor(Date.now() / 1000);

  try {
    const redis = getRedisClient();
    const key = getTokenKey(email);

    await redis.hset(key, {
      projects: JSON.stringify(projects),
      updated_at: String(token.updated_at),
    });

    // Update cache
    const existingCache = getCachedTokens();
    if (existingCache) {
      existingCache.set(email, token);
    }

    consoleDebug(
      PREFIX.DEBUG,
      `Updated projects for ${email}: ${projects.length} projects`,
    );
    return { success: true, data: token };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to update projects for ${email}: ${errorMsg}`,
    );
    return { success: false, error: errorMsg };
  }
}

/**
 * Updates the client field for a token
 *
 * @param email - Email address of the token
 * @param client - Client identifier (e.g., "gemini-cli", "pulsona")
 * @returns Updated StoredToken
 */
export async function updateTokenClient(
  email: string,
  client: string,
): Promise<StorageResult<StoredToken>> {
  const loadResult = await loadToken(email);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const token = loadResult.data;
  token.client = client;
  token.updated_at = Math.floor(Date.now() / 1000);

  try {
    const redis = getRedisClient();
    const key = getTokenKey(email);

    await redis.hset(key, {
      client,
      updated_at: String(token.updated_at),
    });

    // Update cache
    const existingCache = getCachedTokens();
    if (existingCache) {
      existingCache.set(email, token);
    }

    consoleDebug(PREFIX.DEBUG, `Updated client for ${email}: ${client}`);
    return { success: true, data: token };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    consoleError(
      PREFIX.ERROR,
      `Failed to update client for ${email}: ${errorMsg}`,
    );
    return { success: false, error: errorMsg };
  }
}
