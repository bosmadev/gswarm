/**
 * @file app/api/admin/session/route.ts
 * @description Admin session validation API route.
 * GET /api/admin/session - Checks if current session is valid.
 *
 * @module app/api/admin/session
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";

/**
 * GET /api/admin/session
 * Validates the current admin session
 */
export async function GET(request: NextRequest) {
  const result = validateAdminSession(request);

  if (result.valid) {
    return NextResponse.json({
      authenticated: true,
      user: result.user,
    });
  }

  return NextResponse.json({
    authenticated: false,
  });
}
