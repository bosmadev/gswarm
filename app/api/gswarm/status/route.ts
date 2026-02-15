/**
 * @file app/api/gswarm/status/route.ts
 * @version 1.0
 * @description GSwarm overall system status endpoint
 * GET /api/gswarm/status - Get overall system health and counts
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { GSWARM_CONFIG } from "@/lib/gswarm/executor";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import {
  getAllProjectStatuses,
  getEnabledProjects,
} from "@/lib/gswarm/storage/projects";
import { getValidTokens, loadAllTokens } from "@/lib/gswarm/storage/tokens";
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
    "/api/gswarm/status",
  );

  return validationResult;
}

/**
 * Format uptime duration
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
}

/**
 * GET /api/gswarm/status
 * Get overall system health and counts
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
    // Get all tokens
    const tokensResult = await loadAllTokens();
    const allTokens = tokensResult.success
      ? Array.from(tokensResult.data.values())
      : [];

    // Get valid tokens
    const validTokensResult = await getValidTokens();
    const validTokens = validTokensResult.success ? validTokensResult.data : [];

    // Get all projects
    const projectsResult = await getEnabledProjects();
    const enabledProjects = projectsResult || [];

    // Get project statuses
    const projectStatuses = await getAllProjectStatuses();

    // Count projects in cooldown
    const now = Date.now();
    const cooldownProjects = projectStatuses.filter(
      (status) =>
        now < status.cooldownUntil ||
        (status.quotaResetTime ? now < status.quotaResetTime : false),
    ).length;

    // Available models
    const models = [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
    ];

    // Calculate uptime (from process start)
    const uptime = process.uptime() * 1000; // ms

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        accounts: allTokens.length,
        validAccounts: validTokens.length,
        projects: enabledProjects.length,
        activeProjects: enabledProjects.length - cooldownProjects,
        cooldownProjects,
        models,
        defaultModel: GSWARM_CONFIG.model,
        uptime: formatUptime(uptime),
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/status failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * OPTIONS /api/gswarm/status
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
