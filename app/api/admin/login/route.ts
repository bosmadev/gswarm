/**
 * @file app/api/admin/login/route.ts
 * @description Admin login API route.
 * POST /api/admin/login - Authenticates admin users and creates sessions.
 *
 * @module app/api/admin/login
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createSession,
  validateCredentials,
} from "@/lib/admin-session";

interface LoginRequestBody {
  username: string;
  password: string;
}

/**
 * POST /api/admin/login
 * Authenticates admin user and creates a session
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginRequestBody;
    const { username, password } = body;

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required" },
        { status: 400 },
      );
    }

    // Validate credentials
    const result = validateCredentials(username, password);

    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Create session
    const session = createSession(result.user as string);

    // Create response with session cookie
    const response = NextResponse.json({ success: true });

    response.cookies.set(ADMIN_SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours in seconds
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 },
    );
  }
}
