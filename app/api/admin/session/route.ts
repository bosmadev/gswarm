/**
 * @file app/api/admin/session/route.ts
 * @version 1.0
 * @description Admin session validation API route.
 * GET /api/admin/session - Checks if current session is valid.
 *
 * @module app/api/admin/session
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";

/**
 * GET /api/admin/session
 * Validates the current admin session
 */
export async function GET(request: NextRequest) {
  try {
    const result = await validateAdminSession(request);

    if (result.valid) {
      return NextResponse.json({
        authenticated: true,
        user: result.user,
      });
    }

    return NextResponse.json({
      authenticated: false,
    });
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/admin/session failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      { authenticated: false, error: "Session validation failed" },
      { status: 500 },
    );
  }
}
