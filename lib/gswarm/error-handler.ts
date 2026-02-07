/**
 * Error handler utilities for API routes
 *
 * Provides consistent error response formatting with proper headers and logging.
 */

import {
  type NextResponse,
  NextResponse as NextResponseImport,
} from "next/server";
import { PREFIX, consoleError } from "@/lib/console";
import { ApiError, ErrorCode } from "./errors";
import { type ErrorLogType, recordError } from "./storage/errors";

/**
 * Options for error response
 */
interface ErrorResponseOptions {
  /** Rate limit headers */
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  /** Additional headers to include */
  headers?: Record<string, string>;
  /** Whether to log the error (default: true for 5xx, false for 4xx) */
  log?: boolean;
  /** Project ID associated with the error */
  projectId?: string;
  /** Project name associated with the error */
  projectName?: string;
  /** Account ID associated with the error */
  accountId?: string;
  /** Account email associated with the error */
  accountEmail?: string;
  /** Request endpoint */
  endpoint?: string;
  /** Request method */
  method?: string;
  /** Skip recording to error log storage */
  skipErrorLog?: boolean;
}

/**
 * Maps ApiError codes to error log types
 */
function mapErrorCodeToLogType(code: ErrorCode): ErrorLogType {
  // Rate limit errors
  if (
    code === ErrorCode.AUTH_RATE_LIMIT ||
    code === ErrorCode.GSWARM_RATE_LIMIT
  ) {
    return "rate_limit";
  }

  // Auth errors
  if (
    code === ErrorCode.AUTH_MISSING_KEY ||
    code === ErrorCode.AUTH_INVALID_KEY ||
    code === ErrorCode.AUTH_KEY_DISABLED ||
    code === ErrorCode.AUTH_IP_NOT_ALLOWED ||
    code === ErrorCode.AUTH_ENDPOINT_NOT_ALLOWED ||
    code === ErrorCode.AUTH_UNAUTHORIZED ||
    code === ErrorCode.AUTH_FORBIDDEN ||
    code === ErrorCode.GSWARM_UNAUTHORIZED ||
    code === ErrorCode.GSWARM_FORBIDDEN
  ) {
    return "auth";
  }

  // API/generation errors
  if (
    code === ErrorCode.GSWARM_BAD_REQUEST ||
    code === ErrorCode.GSWARM_NOT_FOUND ||
    code === ErrorCode.GSWARM_INTERNAL_ERROR ||
    code === ErrorCode.GSWARM_SERVICE_UNAVAILABLE ||
    code === ErrorCode.GSWARM_GENERATION_FAILED ||
    code === ErrorCode.GSWARM_NO_PROJECTS ||
    code === ErrorCode.GSWARM_ALL_PROJECTS_FAILED ||
    code === ErrorCode.GSWARM_INVALID_RESPONSE ||
    code === ErrorCode.GSWARM_PREVIEW_REQUIRED
  ) {
    return "api";
  }

  // Validation errors
  if (
    code === ErrorCode.VALIDATION_MISSING_FIELD ||
    code === ErrorCode.VALIDATION_INVALID_TYPE ||
    code === ErrorCode.VALIDATION_OUT_OF_RANGE ||
    code === ErrorCode.VALIDATION_EMPTY_VALUE ||
    code === ErrorCode.VALIDATION_INVALID_FORMAT ||
    code === ErrorCode.VALIDATION_MALFORMED_JSON ||
    code === ErrorCode.VALIDATION_MESSAGES_EMPTY ||
    code === ErrorCode.VALIDATION_MESSAGE_INVALID ||
    code === ErrorCode.VALIDATION_PROMPT_EMPTY ||
    code === ErrorCode.VALIDATION_STREAMING_UNSUPPORTED
  ) {
    return "validation";
  }

  // Network errors
  if (
    code === ErrorCode.SYSTEM_NETWORK_ERROR ||
    code === ErrorCode.SYSTEM_TIMEOUT
  ) {
    return "network";
  }

  // Unknown/system errors
  return "unknown";
}

