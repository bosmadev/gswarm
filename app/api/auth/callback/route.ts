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
import { escapeHtml } from "@/lib/utils";

/** Cookie name used to store CSRF state parameter during OAuth flow */
const OAUTH_STATE_COOKIE = "oauth_state";

/**
 * Returns an HTML page that communicates result to the opener and closes.
 */
function popupResponse(success: boolean, message: string): NextResponse {
  const safeMessage = escapeHtml(message);
  const safeTitle = success ? "Auth Successful" : "Auth Error";
  const safeHeading = success
    ? "&#x2713; Account Added"
    : "&#x2717; Authentication Failed";
  // Escape </script> sequences in the JSON payload to prevent inline script injection.
  // JSON.stringify does not escape these by default, which allows a crafted `message`
  // containing `</script>` to break out of the <script> block (XSS).
  const payload = JSON.stringify({ success, message }).replace(
    /<\/script>/gi,
    "<\\/script>",
  );
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>${safeTitle}</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center; background: #0c0c14; color: #eaecef;">
  <h2>${safeHeading}</h2>
  <p>${safeMessage}</p>
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
    const stateParam = searchParams.get("state");

    // Validate CSRF state parameter against cookie-stored value
    const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!storedState || !stateParam || storedState !== stateParam) {
      consoleError(PREFIX.API, "OAuth CSRF state mismatch or missing state");
      const res = popupResponse(false, "Invalid or missing state parameter");
      res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
      return res;
    }

    // Handle OAuth errors from Google
    if (error) {
      consoleError(PREFIX.API, "OAuth error from Google:", error);
      const res = popupResponse(false, `Google returned error: ${error}`);
      res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
      return res;
    }

    // Validate code parameter
    if (!code) {
      const res = popupResponse(false, "Missing authorization code");
      res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
      return res;
    }

    // Build redirect URI from centralized url-builder (must match /api/auth/google)
    const redirectUri = getCallbackUrl();

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens) {
      consoleError(PREFIX.API, "Failed to exchange code for tokens");
      const res = popupResponse(false, "Token exchange failed");
      res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
      return res;
    }

    // Get email from token data
    const email = await getTokenEmailFromData(tokens);
    if (!email) {
      consoleError(PREFIX.API, "Could not extract email from token");
      const res = popupResponse(false, "Could not determine account email");
      res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
      return res;
    }

    // Save token to storage
    await saveToken(email, tokens);

    consoleLog(PREFIX.SUCCESS, `OAuth account added: ${email}`);

    // Clear the CSRF state cookie after use (success or failure)
    const response = popupResponse(true, `Account ${email} added successfully`);
    response.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    consoleError(PREFIX.API, "Error processing OAuth callback:", error);
    const res = popupResponse(false, "Authentication failed");
    res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }
}
