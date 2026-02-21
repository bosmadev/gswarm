import { type NextRequest, NextResponse } from "next/server";
import { PREFIX, consoleError } from "@/lib/console";
import { generateAuthUrl } from "@/lib/gswarm/oauth";
import { validateAdminPassword } from "@/lib/gswarm/session";

/**
 * POST /api/auth/login
 * Initiates Google OAuth flow for adding a new account
 * Requires admin session
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin session
    const session = await validateAdminPassword(request);
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

    // Build redirect URI via centralized url-builder
    const { getCallbackUrl } = await import("@/lib/gswarm/url-builder");
    const redirectUri = getCallbackUrl();

    // Generate Google OAuth URL (state is returned alongside url)
    const { url: authUrl, state: resolvedState } = generateAuthUrl(
      redirectUri,
      state,
    );

    return NextResponse.json({
      authUrl,
      state: resolvedState,
    });
  } catch (error) {
    consoleError(PREFIX.API, "Error initiating OAuth flow:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Authentication failed",
      },
      { status: 500 },
    );
  }
}
