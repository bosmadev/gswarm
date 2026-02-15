/**
 * GSwarm OAuth Service
 *
 * Web-based Google OAuth 2.0 implementation for authentication.
 * Handles authorization URL generation, token exchange, refresh, and revocation.
 *
 * Based on GSwarm's OAuth flow, adapted for web-based authentication
 * where the callback is handled by /api/auth/callback.
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import type { GoogleUserInfo, OAuthError, TokenData } from "./types";

// =============================================================================
// OAuth Constants
// =============================================================================

/**
 * OAuth credentials extracted from gemini-cli source.
 * These are public credentials embedded in the open-source gemini-cli.
 * @see https://github.com/google-gemini/gemini-cli
 */
const CLIENT_ID =
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const CLIENT_SECRET = "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";

function getClientId(): string {
  return CLIENT_ID;
}

function getClientSecret(): string {
  return CLIENT_SECRET;
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

// =============================================================================
// Type Guards for API Responses
// =============================================================================

/**
 * Gemini API error details structure for VALIDATION_REQUIRED
 */
interface GeminiApiError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      "@type"?: string;
      metadata?: Record<string, string>;
    }>;
  };
}

/**
 * Type guard for OAuthError responses
 */
function isOAuthError(data: unknown): data is OAuthError {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as Record<string, unknown>).error === "string"
  );
}

/**
 * Type guard for Gemini API error responses
 */
function isGeminiApiError(data: unknown): data is GeminiApiError {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as Record<string, unknown>).error === "object"
  );
}

/**
 * Type guard for Google user info responses
 */
function isGoogleUserInfo(data: unknown): data is GoogleUserInfo {
  return (
    typeof data === "object" &&
    data !== null &&
    "email" in data &&
    typeof (data as Record<string, unknown>).email === "string"
  );
}

/**
 * Type guard for raw token response from Google
 */
function isTokenResponse(data: unknown): data is {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "access_token" in data &&
    typeof (data as Record<string, unknown>).access_token === "string" &&
    "expires_in" in data &&
    typeof (data as Record<string, unknown>).expires_in === "number"
  );
}

// =============================================================================
// Token Parsing
// =============================================================================

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
// Validation URL Extraction
// =============================================================================

/**
 * Extract validation URL from Gemini API error response
 *
 * When a user's account requires one-time verification (VALIDATION_REQUIRED),
 * the API returns a 403 error with a validation URL in error.details[].metadata.
 *
 * @param errorData - Raw error response from Gemini API
 * @returns Validation URL if present, null otherwise
 *
 * @example
 * ```ts
 * const error = await response.json();
 * const url = extractValidationUrl(error);
 * if (url) {
 *   console.log("Please visit:", url);
 * }
 * ```
 */
export function extractValidationUrl(errorData: unknown): string | null {
  if (!isGeminiApiError(errorData)) {
    return null;
  }

  const details = errorData.error?.details;
  if (!Array.isArray(details) || details.length === 0) {
    return null;
  }

  // Look for validation_url in metadata of any detail entry
  for (const detail of details) {
    const metadata = detail.metadata;
    if (metadata && typeof metadata === "object") {
      const validationUrl = metadata.validation_url;
      if (typeof validationUrl === "string" && validationUrl.length > 0) {
        consoleDebug(PREFIX.API, `Found validation URL: ${validationUrl}`);
        return validationUrl;
      }
    }
  }

  return null;
}

/**
 * Discover GCP projects accessible with a token
 *
 * Uses Cloud Resource Manager API to list all projects the token has access to.
 * This is called after initial token creation or during refresh to populate
 * the projects array in StoredToken.
 *
 * @param accessToken - OAuth access token
 * @returns Array of project IDs, empty array on failure
 *
 * @example
 * ```ts
 * const projects = await discoverProjects(token.access_token);
 * console.log("Found projects:", projects);
 * ```
 */
