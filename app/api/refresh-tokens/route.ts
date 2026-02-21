/**
 * @file app/api/refresh-tokens/route.ts
 * @version 1.0
 * @description Manual token refresh endpoint.
 * Triggers a refresh cycle for all tokens needing refresh,
 * or refreshes a specific token by email.
 */

import { type NextRequest, NextResponse } from "next/server";
import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getRefreshServiceStatus,
  refreshTokenByEmail,
  runRefreshCycle,
} from "@/lib/gswarm/token-refresh-service";

/**
 * POST /api/refresh-tokens
 *
 * Request body (optional):
 * - email: string - Refresh specific token by email
 *
 * If no email provided, refreshes all tokens needing refresh.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin session (cookie-based auth via lib/admin-session)
    const session = await validateAdminSession(request);
    if (!session.valid) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin session required" },
        { status: 401 },
      );
    }

    // Parse request body
    let email: string | undefined;
    try {
      const body = await request.json();
      email = body.email;
    } catch {
      // No body or invalid JSON - proceed with full refresh
    }

    // Refresh specific token or all tokens
    if (email) {
      consoleDebug(PREFIX.API, `Manual refresh requested for: ${email}`);

      const result = await refreshTokenByEmail(email);

      return NextResponse.json({
        success: result.success,
        email: result.email,
        new_expiry: result.new_expiry,
        error: result.error,
      });
    }

    // Refresh all tokens needing refresh
    consoleDebug(PREFIX.API, "Manual refresh cycle requested");

    const results = await runRefreshCycle();

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    consoleError(PREFIX.API, "Error in token refresh:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/refresh-tokens
 *
 * Returns the status of the token refresh service.
 */
export async function GET(request: NextRequest) {
  try {
    // Validate admin session (cookie-based auth via lib/admin-session)
    const session = await validateAdminSession(request);
    if (!session.valid) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin session required" },
        { status: 401 },
      );
    }

    const status = getRefreshServiceStatus();

    return NextResponse.json({
      success: true,
      ...status,
      lastRefreshAttemptISO: status.lastRefreshAttempt
        ? new Date(status.lastRefreshAttempt).toISOString()
        : null,
      lastSuccessfulRefreshISO: status.lastSuccessfulRefresh
        ? new Date(status.lastSuccessfulRefresh).toISOString()
        : null,
    });
  } catch (error) {
    consoleError(PREFIX.API, "Error getting refresh status:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
