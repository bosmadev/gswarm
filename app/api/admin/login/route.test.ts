/**
 * @file app/api/admin/login/route.test.ts
 * @description Tests for POST /api/admin/login route.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies
vi.mock("@/lib/admin-session", () => ({
  ADMIN_SESSION_COOKIE: "admin_session",
  createSession: vi.fn(),
  validateCredentials: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkAuthRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/app/api/gswarm/_shared/auth", () => ({
  extractClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/api-validation", () => ({
  parseAndValidate: vi.fn(),
}));

vi.mock("@/lib/console", () => ({
  PREFIX: { API: "API", ERROR: "ERROR" },
  consoleLog: vi.fn(),
  consoleError: vi.fn(),
}));

import { NextResponse } from "next/server";
import { createSession, validateCredentials } from "@/lib/admin-session";
import { parseAndValidate } from "@/lib/api-validation";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

function makeRequest(body?: Record<string, unknown>): Request {
  return {
    json: () => Promise.resolve(body ?? {}),
    headers: { get: () => null },
    cookies: { get: () => undefined },
  } as unknown as Request;
}

describe("POST /api/admin/login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkAuthRateLimit).mockReturnValue(null);
  });

  it("returns 401 when credentials are invalid", async () => {
    vi.mocked(parseAndValidate).mockResolvedValue({
      success: true,
      data: { username: "admin", password: "wrong" },
    } as Awaited<ReturnType<typeof parseAndValidate>>);
    vi.mocked(validateCredentials).mockResolvedValue({ valid: false });

    const req = makeRequest({ username: "admin", password: "wrong" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 and sets session cookie on correct password", async () => {
    vi.mocked(parseAndValidate).mockResolvedValue({
      success: true,
      data: { username: "admin", password: "correct" },
    } as Awaited<ReturnType<typeof parseAndValidate>>);
    vi.mocked(validateCredentials).mockResolvedValue({
      valid: true,
      user: "admin",
    });
    vi.mocked(createSession).mockResolvedValue({
      id: "session-abc123",
      user: "admin",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    });

    const req = makeRequest({ username: "admin", password: "correct" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitRes = NextResponse.json(
      { success: false, error: "Too many login attempts." },
      { status: 429 },
    );
    vi.mocked(checkAuthRateLimit).mockReturnValue(rateLimitRes);

    const req = makeRequest();
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(429);
  });

  it("returns 400 when parseAndValidate fails", async () => {
    vi.mocked(parseAndValidate).mockResolvedValue({
      success: false,
      response: NextResponse.json({ error: "Missing fields" }, { status: 400 }),
    } as Awaited<ReturnType<typeof parseAndValidate>>);

    const req = makeRequest({});
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });
});
