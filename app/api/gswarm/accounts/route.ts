/**
 * @file app/api/gswarm/accounts/route.ts
 * @version 1.0
 * @description GSwarm accounts listing endpoint
 * GET /api/gswarm/accounts - List all accounts with their projects and status
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import { getTokenExpiryTime, loadAllTokens } from "@/lib/gswarm/storage/tokens";
import { addCorsHeaders, corsPreflightResponse } from "../_shared/auth";

/**
 * Extract API key from Authorization header
 */
function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Authenticate request using either session cookie or API key.
 *
 * @param request - The incoming Next.js request
 * @returns Validation result with error message if invalid
 */
async function authenticateRequest(
  request: NextRequest,
): Promise<{ valid: boolean; error?: string }> {
  // First, try session authentication (for dashboard)
  const sessionValidation = await validateAdminSession(request);
  if (sessionValidation.valid) {
    return { valid: true };
  }

  // Fall back to API key authentication
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { valid: false, error: "Missing authentication" };
  }

  const clientIp = getClientIp(request);
  const validationResult = await validateApiKey(
    apiKey,
    clientIp,
    "/api/gswarm/accounts",
  );

  return validationResult;
}

/**
 * GET /api/gswarm/accounts
 * List all accounts with their projects and status
 */
export async function GET(request: NextRequest) {
  // Authenticate request
  const authResult = await authenticateRequest(request);
  if (!authResult.valid) {
    const isRateLimit = authResult.error === "Rate limit exceeded";
    return addCorsHeaders(
      NextResponse.json(
        {
          error: isRateLimit ? "Rate limit exceeded" : "Unauthorized",
          message: authResult.error,
        },
        { status: isRateLimit ? 429 : 401 },
      ),
    );
  }

  try {
    // Load all tokens
    const tokensResult = await loadAllTokens();
    if (!tokensResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          { error: "Failed to load accounts", message: tokensResult.error },
          { status: 500 },
        ),
      );
    }

    const tokens = Array.from(tokensResult.data.values());
    const now = Date.now() / 1000; // current time in seconds

    // Map tokens to account info
    const accounts = tokens.map((token) => {
      const expiryTimestamp = getTokenExpiryTime(token);
      const isExpired = now >= expiryTimestamp;
      const isValid = !token.is_invalid && !isExpired;

      return {
        email: token.email,
        projects: token.projects?.length || 0,
        projectIds: token.projects || [],
        verified: isValid,
        isInvalid: token.is_invalid || false,
        invalidReason: token.invalid_reason,
        lastUsed: token.last_used_at
          ? new Date(token.last_used_at * 1000).toISOString()
          : null,
        tokenExpiry: new Date(expiryTimestamp * 1000).toISOString(),
        isExpired,
        client: token.client || "unknown",
        createdAt: new Date(token.created_at * 1000).toISOString(),
        updatedAt: token.updated_at
          ? new Date(token.updated_at * 1000).toISOString()
          : null,
      };
    });

    // Sort by email
    accounts.sort((a, b) => a.email.localeCompare(b.email));

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        count: accounts.length,
        accounts,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/accounts failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      ),
    );
  }
}

/**
 * OPTIONS /api/gswarm/accounts
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
