/**
 * @file lib/gswarm/__tests__/auth.test.ts
 * @description Tests for authenticateRequest() and validateAdminSession()
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock validateApiKey from storage
vi.mock("@/lib/gswarm/storage/api-keys", () => ({
  validateApiKey: vi.fn(),
}));

// Mock fs/promises and fs to avoid real file system access
vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
  access: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: { renameSync: vi.fn() },
  renameSync: vi.fn(),
}));

import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import fsPromises from "node:fs/promises";

// Helper to build a mock NextRequest
function makeRequest(
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
): import("next/server").NextRequest {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    cookies: {
      get: (key: string) => (cookies[key] ? { value: cookies[key] } : undefined),
    },
  } as unknown as import("next/server").NextRequest;
}

describe("authenticateRequest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success: false with missingApiKey when no authorization header", async () => {
    const { authenticateRequest } = await import("@/app/api/gswarm/_shared/auth");
    const req = makeRequest();
    const result = await authenticateRequest(req, "/api/gswarm/generate");
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/api key/i);
  });

  it("returns success: true for valid API key", async () => {
    vi.mocked(validateApiKey).mockResolvedValue({
      valid: true,
      name: "test-key",
      rate_limit_remaining: 99,
      rate_limit_reset: 0,
    } as Awaited<ReturnType<typeof validateApiKey>>);

    const { authenticateRequest } = await import("@/app/api/gswarm/_shared/auth");
    const req = makeRequest({ authorization: "Bearer valid-key-123" });
    const result = await authenticateRequest(req, "/api/gswarm/generate");

    expect(result.success).toBe(true);
    expect(result.keyName).toBe("test-key");
    expect(result.rateLimitRemaining).toBe(99);
  });

  it("returns success: false with rateLimit error when rate limited", async () => {
    vi.mocked(validateApiKey).mockResolvedValue({
      valid: false,
      error: "Rate limit exceeded",
      rate_limit_remaining: 0,
      rate_limit_reset: 1700000000,
    } as Awaited<ReturnType<typeof validateApiKey>>);

    const { authenticateRequest } = await import("@/app/api/gswarm/_shared/auth");
    const req = makeRequest({ authorization: "Bearer some-key" });
    const result = await authenticateRequest(req, "/api/gswarm/generate");

    expect(result.success).toBe(false);
    expect(result.rateLimitRemaining).toBe(0);
  });

  it("returns success: false for invalid/unknown API key", async () => {
    vi.mocked(validateApiKey).mockResolvedValue({
      valid: false,
      error: "Invalid API key",
    } as Awaited<ReturnType<typeof validateApiKey>>);

    const { authenticateRequest } = await import("@/app/api/gswarm/_shared/auth");
    const req = makeRequest({ authorization: "Bearer bad-key" });
    const result = await authenticateRequest(req, "/api/gswarm/generate");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("extracts raw key when no Bearer prefix", async () => {
    vi.mocked(validateApiKey).mockResolvedValue({
      valid: true,
      name: "raw-key",
    } as Awaited<ReturnType<typeof validateApiKey>>);

    const { authenticateRequest } = await import("@/app/api/gswarm/_shared/auth");
    const req = makeRequest({ authorization: "raw-api-key-value" });
    const result = await authenticateRequest(req, "/api/gswarm/generate");

    expect(result.success).toBe(true);
    expect(validateApiKey).toHaveBeenCalledWith(
      "raw-api-key-value",
      expect.any(String),
      "/api/gswarm/generate",
    );
  });
});

describe("validateAdminSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns valid: false when no session cookie", async () => {
    const { validateAdminSession } = await import("@/lib/admin-session");
    const req = makeRequest();
    const result = await validateAdminSession(req);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cookie/i);
  });

  it("returns valid: false when session not found in storage", async () => {
    // readFile returns empty sessions list
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ sessions: [] }),
    );

    const { validateAdminSession } = await import("@/lib/admin-session");
    const req = makeRequest({}, { admin_session: "nonexistent-session-id" });
    const result = await validateAdminSession(req);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns valid: false for expired session", async () => {
    const expiredSession = {
      id: "expired-session-id",
      user: "admin",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
    };
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ sessions: [expiredSession] }),
    );
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

    const { validateAdminSession } = await import("@/lib/admin-session");
    const req = makeRequest({}, { admin_session: "expired-session-id" });
    const result = await validateAdminSession(req);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("returns valid: true for valid active session", async () => {
    const activeSession = {
      id: "valid-session-id",
      user: "admin",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
    };
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ sessions: [activeSession] }),
    );

    const { validateAdminSession } = await import("@/lib/admin-session");
    const req = makeRequest({}, { admin_session: "valid-session-id" });
    const result = await validateAdminSession(req);
    expect(result.valid).toBe(true);
    expect(result.user).toBe("admin");
  });
});
