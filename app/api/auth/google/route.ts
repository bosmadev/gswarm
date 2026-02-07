/**
 * GET /api/auth/google
 *
 * OAuth initiation endpoint called by dashboard "Add Account" button.
 * Redirects directly to Google OAuth consent page.
 *
 * This is the missing route that accounts-section.tsx:207-213 was calling.
 * The existing POST /api/auth/login returns JSON; this GET redirects.
 */

import { NextResponse } from "next/server";
import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import { generateAuthUrl } from "@/lib/gswarm/oauth";
import { getCallbackUrl } from "@/lib/gswarm/url-builder";

/**
 * GET /api/auth/google
 *
 * Initiates Google OAuth flow by redirecting to Google's authorization page.
 * No admin session required since it opens in a popup window.
 */
export async function GET() {
  try {
    // Generate CSRF state parameter
    const state = crypto.randomUUID();

    // Build redirect URI from centralized url-builder
    const redirectUri = getCallbackUrl();

    // Generate Google OAuth URL
    const authUrl = generateAuthUrl(redirectUri, state);

    consoleDebug(
      PREFIX.API,
      `OAuth redirect initiated, state: ${state.slice(0, 8)}...`,
    );

    // Redirect to Google OAuth consent page
    return NextResponse.redirect(authUrl);
  } catch (error) {
    consoleError(PREFIX.API, "Error initiating OAuth flow:", error);

    // Return error page for popup
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>OAuth Error</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
  <h1>OAuth Error</h1>
  <p>${errorMessage}</p>
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
