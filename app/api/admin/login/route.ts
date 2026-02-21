/**
 * @file app/api/admin/login/route.ts
 * @version 1.0
 * @description Admin login API route.
 * POST /api/admin/login - Authenticates admin users and creates sessions.
 *
 * @module app/api/admin/login
 *
 * Rate limited to 10 attempts per IP per minute to prevent brute-force attacks.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractClientIp } from "@/app/api/gswarm/_shared/auth";
import {
  ADMIN_SESSION_COOKIE,
  createSession,
  validateCredentials,
} from "@/lib/admin-session";
import { parseAndValidate } from "@/lib/api-validation";
import { PREFIX, consoleError, consoleLog } from "@/lib/console";
import { checkAuthRateLimit } from "@/lib/rate-limit";

interface LoginRequestBody extends Record<string, unknown> {
  username: string;
  password: string;
}

/**
 * POST /api/admin/login
 * Authenticates admin user and creates a session
 */
export async function POST(request: NextRequest) {
  // Rate limit: 10 attempts per IP per minute
  const rateLimitResponse = checkAuthRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const clientIp = extractClientIp(request);

  try {
    // Parse and validate request body
    const validation = await parseAndValidate<LoginRequestBody>(request, {
      required: ["username", "password"],
      types: {
        username: "string",
        password: "string",
      },
    });

    if (!validation.success) {
      return validation.response;
    }

    const { username, password } = validation.data;

    // Validate credentials (now async - reads from Redis)
    const result = await validateCredentials(username, password);

    if (!result.valid) {
      consoleLog(
        PREFIX.API,
        `Admin login failed: invalid credentials for "${username}" from IP ${clientIp}`,
      );
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Create session
    const session = await createSession(result.user as string);

    consoleLog(
      PREFIX.API,
      `Admin login success: "${result.user}" from IP ${clientIp}`,
    );

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
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] POST /api/admin/login failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      {
        error: "Invalid request body",
        message:
          "Request body must be valid JSON with username and password fields",
      },
      { status: 400 },
    );
  }
}
