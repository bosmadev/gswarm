/**
 * GSwarm Session Management
 *
 * Provides admin session validation and state management for OAuth flows.
 * Uses cookies for session tracking and CSRF state storage.
 */

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { PREFIX, consoleDebug, consoleError } from "@/lib/console";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Admin session validation result
 */
export interface AdminSession {
  /** Whether the session is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Get stored OAuth state */
  getState: () => Promise<string | null>;
  /** Set OAuth state for CSRF protection */
  setState: (state: string) => Promise<void>;
  /** Clear OAuth state after use */
  clearState: () => Promise<void>;
}

// =============================================================================
// STATE STORAGE (In-memory for simplicity - should use Redis/KV in production)
// =============================================================================

/** In-memory state storage with expiration */
const stateStore = new Map<string, { state: string; expiresAt: number }>();

/** State TTL in milliseconds (10 minutes) */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Clean up expired states periodically
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [key, value] of stateStore.entries()) {
    if (now > value.expiresAt) {
      stateStore.delete(key);
    }
  }
}

// Run cleanup every minute
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredStates, 60 * 1000);
}

// =============================================================================
// ADMIN SESSION VALIDATION
// =============================================================================

/**
 * Get the admin password from environment
 */
function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

/**
 * Extract session ID from request (from cookie or header)
 */
function getSessionId(request: NextRequest): string | null {
  // Try cookie first
  const sessionCookie = request.cookies.get("gswarm_session");
  if (sessionCookie?.value) {
    return sessionCookie.value;
  }

  // Try header
  const sessionHeader = request.headers.get("x-session-id");
  if (sessionHeader) {
    return sessionHeader;
  }

  return null;
}

/**
 * Extract admin credentials from request
 *
 * SECURITY: Only accepts credentials via Authorization header or
 * X-Admin-Password header. Cookie-based password transmission was
 * removed to prevent exposure in browser history/logs and XSS risk.
 */
function getAdminCredentials(request: NextRequest): string | null {
  // Check Authorization header (Basic auth)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const base64 = authHeader.slice(6);
      const decoded = Buffer.from(base64, "base64").toString("utf-8");
      const [, password] = decoded.split(":");
      return password ?? null;
    } catch {
      return null;
    }
  }

  // Check X-Admin-Password header
  const passwordHeader = request.headers.get("x-admin-password");
  if (passwordHeader) {
    return passwordHeader;
  }

  return null;
}

/**
 * Timing-safe password comparison to prevent timing attacks.
 * Returns true if passwords match, false otherwise.
 */
function safePasswordCompare(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");

  // If lengths differ, still do a comparison to maintain constant time
  if (providedBuf.length !== expectedBuf.length) {
    // Compare against expected to consume same time regardless
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Validate admin session from request
 *
 * Checks for valid admin credentials via:
 * - Basic Authorization header
 * - X-Admin-Password header
 * - admin_password cookie
 *
 * @param request - Next.js request object
 * @returns AdminSession with validation result and state management methods
 */
export async function validateAdminSession(
  request: NextRequest,
): Promise<AdminSession> {
  const adminPassword = getAdminPassword();

  // If no admin password configured, check environment
  if (!adminPassword) {
    // SECURITY: Fail closed in production - deny access if no password configured
    if (process.env.NODE_ENV === "production") {
      consoleError(
        PREFIX.ERROR,
        "[Session] ADMIN_PASSWORD not configured in production - denying access",
      );
      return createInvalidSession(
        "Admin access disabled: ADMIN_PASSWORD not configured",
      );
    }

    // Development mode: allow access but log prominently
    // SECURITY: This path is only reachable when NODE_ENV !== "production"
    // AND ADMIN_PASSWORD is not set. Still log a warning for visibility.
    consoleError(
      PREFIX.WARNING,
      "[Session] ⚠️ ADMIN_PASSWORD not configured — dev mode access granted. Set ADMIN_PASSWORD to secure this endpoint.",
    );
    return createValidSession("dev-session");
  }

  // Get credentials from request
  const providedPassword = getAdminCredentials(request);

  if (!providedPassword) {
    consoleDebug(PREFIX.DEBUG, "[Session] No admin credentials provided");
    return createInvalidSession("No admin credentials provided");
  }

  // Validate password using timing-safe comparison
  if (!safePasswordCompare(providedPassword, adminPassword)) {
    consoleError(PREFIX.ERROR, "[Session] Invalid admin password");
    return createInvalidSession("Invalid admin password");
  }

  // Get or create session ID
  let sessionId = getSessionId(request);
  if (!sessionId) {
    sessionId = generateSessionId();
  }

  consoleDebug(
    PREFIX.DEBUG,
    `[Session] Valid admin session: ${sessionId.slice(0, 8)}...`,
  );
  return createValidSession(sessionId);
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Create a valid session object
 */
function createValidSession(sessionId: string): AdminSession {
  return {
    valid: true,
    getState: async () => {
      const entry = stateStore.get(sessionId);
      if (!entry || Date.now() > entry.expiresAt) {
        return null;
      }
      return entry.state;
    },
    setState: async (state: string) => {
      stateStore.set(sessionId, {
        state,
        expiresAt: Date.now() + STATE_TTL_MS,
      });
    },
    clearState: async () => {
      stateStore.delete(sessionId);
    },
  };
}

/**
 * Create an invalid session object
 */
function createInvalidSession(error: string): AdminSession {
  return {
    valid: false,
    error,
    getState: async () => null,
    setState: async () => {},
    clearState: async () => {},
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateAdminSession,
};
