/**
 * @file lib/gswarm/storage/tokens.ts
 * @version 1.0
 * @description OAuth token storage with caching and lifecycle management.
 *
 * Manages OAuth token persistence with caching, validation, and lifecycle operations.
 * Tokens are stored as JSON files in the oauth-tokens directory.
 */

import { join } from "node:path";
import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import type { StorageResult, StoredToken, TokenData } from "../types";
import {
  CacheManager,
  STORAGE_BASE_DIR,
  deleteFile,
  ensureDir,
  getStoragePath,
  listFiles,
  readJsonFile,
  writeJsonFile,
} from "./base";

// =============================================================================
// Constants
// =============================================================================

/** Directory name for token storage */
export const TOKENS_DIR = "oauth-tokens";

/** Cache TTL in milliseconds (5 minutes) */
export const TOKEN_CACHE_TTL_MS = 300_000;

/** Default token expiry buffer in seconds (60 seconds before actual expiry) */
const EXPIRY_BUFFER_SECONDS = 60;

/** Default token lifetime in seconds (1 hour) */
const DEFAULT_EXPIRES_IN = 3600;

// =============================================================================
// Cache
// =============================================================================

/** Token cache using CacheManager */
const tokenCacheManager = new CacheManager<Map<string, StoredToken>>(
  TOKEN_CACHE_TTL_MS,
);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sanitizes an email address for use as a filename
 * Removes or replaces characters that are invalid in filenames
 *
 * @param email - Email address to sanitize
 * @returns Safe filename string
 */
export function sanitizeEmail(email: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally filtering control chars for safe filenames
  const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

  return email
    .toLowerCase()
    .trim()
    .replace(INVALID_FILENAME_CHARS, "_")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

/**
 * Gets the full path to a token file for a given email
 *
 * @param email - Email address
 * @returns Full path to the token file
 */
export function getTokenPath(email: string): string {
  const sanitized = sanitizeEmail(email);
  return join(STORAGE_BASE_DIR, TOKENS_DIR, `${sanitized}.json`);
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
  return tokenCacheManager.get();
}

/**
 * Gets the tokens directory path
 */
function getTokensDir(): string {
  return getStoragePath(TOKENS_DIR);
}

// =============================================================================
// Token Operations
// =============================================================================

/**
 * Loads all tokens from storage
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

  const tokensDir = getTokensDir();

  // Ensure directory exists
  const ensureResult = await ensureDir(tokensDir);
  if (!ensureResult.success) {
    return { success: false, error: ensureResult.error };
  }

  // List token files
  const listResult = await listFiles(tokensDir, ".json");
  if (!listResult.success) {
    return { success: false, error: listResult.error };
  }

  // Load all token files in parallel
  const filenames = listResult.data.filter((f) => f !== ".gitkeep");
  const settled = await Promise.allSettled(
    filenames.map(async (filename) => {
      const filePath = join(tokensDir, filename);
      const readResult = await readJsonFile<StoredToken>(filePath);
      return { filename, readResult };
    }),
  );

  const tokens = new Map<string, StoredToken>();

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const { filename, readResult } = result.value;

    if (readResult.success) {
      const token = readResult.data;
      if (token.email) {
        tokens.set(token.email, token);
      } else {
        // Extract email from filename if not in token data
        const email = filename.replace(/\.json$/, "");
        token.email = email;
        tokens.set(email, token);
      }
    } else {
      consoleError(
        PREFIX.ERROR,
        `Failed to load token from ${filename}: ${readResult.error}`,
      );
    }
  }

  // Update cache
  tokenCacheManager.set(tokens);

  consoleDebug(PREFIX.DEBUG, `Loaded ${tokens.size} tokens from storage`);
  return { success: true, data: tokens };
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

  const filePath = getTokenPath(email);
  const readResult = await readJsonFile<StoredToken>(filePath);

  if (!readResult.success) {
    return { success: false, error: `Token not found for ${email}` };
  }

  const token = readResult.data;

  // Ensure email is set
  if (!token.email) {
    token.email = email;
  }

  // Update cache if it exists
  const existingCache = getCachedTokens();
  if (existingCache) {
    existingCache.set(email, token);
  }

  return { success: true, data: token };
}

/**
 * Saves a token to storage
 *
 * @param email - Email address to save token for
 * @param tokenData - Token data to save (can include client, projects)
 * @param preserveMetadata - Whether to preserve existing client/projects from disk (default: true)
 * @returns The saved StoredToken
 */
export async function saveToken(
  email: string,
  tokenData: TokenData,
  preserveMetadata = true,
): Promise<StorageResult<StoredToken>> {
  const filePath = getTokenPath(email);

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

  const writeResult = await writeJsonFile(filePath, storedToken);

  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

  // Update cache
  const existingCache = getCachedTokens();
  if (existingCache) {
    existingCache.set(email, storedToken);
  }

  consoleDebug(PREFIX.DEBUG, `Saved token for ${email}`);
  return { success: true, data: storedToken };
}

/**
 * Deletes a token from storage
 *
 * @param email - Email address to delete token for
 */
export async function deleteToken(email: string): Promise<StorageResult<void>> {
  const filePath = getTokenPath(email);

  const deleteResult = await deleteFile(filePath);

  if (!deleteResult.success) {
    return { success: false, error: deleteResult.error };
  }

  // Remove from cache
  const existingCache = getCachedTokens();
  if (existingCache) {
    existingCache.delete(email);
  }

  consoleDebug(PREFIX.DEBUG, `Deleted token for ${email}`);
  return { success: true, data: undefined };
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

  const filePath = getTokenPath(email);
  const writeResult = await writeJsonFile(filePath, token);

  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

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
  tokenCacheManager.invalidate();
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

  const filePath = getTokenPath(email);
  const writeResult = await writeJsonFile(filePath, token);

  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

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

  const filePath = getTokenPath(email);
  const writeResult = await writeJsonFile(filePath, token);

  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

  // Update cache
  const existingCache = getCachedTokens();
  if (existingCache) {
    existingCache.set(email, token);
  }

  consoleDebug(PREFIX.DEBUG, `Updated client for ${email}: ${client}`);
  return { success: true, data: token };
}
