/**
 * @file app/api/gswarm/config/route.ts
 * @version 1.0
 * @description GSwarm configuration API endpoint
 * GET /api/gswarm/config - Get current configuration
 * POST /api/gswarm/config - Update configuration
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { safeParseBody } from "@/lib/api-validation";
import { PREFIX, consoleError } from "@/lib/console";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import { loadConfig, updateConfig } from "@/lib/gswarm/storage/config";
import type { GSwarmConfig } from "@/lib/gswarm/types";
import {
  addCorsHeaders,
  corsPreflightResponse,
  extractClientIp,
} from "../_shared/auth";

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
 * GET /api/gswarm/config
 * Get current GSwarm configuration (admin only)
 */
export async function GET(request: NextRequest) {
  // Require admin session (cookie-based)
  const sessionResult = await validateAdminSession(request);
  if (!sessionResult.valid) {
    // Fall back to API key auth, then enforce admin via separate check
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Forbidden",
            message: "Admin access required",
          },
          { status: 403 },
        ),
      );
    }

    const clientIp = extractClientIp(request);
    const validationResult = await validateApiKey(
      apiKey,
      clientIp,
      "/api/gswarm/config",
    );

    if (!validationResult.valid) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error:
              validationResult.error === "Rate limit exceeded"
                ? "Rate limit exceeded"
                : "Unauthorized",
            message: validationResult.error,
          },
          {
            status:
              validationResult.error === "Rate limit exceeded" ? 429 : 401,
          },
        ),
      );
    }

    // API key holders are not admins — config is admin-only
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Forbidden",
          message: "Admin access required to view configuration",
        },
        { status: 403 },
      ),
    );
  }

  try {
    const configResult = await loadConfig();
    if (!configResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Failed to load configuration",
            message: configResult.error,
          },
          { status: 500 },
        ),
      );
    }

    return addCorsHeaders(
      NextResponse.json({
        config: configResult.data,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/config failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * POST /api/gswarm/config
 * Update GSwarm configuration (admin only)
 */
export async function POST(request: NextRequest) {
  // Require admin session
  const sessionResult = await validateAdminSession(request);
  if (!sessionResult.valid) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Forbidden",
          message: "Admin access required to update configuration",
        },
        { status: 403 },
      ),
    );
  }

  // Parse request body safely
  const parseResult = await safeParseBody<Partial<GSwarmConfig>>(request);
  if (!parseResult.success) {
    return addCorsHeaders(
      NextResponse.json(
        { error: "Invalid request body", message: parseResult.error },
        { status: 400 },
      ),
    );
  }

  const updates = parseResult.data;

  // Validate updates (basic validation)
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid request body",
          message: "Updates must be a JSON object",
        },
        { status: 400 },
      ),
    );
  }

  try {
    const updateResult = await updateConfig(updates);
    if (!updateResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Failed to update configuration",
            message: updateResult.error,
          },
          { status: 500 },
        ),
      );
    }

    // Return updated config
    const configResult = await loadConfig();
    if (!configResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Failed to load configuration",
            message: configResult.error,
          },
          { status: 500 },
        ),
      );
    }

    return addCorsHeaders(
      NextResponse.json({
        message: "Configuration updated successfully",
        config: configResult.data,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] POST /api/gswarm/config failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * OPTIONS /api/gswarm/config
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
