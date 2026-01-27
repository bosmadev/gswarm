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
 * Creates a standardized error response from an ApiError
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
      projectId: projectId ?? (error.details?.projectId as string) ?? null,
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

  // Add Retry-After for rate limit and service unavailable errors
  if (
    error.code === ErrorCode.AUTH_RATE_LIMIT ||
    error.code === ErrorCode.GSWARM_RATE_LIMIT
  ) {
    const retryAfter = error.details?.retryAfter as number | undefined;
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
 * Wraps a generic Error into an ApiError and creates response
 */
export function errorResponseFromError(
  error: unknown,
  options?: ErrorResponseOptions,
): NextResponse {
  // If already an ApiError, use it directly
  if (error instanceof ApiError) {
    return errorResponse(error, options);
  }

  // Convert generic Error to ApiError
  const apiError =
    error instanceof Error
      ? ApiError.internalError(error.message, { originalError: error.name })
      : ApiError.unknown(String(error));

  return errorResponse(apiError, options);
}

/**
 * Handles errors in a try-catch block with consistent response
 *
 * @example
 * ```ts
 * export async function POST(request: NextRequest) {
 *   return handleApiErrors(async () => {
 *     // Your route logic here
 *     const result = await someOperation();
 *     return NextResponse.json(result);
 *   }, { rateLimitRemaining: 10, rateLimitReset: 1234567890 });
 * }
 * ```
 */
export async function handleApiErrors(
  handler: () => Promise<NextResponse>,
  options?: ErrorResponseOptions,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    return errorResponseFromError(error, options);
  }
}

/**
 * Validates that an error is operational (expected) vs programmer error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Converts Gemini/GSwarm HTTP status codes to ApiErrors
 */
export function geminiStatusToApiError(
  status: number,
  projectId: string,
  errorBody?: string,
  resetDuration?: string,
): ApiError {
  switch (status) {
    case 400:
      return ApiError.gswarmBadRequest(errorBody);
    case 401:
      return ApiError.gswarmUnauthorized(projectId);
    case 403:
      return ApiError.gswarmForbidden(projectId);
    case 404:
      return ApiError.gswarmNotFound(projectId, true);
    case 429:
      return ApiError.gswarmRateLimit(projectId, resetDuration);
    case 500:
      return ApiError.gswarmInternalError(projectId);
    case 503:
      return ApiError.gswarmServiceUnavailable(projectId);
    default:
      return ApiError.internalError(`Unexpected GSwarm status: ${status}`, {
        projectId,
        status,
        errorBody,
      });
  }
}

/**
 * Creates an error response with rate limit headers
 * (Convenience wrapper for common use case)
 */
export function rateLimitErrorResponse(
  rateLimitReset?: number,
  rateLimitRemaining = 0,
): NextResponse {
  const error = ApiError.rateLimit(rateLimitReset, rateLimitRemaining);
  return errorResponse(error, { rateLimitRemaining, rateLimitReset });
}

/**
 * Creates an unauthorized error response with rate limit headers
 * (Convenience wrapper for common use case)
 */
export function unauthorizedErrorResponse(
  message: string,
  rateLimitRemaining?: number,
  rateLimitReset?: number,
): NextResponse {
  const error = ApiError.invalidApiKey(message);
  return errorResponse(error, { rateLimitRemaining, rateLimitReset });
}
