/**
 * GSwarm OAuth Service
 *
 * Web-based Google OAuth 2.0 implementation for authentication.
 * Handles authorization URL generation, token exchange, refresh, and revocation.
 *
 * Based on pulsona's OAuth flow, adapted for web-based authentication
 * where the callback is handled by /api/auth/callback.
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import type { GoogleUserInfo, OAuthError, TokenData } from "./types";

// =============================================================================
// OAuth Constants
// =============================================================================

/**
 * Google OAuth 2.0 Client ID
 *
 * Required environment variable: GOOGLE_CLIENT_ID
 * Obtain from Google Cloud Console: https://console.cloud.google.com/apis/credentials
 */
function getClientId(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "GOOGLE_CLIENT_ID environment variable is required in production",
      );
    }
    consoleError(
      PREFIX.ERROR,
      "GOOGLE_CLIENT_ID not set - OAuth will not work",
    );
    return "";
  }
  return clientId;
}

/**
 * Google OAuth 2.0 Client Secret
 *
 * Required environment variable: GOOGLE_CLIENT_SECRET
 * Obtain from Google Cloud Console: https://console.cloud.google.com/apis/credentials
 */
function getClientSecret(): string {
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "GOOGLE_CLIENT_SECRET environment variable is required in production",
      );
    }
    consoleError(
      PREFIX.ERROR,
      "GOOGLE_CLIENT_SECRET not set - OAuth will not work",
    );
    return "";
  }
  return clientSecret;
}

/** OAuth scopes for cloud platform and user email access */
const SCOPE =
  "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email";

/** Buffer time (seconds) before expiry to trigger refresh */
const EXPIRY_BUFFER_SECONDS = 60;

/** Google OAuth 2.0 endpoints */
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build an OAuth authorization URL with the given parameters
 *
 * @param params - URL parameters to include
 * @returns Constructed URL object
 */
