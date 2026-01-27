import { type NextRequest, NextResponse } from "next/server";
import { PREFIX, consoleError } from "@/lib/console";
import {
  exchangeCodeForTokens,
  getTokenEmailFromData,
} from "@/lib/gswarm/oauth";
import { validateAdminSession } from "@/lib/gswarm/session";
import { saveToken } from "@/lib/gswarm/storage/tokens";

/**
 * GET /api/auth/callback
 * Google OAuth callback handler
 * Exchanges authorization code for tokens and saves them
 */
export async function GET(request: NextRequest) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  try {
    // Get code and state from query params
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth errors from Google
    if (error) {
      consoleError(PREFIX.API, "OAuth error from Google:", error);
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent(error)}`,
      );
    }

    // Validate required parameters
    if (!code) {
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent("missing_code")}`,
      );
    }

    if (!state) {
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent("missing_state")}`,
      );
    }

    // Validate admin session and state
    const session = await validateAdminSession(request);
    if (!session.valid) {
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent("unauthorized")}`,
      );
    }

    // Validate state matches stored state (CSRF protection)
    const storedState = await session.getState();
    if (state !== storedState) {
      consoleError(PREFIX.API, "State mismatch - possible CSRF attack");
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent("invalid_state")}`,
      );
    }

    // Clear the stored state after validation
    await session.clearState();

    // Build redirect URI (must match the one used in login)
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens) {
      consoleError(PREFIX.API, "Failed to exchange code for tokens");
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent("token_exchange_failed")}`,
      );
    }

    // Get email from token data
    const email = await getTokenEmailFromData(tokens);
    if (!email) {
      consoleError(PREFIX.API, "Could not extract email from token");
      return NextResponse.redirect(
        `${dashboardUrl}?error=${encodeURIComponent("email_extraction_failed")}`,
      );
    }

    // Save token to storage
    await saveToken(email, tokens);

    // Redirect to dashboard with success message
    return NextResponse.redirect(`${dashboardUrl}?success=account_added`);
  } catch (error) {
    consoleError(PREFIX.API, "Error processing OAuth callback:", error);
    const errorMessage =
      error instanceof Error ? error.message : "unknown_error";
    return NextResponse.redirect(
      `${dashboardUrl}?error=${encodeURIComponent(errorMessage)}`,
    );
  }
}
