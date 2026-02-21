/**
 * GET /api/auth/google
 *
 * OAuth initiation endpoint called by dashboard "Add Account" button.
 * Redirects directly to Google OAuth consent page.
 *
 * This is the missing route that accounts-section.tsx:207-213 was calling.
 * The existing POST /api/auth/login returns JSON; this GET redirects.
 */

import { type NextRequest, NextResponse } from "next/server";
import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import { validateAdminSession } from "@/lib/admin-session";
import { generateAuthUrl } from "@/lib/gswarm/oauth";
import { getCallbackUrl } from "@/lib/gswarm/url-builder";
import { escapeHtml } from "@/lib/utils";

/** Cookie name used to store CSRF state parameter during OAuth flow */
const OAUTH_STATE_COOKIE = "oauth_state";

/**
 * GET /api/auth/google
 *
 * Initiates Google OAuth flow by redirecting to Google's authorization page.
 * Requires valid admin session to prevent unauthenticated OAuth initiation.
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin session before initiating OAuth flow
    const session = await validateAdminSession(request);
    if (!session.valid) {
      return new NextResponse(
        `<!DOCTYPE html>
<html>
<head><title>Unauthorized</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
  <h1>Unauthorized</h1>
  <p>Admin session required to add accounts.</p>
  <script>
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`,
        {
          status: 401,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    // Build redirect URI from centralized url-builder
    const redirectUri = getCallbackUrl();

    // Generate Google OAuth URL; state auto-generated if not provided
    const { url: authUrl, state } = generateAuthUrl(redirectUri);

    consoleDebug(
      PREFIX.API,
      `OAuth redirect initiated, state: ${state.slice(0, 8)}...`,
    );

    // Store state in cookie for CSRF validation in callback
    const response = NextResponse.redirect(authUrl);
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes — expires after OAuth round-trip
    });
    return response;
  } catch (error) {
    consoleError(PREFIX.API, "Error initiating OAuth flow:", error);

    // Return generic error page — do not expose internal error.message
    const safeError = error instanceof Error ? escapeHtml(error.message) : "Unknown error";
    consoleError(PREFIX.API, "OAuth initiation error detail:", safeError);

    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>OAuth Error</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
  <h1>OAuth Error</h1>
  <p>Failed to initiate authentication. Please try again.</p>
  <script>
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      },
    );
  }
}
