/**
 * @file lib/admin-session.ts
 * @description Admin session management utilities.
 * Handles session validation, storage, and cookie management for admin authentication.
 *
 * @module lib/admin-session
 */

import crypto from "node:crypto";
import fs from "node:fs";
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
function ensureSessionsFile(): void {
  const dataDir = path.dirname(SESSIONS_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_FILE_PATH)) {
    fs.writeFileSync(
      SESSIONS_FILE_PATH,
      JSON.stringify({ sessions: [] }, null, 2),
    );
  }
}

/**
 * Reads all sessions from storage
 */
export function readSessions(): SessionStorage {
  ensureSessionsFile();
  try {
    const data = fs.readFileSync(SESSIONS_FILE_PATH, "utf-8");
    return JSON.parse(data) as SessionStorage;
  } catch {
    return { sessions: [] };
  }
}

/**
 * Writes sessions to storage
 */
export function writeSessions(storage: SessionStorage): void {
  ensureSessionsFile();
  fs.writeFileSync(SESSIONS_FILE_PATH, JSON.stringify(storage, null, 2));
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
export function createSession(user: string): AdminSession {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MS);

  const session: AdminSession = {
    id: generateSessionToken(),
    user,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const storage = readSessions();

  // Clean up expired sessions
  storage.sessions = storage.sessions.filter(
    (s) => new Date(s.expiresAt) > now,
  );

  // Add new session
  storage.sessions.push(session);
  writeSessions(storage);

  return session;
}

/**
 * Removes a session by ID
 */
export function removeSession(sessionId: string): boolean {
  const storage = readSessions();
  const initialLength = storage.sessions.length;
  storage.sessions = storage.sessions.filter((s) => s.id !== sessionId);

  if (storage.sessions.length < initialLength) {
    writeSessions(storage);
    return true;
  }
  return false;
}

/**
 * Finds a session by ID
 */
export function findSession(sessionId: string): AdminSession | undefined {
  const storage = readSessions();
  return storage.sessions.find((s) => s.id === sessionId);
}

/**
 * Validates admin credentials against environment variables
 */
export function validateCredentials(
  username: string,
  password: string,
): { valid: boolean; user?: string } {
  // Check primary admin credentials
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (
    adminUsername &&
    adminPassword &&
    username === adminUsername &&
    password === adminPassword
  ) {
    return { valid: true, user: username };
  }

  // Check DASHBOARD_USERS (format: user1:pass1,user2:pass2)
  const dashboardUsers = process.env.DASHBOARD_USERS;
  if (dashboardUsers) {
    const users = dashboardUsers.split(",");
    for (const userEntry of users) {
      const [user, pass] = userEntry.split(":");
      if (user && pass && username === user && password === pass) {
        return { valid: true, user: username };
      }
    }
  }

  return { valid: false };
}

/**
 * Validates an admin session from a request
 */
export function validateAdminSession(
  request: NextRequest,
): SessionValidationResult {
  const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE);

  if (!sessionCookie?.value) {
    return { valid: false, error: "No session cookie found" };
  }

  const session = findSession(sessionCookie.value);

  if (!session) {
    return { valid: false, error: "Session not found" };
  }

  const now = new Date();
  const expiresAt = new Date(session.expiresAt);

  if (expiresAt <= now) {
    // Clean up expired session
    removeSession(session.id);
    return { valid: false, error: "Session expired" };
  }

  return { valid: true, user: session.user };
}
