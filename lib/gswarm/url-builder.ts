/**
 * Runtime URL builder for OAuth and API callbacks
 *
 * Constructs URLs from GLOBAL_URL or GLOBAL_PORT environment variables.
 *
 * @module lib/gswarm/url-builder
 */

/**
 * Get application base URL with runtime port support
 *
 * Priority:
 * 1. GLOBAL_URL (production, explicit override for custom domains)
 * 2. GLOBAL_PORT env var (development, runtime)
 * 3. Fallback to 3000 (Next.js default)
 *
 * @returns Base URL without trailing slash
 */
export function getAppUrl(): string {
  const port = process.env.GLOBAL_PORT || process.env.PORT || "3000";
  const url = (process.env.GLOBAL_URL || "http://localhost").replace(/\/$/, "");

  // HTTPS production domains don't need explicit port (443 is implicit)
  if (url.startsWith("https://")) return url;

  // HTTP URLs: append port
  return `${url}:${port}`;
}

/**
 * Get OAuth callback URL
 *
 * @returns Full callback URL for OAuth redirects
 */
export function getCallbackUrl(): string {
  return `${getAppUrl()}/api/auth/callback`;
}
