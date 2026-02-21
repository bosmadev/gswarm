/**
 * GSwarm Error Handler
 *
 * Provides error parsing and handling utilities for GSwarm API responses.
 * Extracted from executor.ts to reduce module responsibilities.
 */

import { PREFIX, consoleDebug, consoleError, consoleWarn } from "@/lib/console";
import { markTokenInvalid } from "./storage/tokens";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Parsed JSON error structure
 */
export interface ParsedJsonError {
  retryDelay?: number;
  quotaLimit?: number;
  quotaValue?: number;
  message?: string;
}

/**
 * Error handler result
 */
export interface ErrorHandlerResult {
  retry: boolean;
  resetDuration?: number;
  validationUrl?: string;
}

// =============================================================================
// NAMED EXPORTS
// =============================================================================

/**
 * Parse JSON error body to extract retry/quota information
 *
 * @param errorBody - Raw error body string
 * @returns Parsed error info or null
 */
export function parseJsonError(errorBody: string): ParsedJsonError | null {
  try {
    const parsed: unknown = JSON.parse(errorBody);
    const result: ParsedJsonError = {};

    // Extract message
    const errorObj =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    const errorField =
      typeof errorObj?.error === "object" && errorObj.error !== null
        ? (errorObj.error as Record<string, unknown>)
        : null;
    if (typeof errorField?.message === "string") {
      result.message = errorField.message;
    }

    // Look for retry-after in the error
    const message = result.message ?? "";

    // Parse retry delay from message (e.g., "retry after 60s")
    const retryMatch = message.match(/retry\s+after\s+(\d+)\s*s/i);
    if (retryMatch) {
      result.retryDelay = Number.parseInt(retryMatch[1]!, 10) * 1000;
    }

    // Parse quota information
    const quotaLimitMatch = message.match(/quota[:\s]+(\d+)/i);
    if (quotaLimitMatch) {
      result.quotaLimit = Number.parseInt(quotaLimitMatch[1]!, 10);
    }

    const quotaValueMatch = message.match(/used[:\s]+(\d+)/i);
    if (quotaValueMatch) {
      result.quotaValue = Number.parseInt(quotaValueMatch[1]!, 10);
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Handle 400 Bad Request error
 *
 * @param projectId - Project identifier
 * @param errorBody - Error response body
 */
export function handleBadRequest(projectId: string, errorBody: string): void {
  const parsed = parseJsonError(errorBody);
  consoleError(
    PREFIX.ERROR,
    `[GSwarm] Bad request for project ${projectId}: ${parsed?.message ?? errorBody.slice(0, 200)}`,
  );
}

/**
 * Handle 401 Unauthorized error
 * Auto-invalidates the token for the associated email
 *
 * @param projectId - Project identifier
 * @param email - Optional email to auto-invalidate token
 */
export async function handleUnauthorized(
  projectId: string,
  email?: string,
): Promise<void> {
  consoleError(
    PREFIX.ERROR,
    `[GSwarm] Unauthorized for project ${projectId} - token may be expired or invalid`,
  );

  // Auto-invalidate token if email is provided
  if (email) {
    try {
      await markTokenInvalid(
        email,
        `401 Unauthorized for project ${projectId}`,
      );
      consoleWarn(
        PREFIX.WARNING,
        `[GSwarm] Token auto-invalidated for ${email} due to 401 error`,
      );
    } catch (error) {
      consoleError(
        PREFIX.ERROR,
        `[GSwarm] Failed to auto-invalidate token for ${email}: ${error}`,
      );
    }
  }
}

/**
 * Extract validation URL from CloudCode PA VALIDATION_REQUIRED error
 *
 * @param errorBody - Raw error body string
 * @returns Validation URL or null if not found
 */
export function extractValidationUrl(errorBody: string): string | null {
  try {
    const parsed: unknown = JSON.parse(errorBody);
    const errorObj =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    const errorField =
      typeof errorObj?.error === "object" && errorObj.error !== null
        ? (errorObj.error as Record<string, unknown>)
        : null;
    const details = Array.isArray(errorField?.details)
      ? errorField.details
      : null;

    if (details && details.length > 0) {
      const firstDetail =
        typeof details[0] === "object" && details[0] !== null
          ? (details[0] as Record<string, unknown>)
          : null;
      const metadata =
        typeof firstDetail?.metadata === "object" &&
        firstDetail.metadata !== null
          ? (firstDetail.metadata as Record<string, unknown>)
          : null;

      if (typeof metadata?.validation_url === "string") {
        return metadata.validation_url;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Handle 403 Forbidden error
 * Detects VALIDATION_REQUIRED and extracts validation URL
 *
 * @param projectId - Project identifier
 * @param errorBody - Error response body
 * @returns Object with optional validation URL
 */
export function handleForbidden(
  projectId: string,
  errorBody: string,
): { validationUrl?: string } {
  const validationUrl = extractValidationUrl(errorBody);

  if (validationUrl) {
    consoleError(
      PREFIX.ERROR,
      `[GSwarm] VALIDATION_REQUIRED for project ${projectId} - account needs verification: ${validationUrl}`,
    );
    return { validationUrl };
  }

  consoleError(
    PREFIX.ERROR,
    `[GSwarm] Forbidden for project ${projectId} - insufficient permissions or API not enabled`,
  );
  return {};
}

/**
 * Handle 404 Not Found error
 *
 * @param projectId - Project identifier
 */
export function handleNotFound(projectId: string): void {
  consoleError(
    PREFIX.ERROR,
    `[GSwarm] Not found for project ${projectId} - endpoint or model may not exist`,
  );
}

/**
 * Parse CloudCode PA 429 reset time from error message
 * Supports: "reset after 0s", "reset after 1h 23m 45s", etc.
 *
 * @param message - Error message containing reset time
 * @returns Reset duration in milliseconds, or null if not found
 */
export function parseResetTime(message: string): number | null {
  // Regex: reset after (\d+h\s*)?(\d+m\s*)?(\d+s)
  const match = message.match(
    /reset after (?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)/i,
  );
  if (!match) return null;

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const seconds = match[3] ? Number.parseInt(match[3], 10) : 0;

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Handle 429 Rate Limit error
 * Parses reset time from CloudCode PA error messages
 *
 * @param projectId - Project identifier
 * @param errorBody - Error response body
 * @param latencyMs - Request latency
 * @param callSource - Call source identifier
 * @returns Object with optional reset duration in milliseconds
 */
export function handleRateLimit(
  projectId: string,
  errorBody: string,
  latencyMs: number,
  callSource?: string,
): { resetDuration?: number } {
  const parsed = parseJsonError(errorBody);
  const result: { resetDuration?: number } = {};

  // Try CloudCode PA reset time format first
  if (parsed?.message) {
    const resetMs = parseResetTime(parsed.message);
    if (resetMs !== null) {
      result.resetDuration = resetMs;
    }
  }

  // Fallback to legacy retry delay or default
  if (!result.resetDuration) {
    if (parsed?.retryDelay) {
      result.resetDuration = parsed.retryDelay;
    } else {
      // Default cooldown of 60 seconds
      result.resetDuration = 60000;
    }
  }

  consoleWarn(
    PREFIX.WARNING,
    `[GSwarm] Rate limited for project ${projectId}${callSource ? ` (${callSource})` : ""} - cooldown ${result.resetDuration}ms (latency: ${latencyMs}ms)`,
  );

  if (parsed?.quotaLimit || parsed?.quotaValue) {
    consoleDebug(
      PREFIX.DEBUG,
      `[GSwarm] Quota info: limit=${parsed.quotaLimit}, used=${parsed.quotaValue}`,
    );
  }

  return result;
}

/**
 * Handle 500 Internal Server Error
 *
 * @param projectId - Project identifier
 */
export function handleInternalError(projectId: string): void {
  consoleError(
    PREFIX.ERROR,
    `[GSwarm] Internal server error for project ${projectId} - API service issue`,
  );
}

/**
 * Handle 503 Service Unavailable error
 *
 * @param projectId - Project identifier
 */
export function handleServiceUnavailable(projectId: string): void {
  consoleWarn(
    PREFIX.WARNING,
    `[GSwarm] Service unavailable for project ${projectId} - API may be overloaded`,
  );
}

/**
 * Calculate health score penalty based on error status
 * Lower penalty = healthier project
 *
 * @param status - HTTP status code
 * @returns Health score penalty (0-100, higher = worse)
 */
export function calculateHealthPenalty(status: number): number {
  switch (status) {
    case 200:
      return 0; // Success - no penalty

    case 429:
      return 30; // Rate limit - moderate penalty

    case 403:
      return 50; // Forbidden/validation - high penalty

    case 401:
      return 60; // Unauthorized - very high penalty (token expired)

    case 404:
      return 40; // Not found - model unavailable

    case 500:
      return 25; // Internal error - transient, lower penalty

    case 503:
      return 20; // Service unavailable - transient

    default:
      return status >= 500 ? 30 : 50; // Default penalties
  }
}

/**
 * Main error handler - routes to specific handlers based on status code
 *
 * @param projectId - Project identifier
 * @param status - HTTP status code
 * @param errorBody - Error response body
 * @param latencyMs - Request latency
 * @param callSource - Call source identifier
 * @param email - Optional email for token auto-invalidation on 401
 * @returns Error handler result with retry flag and optional reset duration
 */
export async function handleError(
  projectId: string,
  status: number,
  errorBody: string,
  latencyMs: number,
  callSource?: string,
  email?: string,
): Promise<ErrorHandlerResult> {
  switch (status) {
    case 400:
      handleBadRequest(projectId, errorBody);
      return { retry: false };

    case 401:
      await handleUnauthorized(projectId, email);
      // Retry with different project - token expired
      return { retry: true, resetDuration: 300000 }; // 5 min cooldown

    case 403: {
      const forbiddenResult = handleForbidden(projectId, errorBody);
      // If VALIDATION_REQUIRED, use longer cooldown for manual verification
      const resetDuration = forbiddenResult.validationUrl ? 3600000 : 600000;
      // Retry with different project - permission issue or validation required
      return {
        retry: true,
        resetDuration,
        validationUrl: forbiddenResult.validationUrl,
      };
    }

    case 404:
      handleNotFound(projectId);
      // Retry with different project
      return { retry: true, resetDuration: 3600000 }; // 1 hour cooldown

    case 429: {
      const rateLimitResult = handleRateLimit(
        projectId,
        errorBody,
        latencyMs,
        callSource,
      );
      return { retry: true, resetDuration: rateLimitResult.resetDuration };
    }

    case 500:
      handleInternalError(projectId);
      // Retry - transient server error
      return { retry: true };

    case 503:
      handleServiceUnavailable(projectId);
      // Retry - service temporarily unavailable
      return { retry: true, resetDuration: 30000 }; // 30 sec cooldown

    default:
      consoleError(
        PREFIX.ERROR,
        `[GSwarm] Unexpected error ${status} for project ${projectId}: ${errorBody.slice(0, 200)}`,
      );
      return { retry: status >= 500 };
  }
}

// =============================================================================
// BACKWARD-COMPATIBLE NAMESPACE SHIM
// Preserves GSwarmErrorHandler.xxx call sites in executor.ts and tests
// without requiring namespace (TS anti-pattern)
// =============================================================================

/**
 * @deprecated Use named exports directly. This shim exists for call-site
 * backward compatibility during migration. Will be removed in a future cleanup.
 */
export const GSwarmErrorHandler = {
  parseJsonError,
  handleBadRequest,
  handleUnauthorized,
  extractValidationUrl,
  handleForbidden,
  handleNotFound,
  parseResetTime,
  handleRateLimit,
  handleInternalError,
  handleServiceUnavailable,
  calculateHealthPenalty,
  handle: handleError,
} as const;
