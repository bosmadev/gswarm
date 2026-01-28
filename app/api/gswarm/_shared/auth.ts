/**
 * Shared authentication utilities for GSwarm API routes
 */

import type { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/gswarm/error-handler";
import { ApiError } from "@/lib/gswarm/errors";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";

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
 * Extracts API key from Authorization header
 * Supports both "Bearer <key>" and raw key formats
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
 * Extracts client IP from request headers
 * Checks common proxy headers first, then falls back to request IP
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
 * Validates API key and IP address for a request
 * Returns authentication result with key info or error
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
 * Adds rate limit headers to a response
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
