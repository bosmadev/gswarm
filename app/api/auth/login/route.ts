import { type NextRequest, NextResponse } from "next/server";
import { PREFIX, consoleError } from "@/lib/console";
import { generateAuthUrl } from "@/lib/gswarm/oauth";
import { validateAdminSession } from "@/lib/gswarm/session";

/**
 * POST /api/auth/login
 * Initiates Google OAuth flow for adding a new account
 * Requires admin session
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin session
    const session = await validateAdminSession(request);
    if (!session.valid) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin session required" },
        { status: 401 },
      );
    }

    // Generate CSRF state parameter
    const state = crypto.randomUUID();

    // Store state in session for validation during callback
    // The state is stored server-side to prevent CSRF attacks
    await session.setState(state);

    // Build redirect URI
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;

    // Generate Google OAuth URL
    const authUrl = generateAuthUrl(redirectUri, state);

    return NextResponse.json({
      authUrl,
      state,
    });
  } catch (error) {
    consoleError(PREFIX.API, "Error initiating OAuth flow:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
