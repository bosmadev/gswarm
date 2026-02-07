/**
 * @file app/api/gswarm/_shared/auth.ts
 * @version 1.0
 * @description Shared authentication and CORS utilities for GSwarm API routes.
 * Provides API key validation, rate limit headers, and CORS preflight handling.
 */

import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextResponseImport } from "next/server";
import { errorResponse } from "@/lib/gswarm/error-handler";
import { ApiError } from "@/lib/gswarm/errors";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";

// =============================================================================
// CORS Configuration
// =============================================================================

/**
 * Default CORS headers for public API routes.
 * Allows cross-origin access for API consumers.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

/**
 * Creates a CORS preflight response for OPTIONS requests.
 * Call this from OPTIONS handlers in API routes that need cross-origin access.
 *
 * @returns A 204 No Content response with CORS headers
 *
 * @example
 * ```ts
 * export function OPTIONS() {
 *   return corsPreflightResponse();
 * }
 * ```
 */
export function corsPreflightResponse(): NextResponse {
  return new NextResponseImport(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Adds CORS headers to an existing response.
 *
 * @param response - The response to add CORS headers to
 * @returns The response with CORS headers added
 */
export function addCorsHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Result of API authentication
 */
export interface AuthResult {
  success: boolean;
  error?: ApiError;
  keyName?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

/**
 * Extracts API key from Authorization header.
 * Supports both "Bearer &lt;key&gt;" and raw key formats.
 *
 * @param request - The incoming Next.js request
 * @returns The extracted API key string, or null if not present
 *
 * @example
 * ```ts
 * const apiKey = extractApiKey(request);
 * if (!apiKey) {
 *   return NextResponse.json({ error: "Missing API key" }, { status: 401 });
 * }
 * ```
 */
export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <key>" format
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Support raw key format
  return authHeader;
}

/**
 * Extracts client IP from request headers.
 * Checks common proxy headers first (X-Forwarded-For, X-Real-IP),
 * then falls back to X-Client-IP or "unknown".
 *
 * @param request - The incoming Next.js request
 * @returns The client IP address string, or "unknown" if not determinable
 */
export function extractClientIp(request: NextRequest): string {
  // Check forwarded headers (common in production with proxies)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP in the chain (original client)
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Fall back to request IP (may not be available in all environments)
  return request.headers.get("x-client-ip") || "unknown";
}

/**
 * Validates API key and IP address for a request.
 * Performs full authentication including key validation, IP allowlist check,
 * endpoint permissions, and rate limiting.
 *
 * @param request - The incoming Next.js request
 * @param endpoint - The API endpoint path being accessed (e.g., "/api/gswarm/generate")
 * @returns Authentication result with key name on success, or ApiError on failure
 *
 * @example
 * ```ts
 * const auth = await authenticateRequest(request, "/api/gswarm/generate");
 * if (!auth.success) {
 *   return errorResponse(auth.error);
 * }
 * ```
 */
export async function authenticateRequest(
  request: NextRequest,
  endpoint: string,
): Promise<AuthResult> {
  // Extract API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return {
      success: false,
      error: ApiError.missingApiKey(),
    };
  }

  // Extract client IP
  const clientIp = extractClientIp(request);

  // Validate API key with IP and endpoint checks
  const validation = await validateApiKey(apiKey, clientIp, endpoint);

  if (!validation.valid) {
    // Determine specific error type
    let error: ApiError;

    if (validation.error === "Rate limit exceeded") {
      error = ApiError.rateLimit(
        validation.rate_limit_reset,
        validation.rate_limit_remaining || 0,
      );
    } else if (validation.error?.includes("IP address")) {
      error = ApiError.ipNotAllowed(clientIp);
    } else if (validation.error?.includes("endpoint")) {
      error = ApiError.endpointNotAllowed(endpoint);
    } else if (validation.error?.includes("disabled")) {
      error = ApiError.keyDisabled(validation.name);
    } else {
      error = ApiError.invalidApiKey(validation.error || "Invalid API key");
    }

    return {
      success: false,
      error,
      rateLimitRemaining: validation.rate_limit_remaining,
      rateLimitReset: validation.rate_limit_reset,
    };
  }

  return {
    success: true,
    keyName: validation.name,
    rateLimitRemaining: validation.rate_limit_remaining,
    rateLimitReset: validation.rate_limit_reset,
  };
}

/**
 * Creates an unauthorized error response
 * @deprecated Use errorResponse with ApiError instead
 */
export function unauthorizedResponse(
  errorMsg: string,
  rateLimitRemaining?: number,
  rateLimitReset?: number,
): NextResponse {
  const error = ApiError.invalidApiKey(errorMsg);
  return errorResponse(error, { rateLimitRemaining, rateLimitReset });
}

/**
 * Creates a rate limit exceeded error response
 * @deprecated Use errorResponse with ApiError.rateLimit() instead
 */
export function rateLimitResponse(rateLimitReset?: number): NextResponse {
  const error = ApiError.rateLimit(rateLimitReset, 0);
  return errorResponse(error, { rateLimitRemaining: 0, rateLimitReset });
}

/**
 * Adds rate limit headers to a response.
 *
 * @param response - The Next.js response to add headers to
 * @param remaining - Number of remaining requests in the current window
 * @param reset - Unix timestamp when the rate limit window resets
 * @returns The response with rate limit headers added
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining?: number,
  reset?: number,
): NextResponse {
  if (remaining !== undefined) {
    response.headers.set("X-RateLimit-Remaining", String(remaining));
  }
  if (reset !== undefined) {
    response.headers.set("X-RateLimit-Reset", String(reset));
  }
  return response;
}
