/**
 * @file app/api/auth/callback/route.ts
 * @description Google OAuth callback handler.
 * Exchanges authorization code for tokens, fetches user email, and saves.
 * Renders an HTML page that posts a message to the opener window and closes.
 *
 * Based on pulsona's performBrowserLogin flow, adapted for web popup.
 */

import { type NextRequest, NextResponse } from "next/server";
import { PREFIX, consoleError, consoleLog } from "@/lib/console";
import {
  exchangeCodeForTokens,
  getTokenEmailFromData,
} from "@/lib/gswarm/oauth";
import { saveToken } from "@/lib/gswarm/storage/tokens";
import { getCallbackUrl } from "@/lib/gswarm/url-builder";

/**
 * Returns an HTML page that communicates result to the opener and closes.
 */
function popupResponse(success: boolean, message: string): NextResponse {
  const payload = JSON.stringify({ success, message });
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>${success ? "Auth Successful" : "Auth Error"}</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center; background: #0c0c14; color: #eaecef;">
  <h2>${success ? "✓ Account Added" : "✗ Authentication Failed"}</h2>
  <p>${message}</p>
  <p style="color: #71717a; font-size: 0.875rem;">This window will close automatically...</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(${payload}, window.location.origin);
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`,
    {
      status: success ? 200 : 400,
      headers: { "Content-Type": "text/html" },
    },
  );
}

/**
 * GET /api/auth/callback
 * Google OAuth callback — exchanges code for tokens and saves account.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    // Handle OAuth errors from Google
    if (error) {
      consoleError(PREFIX.API, "OAuth error from Google:", error);
      return popupResponse(false, `Google returned error: ${error}`);
    }

    // Validate code parameter
    if (!code) {
      return popupResponse(false, "Missing authorization code");
    }

    // Build redirect URI from centralized url-builder (must match /api/auth/google)
    const redirectUri = getCallbackUrl();

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens) {
      consoleError(PREFIX.API, "Failed to exchange code for tokens");
      return popupResponse(false, "Token exchange failed");
    }

    // Get email from token data
    const email = await getTokenEmailFromData(tokens);
    if (!email) {
      consoleError(PREFIX.API, "Could not extract email from token");
      return popupResponse(false, "Could not determine account email");
    }

    // Save token to storage
    await saveToken(email, tokens);

    consoleLog(PREFIX.SUCCESS, `OAuth account added: ${email}`);
    return popupResponse(true, `Account ${email} added successfully`);
  } catch (error) {
    consoleError(PREFIX.API, "Error processing OAuth callback:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return popupResponse(false, errorMessage);
  }
}