/**
 * Creates a standardized error response from an ApiError.
 * Handles rate limit headers, Retry-After, error logging, and response formatting.
 *
 * @param error - The ApiError to convert to a response
 * @param options - Optional configuration for headers, logging, and error recording
 * @returns A NextResponse with the error JSON body and appropriate HTTP status
 *
 * @example
 * ```ts
 * const apiError = ApiError.missingApiKey();
 * return errorResponse(apiError, { endpoint: "/api/gswarm/generate" });
 * ```
 */
export function errorResponse(
  error: ApiError,
  options?: ErrorResponseOptions,
): NextResponse {
  const {
    rateLimitRemaining,
    rateLimitReset,
    headers = {},
    log,
    projectId,
    projectName,
    accountId,
    accountEmail,
    endpoint,
    method,
    skipErrorLog = false,
  } = options || {};

  // Determine if we should log (default: log server errors, not client errors)
  const shouldLog = log ?? error.httpStatus >= 500;

  // Record error to persistent storage (async, non-blocking)
  if (!skipErrorLog && shouldLog) {
    recordError({
      type: mapErrorCodeToLogType(error.code),
      message: error.message,
      projectId:
        projectId ??
        (typeof error.details?.projectId === "string"
          ? error.details.projectId
          : null),
      projectName: projectName ?? null,
      accountId: accountId ?? null,
      accountEmail: accountEmail ?? null,
      details: error.details ? JSON.stringify(error.details) : null,
      stackTrace: error.stack ?? null,
      statusCode: error.httpStatus,
      endpoint,
      method,
    }).catch((err) => {
      consoleError(
        PREFIX.ERROR,
        `[ErrorHandler] Failed to record error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  // Build response headers
  const responseHeaders: Record<string, string> = { ...headers };

  // Add rate limit headers if provided
  if (rateLimitRemaining !== undefined) {
    responseHeaders["X-RateLimit-Remaining"] = String(rateLimitRemaining);
  }
  if (rateLimitReset !== undefined) {
    responseHeaders["X-RateLimit-Reset"] = String(rateLimitReset);
  }

  // Add CORS headers for cross-origin API access
  responseHeaders["Access-Control-Allow-Origin"] = "*";
  responseHeaders["Access-Control-Allow-Methods"] =
    "GET, POST, PUT, DELETE, OPTIONS";
  responseHeaders["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-Requested-With";

  // Add Retry-After for rate limit and service unavailable errors
  if (
    error.code === ErrorCode.AUTH_RATE_LIMIT ||
    error.code === ErrorCode.GSWARM_RATE_LIMIT
  ) {
    const retryAfter =
      typeof error.details?.retryAfter === "number"
        ? error.details.retryAfter
        : undefined;
    if (retryAfter) {
      responseHeaders["Retry-After"] = String(retryAfter);
    } else if (rateLimitReset) {
      responseHeaders["Retry-After"] = String(
        Math.max(1, rateLimitReset - Math.floor(Date.now() / 1000)),
      );
    }
  } else if (error.code === ErrorCode.GSWARM_SERVICE_UNAVAILABLE) {
    responseHeaders["Retry-After"] = "60"; // Retry after 60 seconds
  }

  return NextResponseImport.json(error.toJSON(), {
    status: error.httpStatus,
    headers: responseHeaders,
  });
}

/**
 * Creates an unauthorized error response with rate limit headers.
 * Convenience wrapper for the common case of invalid API keys.
 *
 * @param message - Human-readable error message
 * @param rateLimitRemaining - Optional remaining request count
 * @param rateLimitReset - Optional timestamp when rate limit resets
 * @returns A NextResponse with 401 status and rate limit headers
 */
export function unauthorizedErrorResponse(
  message: string,
  rateLimitRemaining?: number,
  rateLimitReset?: number,
): NextResponse {
  const error = ApiError.invalidApiKey(message);
  return errorResponse(error, { rateLimitRemaining, rateLimitReset });
}
