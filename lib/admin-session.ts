/**
 * @file lib/admin-session.ts
 * @description Admin session management utilities.
 * Handles session validation, storage, and cookie management for admin authentication.
 *
 * @module lib/admin-session
 *
 * @security Session file is NOT encrypted at rest.
 * The session file is stored at `data/admin-sessions.json` which is inside the
 * `data/` directory. This directory is NOT served by Next.js (only `public/` is
 * web-accessible), so the file cannot be fetched via HTTP. The `data/` directory
 * is also excluded from git via `.gitignore`. For deployments with stricter
 * requirements, consider encrypting the file or switching to an in-memory or
 * database-backed session store.
 */

import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

/** Session data structure */
export interface AdminSession {
  id: string;
  user: string;
  createdAt: string;
  expiresAt: string;
}

/** Session storage structure */
interface SessionStorage {
  sessions: AdminSession[];
}

/** Session validation result */
export interface SessionValidationResult {
  valid: boolean;
  user?: string;
  error?: string;
}

/** Session expiry duration in milliseconds (24 hours) */
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Cookie name for admin session */
export const ADMIN_SESSION_COOKIE = "admin_session";

/** Path to sessions storage file */
const SESSIONS_FILE_PATH = path.join(
  process.cwd(),
  "data",
  "admin-sessions.json",
);

/**
 * Ensures the data directory and sessions file exist
 */
async function ensureSessionsFile(): Promise<void> {
  const dataDir = path.dirname(SESSIONS_FILE_PATH);
  try {
    await fsPromises.access(dataDir);
  } catch {
    await fsPromises.mkdir(dataDir, { recursive: true });
  }
  try {
    await fsPromises.access(SESSIONS_FILE_PATH);
  } catch {
    await fsPromises.writeFile(
      SESSIONS_FILE_PATH,
      JSON.stringify({ sessions: [] }, null, 2),
    );
  }
}

/**
 * Reads all sessions from storage
 */
export async function readSessions(): Promise<SessionStorage> {
  await ensureSessionsFile();
  try {
    const data = await fsPromises.readFile(SESSIONS_FILE_PATH, "utf-8");
    return JSON.parse(data) as SessionStorage;
  } catch {
    return { sessions: [] };
  }
}

/**
 * Writes sessions to storage
 */
export async function writeSessions(storage: SessionStorage): Promise<void> {
  await ensureSessionsFile();
  await fsPromises.writeFile(
    SESSIONS_FILE_PATH,
    JSON.stringify(storage, null, 2),
  );
}

/**
 * Generates a secure session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates a new session and stores it
 */
export async function createSession(user: string): Promise<AdminSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MS);

  const session: AdminSession = {
    id: generateSessionToken(),
    user,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const storage = await readSessions();

  // Clean up expired sessions
  storage.sessions = storage.sessions.filter(
    (s) => new Date(s.expiresAt) > now,
  );

  // Add new session
  storage.sessions.push(session);
  await writeSessions(storage);

  return session;
}

/**
 * Removes a session by ID
 */
export async function removeSession(sessionId: string): Promise<boolean> {
  const storage = await readSessions();
  const initialLength = storage.sessions.length;
  storage.sessions = storage.sessions.filter((s) => s.id !== sessionId);

  if (storage.sessions.length < initialLength) {
    await writeSessions(storage);
    return true;
  }
  return false;
}

/**
 * Finds a session by ID
 */
export async function findSession(
  sessionId: string,
): Promise<AdminSession | undefined> {
  const storage = await readSessions();
  return storage.sessions.find((s) => s.id === sessionId);
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");

  if (aBuf.length !== bBuf.length) {
    // Consume constant time even on length mismatch
    crypto.timingSafeEqual(bBuf, bBuf);
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Validates admin credentials against Redis-stored credentials.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function validateCredentials(
  username: string,
  password: string,
): Promise<{ valid: boolean; user?: string }> {
  try {
    // Import dynamically to avoid circular dependencies
    const { getRedisClient } = await import("@/lib/gswarm/storage/redis");
    const redis = getRedisClient();

    // Read admin credentials from Redis key "admin-users"
    const adminDataStr = await redis.get("admin-users");
    if (!adminDataStr) {
      // Fallback to .env for backward compatibility during migration
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;
      const dashboardUsers = process.env.DASHBOARD_USERS;

      if (
        adminUsername &&
        adminPassword &&
        safeCompare(username, adminUsername) &&
        safeCompare(password, adminPassword)
      ) {
        return { valid: true, user: username };
      }

      if (dashboardUsers) {
        const users = dashboardUsers.split(",");
        for (const userEntry of users) {
          const [user, pass] = userEntry.split(":");
          if (
            user &&
            pass &&
            safeCompare(username, user) &&
            safeCompare(password, pass)
          ) {
            return { valid: true, user: username };
          }
        }
      }

      return { valid: false };
    }

    const adminData = JSON.parse(adminDataStr) as {
      adminUsername: string;
      adminPassword: string;
      dashboardUsers: string;
    };

    // Check primary admin credentials
    const adminUsername = adminData.adminUsername;
    const adminPassword = adminData.adminPassword;

    if (
      adminUsername &&
      adminPassword &&
      safeCompare(username, adminUsername) &&
      safeCompare(password, adminPassword)
    ) {
      return { valid: true, user: username };
    }

    // Check DASHBOARD_USERS (format: user1:pass1,user2:pass2)
    const dashboardUsers = adminData.dashboardUsers;
    if (dashboardUsers) {
      const users = dashboardUsers.split(",");
      for (const userEntry of users) {
        const [user, pass] = userEntry.split(":");
        if (
          user &&
          pass &&
          safeCompare(username, user) &&
          safeCompare(password, pass)
        ) {
          return { valid: true, user: username };
        }
      }
    }

    return { valid: false };
  } catch {
    // Fallback to .env on Redis errors
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (
      adminUsername &&
      adminPassword &&
      safeCompare(username, adminUsername) &&
      safeCompare(password, adminPassword)
    ) {
      return { valid: true, user: username };
    }

    return { valid: false };
  }
}

/**
 * Validates an admin session from a request
 */
export async function validateAdminSession(
  request: NextRequest,
): Promise<SessionValidationResult> {
  const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE);

  if (!sessionCookie?.value) {
    return { valid: false, error: "No session cookie found" };
  }

  const session = await findSession(sessionCookie.value);

  if (!session) {
    return { valid: false, error: "Session not found" };
  }

  const now = new Date();
  const expiresAt = new Date(session.expiresAt);

  if (expiresAt <= now) {
    // Clean up expired session
    await removeSession(session.id);
    return { valid: false, error: "Session expired" };
  }

  return { valid: true, user: session.user };
}