function buildAuthUrl(params: Record<string, string>): URL {
  const url = new URL(GOOGLE_AUTH_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

/**
 * Parse token response and add expiry timestamp
 *
 * @param response - Raw token response from Google
 * @returns TokenData with computed expiry timestamp
 */
function parseTokenResponse(response: {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}): TokenData {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    token_type: response.token_type,
    expires_in: response.expires_in,
    expiry_timestamp: now + response.expires_in,
    scope: response.scope,
    id_token: response.id_token,
  };
}

// =============================================================================
// OAuth Functions
// =============================================================================

/**
 * Generate a Google OAuth authorization URL
 *
 * @param redirectUri - The callback URL to redirect to after authorization
 * @param state - Optional state parameter for CSRF protection
 * @returns The authorization URL string
 *
 * @example
 * ```ts
 * const authUrl = generateAuthUrl("https://example.com/api/auth/callback", "random-state");
 * // Redirect user to authUrl
 * ```
 */
export function generateAuthUrl(redirectUri: string, state?: string): string {
  const params: Record<string, string> = {
    client_id: getClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  };

  if (state) {
    params.state = state;
  }

  const url = buildAuthUrl(params);
  consoleDebug(PREFIX.API, `Generated auth URL for redirect: ${redirectUri}`);
  return url.toString();
}

/**
 * Exchange an authorization code for access and refresh tokens
 *
 * @param code - The authorization code from the OAuth callback
 * @param redirectUri - The redirect URI used in the authorization request
 * @returns TokenData on success, null on failure
 *
 * @example
 * ```ts
 * const tokens = await exchangeCodeForTokens(code, "https://example.com/api/auth/callback");
 * if (tokens) {
 *   console.log("Access token:", tokens.access_token);
 * }
 * ```
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenData | null> {
  consoleDebug(PREFIX.API, "Exchanging authorization code for tokens");

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: getClientId(),
        client_secret: getClientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as OAuthError;
      consoleError(
        PREFIX.ERROR,
        `Token exchange failed: ${errorData.error} - ${errorData.error_description || "No description"}`,
      );
      return null;
    }

    const data = await response.json();
    const tokenData = parseTokenResponse(data);

    consoleLog(PREFIX.SUCCESS, "Successfully exchanged code for tokens");
    return tokenData;
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `Token exchange error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Refresh an access token using a refresh token
 *
 * Based on pulsona lines 1612-1652
 *
 * @param tokenData - Current token data containing the refresh token
 * @returns Updated TokenData on success, null on failure
 *
 * @example
 * ```ts
 * if (isTokenExpired(tokens)) {
 *   const refreshed = await refreshAccessToken(tokens);
 *   if (refreshed) {
 *     tokens = refreshed;
 *   }
 * }
 * ```
 */
export async function refreshAccessToken(
  tokenData: TokenData,
): Promise<TokenData | null> {
  if (!tokenData.refresh_token) {
    consoleError(PREFIX.ERROR, "No refresh token available");
    return null;
  }

  consoleDebug(PREFIX.API, "Refreshing access token");

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: getClientId(),
        client_secret: getClientSecret(),
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as OAuthError;
      consoleError(
        PREFIX.ERROR,
        `Token refresh failed: ${errorData.error} - ${errorData.error_description || "No description"}`,
      );
      return null;
    }

    const data = await response.json();
    const newTokenData = parseTokenResponse(data);

    // Preserve the refresh token if not returned in the response
    if (!newTokenData.refresh_token && tokenData.refresh_token) {
      newTokenData.refresh_token = tokenData.refresh_token;
    }

    consoleLog(PREFIX.SUCCESS, "Successfully refreshed access token");
    return newTokenData;
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `Token refresh error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Check if a token is expired or about to expire
 *
 * Based on pulsona lines 1600-1607
 *
 * @param tokenData - Token data to check
 * @returns true if token is expired or will expire within buffer period
 *
 * @example
 * ```ts
 * if (isTokenExpired(tokens)) {
 *   tokens = await refreshAccessToken(tokens);
 * }
 * ```
 */
export function isTokenExpired(tokenData: TokenData): boolean {
  if (!tokenData.expiry_timestamp) {
    // If no expiry timestamp, assume expired to be safe
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokenData.expiry_timestamp - EXPIRY_BUFFER_SECONDS;

  return now >= expiresAt;
}

/**
 * Get the email address associated with a token
 *
 * Based on pulsona lines 1658-1678
 *
 * @param tokenData - Token data with access token
 * @returns Email address on success, null on failure
 *
 * @example
 * ```ts
 * const email = await getTokenEmailFromData(tokens);
 * if (email) {
 *   console.log("Authenticated as:", email);
 * }
 * ```
 */
export async function getTokenEmailFromData(
  tokenData: TokenData,
): Promise<string | null> {
  consoleDebug(PREFIX.API, "Fetching user email from token");

  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!response.ok) {
      consoleError(
        PREFIX.ERROR,
        `Failed to fetch user info: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const userInfo = (await response.json()) as GoogleUserInfo;

    if (!userInfo.email) {
      consoleError(PREFIX.ERROR, "No email in user info response");
      return null;
    }

    consoleDebug(PREFIX.API, `Retrieved email: ${userInfo.email}`);
    return userInfo.email;
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `User info fetch error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Revoke an access token
 *
 * @param accessToken - The access token to revoke
 * @returns true on success, false on failure
 *
 * @example
 * ```ts
 * const revoked = await revokeToken(tokens.access_token);
 * if (revoked) {
 *   console.log("Token revoked successfully");
 * }
 * ```
 */
export async function revokeToken(accessToken: string): Promise<boolean> {
  consoleDebug(PREFIX.API, "Revoking access token");

  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: accessToken,
      }),
    });

    if (!response.ok) {
      consoleError(
        PREFIX.ERROR,
        `Token revocation failed: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    consoleLog(PREFIX.SUCCESS, "Successfully revoked token");
    return true;
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `Token revocation error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

// =============================================================================
// Exports for Constants (useful for testing)
// =============================================================================

/** OAuth configuration for testing and external use */
export const OAUTH_CONFIG = {
  /** Get the configured client ID (from environment) */
  get CLIENT_ID() {
    return getClientId();
  },
  SCOPE,
  EXPIRY_BUFFER_SECONDS,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_USERINFO_URL,
} as const;
