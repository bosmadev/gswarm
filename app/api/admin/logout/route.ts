/**
 * @file app/api/admin/logout/route.ts
 * @version 1.0
 * @description Admin logout API route.
 * POST /api/admin/logout - Ends admin session and clears cookies.
 *
 * @module app/api/admin/logout
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, removeSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";

/**
 * POST /api/admin/logout
 * Ends the current admin session
 */
export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE);

    // Remove session from storage if it exists
    if (sessionCookie?.value) {
      await removeSession(sessionCookie.value);
    }

    // Create response and clear the cookie
    const response = NextResponse.json({ success: true });

    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0, // Immediately expire the cookie
    });

    return response;
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] POST /api/admin/logout failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      {
        error: "Logout failed",
        message: "An error occurred while ending the session",
      },
      { status: 500 },
    );
  }
}