export async function discoverProjects(accessToken: string): Promise<string[]> {
  consoleDebug(PREFIX.API, "Discovering GCP projects");

  try {
    const projects: string[] = [];
    let pageToken: string | undefined;

    // Paginate through all projects
    do {
      const url = new URL(
        "https://cloudresourcemanager.googleapis.com/v1/projects",
      );
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        consoleError(
          PREFIX.ERROR,
          `Failed to list projects: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const data: unknown = await response.json();

      // Type guard for projects response
      if (
        typeof data === "object" &&
        data !== null &&
        "projects" in data &&
        Array.isArray((data as { projects?: unknown[] }).projects)
      ) {
        const projectsData = (data as { projects: { projectId?: string }[] })
          .projects;

        for (const project of projectsData) {
          if (project.projectId && typeof project.projectId === "string") {
            projects.push(project.projectId);
          }
        }

        // Check for next page
        if (
          "nextPageToken" in data &&
          typeof (data as { nextPageToken?: string }).nextPageToken === "string"
        ) {
          pageToken = (data as { nextPageToken: string }).nextPageToken;
        } else {
          pageToken = undefined;
        }
      } else {
        pageToken = undefined;
      }
    } while (pageToken);

    consoleLog(PREFIX.SUCCESS, `Discovered ${projects.length} GCP projects`);
    return projects;
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `Project discovery error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * Check if an error indicates VALIDATION_REQUIRED status
 *
 * @param errorData - Raw error response from API
 * @returns true if error indicates validation is required
 */
export function isValidationRequired(errorData: unknown): boolean {
  if (!isGeminiApiError(errorData)) {
    return false;
  }

  // VALIDATION_REQUIRED is indicated by 403 status code
  const code = errorData.error?.code;
  const message = errorData.error?.message;
  const status = errorData.error?.status;

  // Check for explicit VALIDATION_REQUIRED in status or message
  if (
    status === "VALIDATION_REQUIRED" ||
    message?.includes("VALIDATION_REQUIRED")
  ) {
    return true;
  }

  // Check for 403 with validation_url in details
  if (code === 403 && extractValidationUrl(errorData) !== null) {
    return true;
  }

  return false;
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
      const rawError: unknown = await response.json();
      const errorData = isOAuthError(rawError)
        ? rawError
        : { error: "unknown", error_description: String(rawError) };
      consoleError(
        PREFIX.ERROR,
        `Token exchange failed: ${errorData.error} - ${errorData.error_description || "No description"}`,
      );
      return null;
    }

    const data: unknown = await response.json();
    if (!isTokenResponse(data)) {
      consoleError(
        PREFIX.ERROR,
        "Token exchange returned invalid response shape",
      );
      return null;
    }
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
 * Based on gswarm lines 1612-1652
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
      const rawError: unknown = await response.json();
      const errorData = isOAuthError(rawError)
        ? rawError
        : { error: "unknown", error_description: String(rawError) };
      consoleError(
        PREFIX.ERROR,
        `Token refresh failed: ${errorData.error} - ${errorData.error_description || "No description"}`,
      );
      return null;
    }

    const data: unknown = await response.json();
    if (!isTokenResponse(data)) {
      consoleError(
        PREFIX.ERROR,
        "Token refresh returned invalid response shape",
      );
      return null;
    }
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
 * Based on gswarm lines 1600-1607
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
 * Based on gswarm lines 1658-1678
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

    const rawUserInfo: unknown = await response.json();
    if (!isGoogleUserInfo(rawUserInfo)) {
      consoleError(PREFIX.ERROR, "No email in user info response");
      return null;
    }

    consoleDebug(PREFIX.API, `Retrieved email: ${rawUserInfo.email}`);
    return rawUserInfo.email;
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
  /** Gemini-CLI OAuth client ID */
  CLIENT_ID,
  SCOPE,
  EXPIRY_BUFFER_SECONDS,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_USERINFO_URL,
} as const;
