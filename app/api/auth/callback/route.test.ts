/**
 * @file app/api/auth/callback/route.test.ts
 * @description Tests for GET /api/auth/callback (Google OAuth callback).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gswarm/oauth", () => ({
  exchangeCodeForTokens: vi.fn(),
  getTokenEmailFromData: vi.fn(),
}));

vi.mock("@/lib/gswarm/storage/tokens", () => ({
  saveToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/gswarm/url-builder", () => ({
  getCallbackUrl: vi
    .fn()
    .mockReturnValue("https://example.com/api/auth/callback"),
}));

vi.mock("@/lib/utils", () => ({
  escapeHtml: (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));

vi.mock("@/lib/console", () => ({
  PREFIX: { API: "API", ERROR: "ERROR", SUCCESS: "SUCCESS" },
  consoleLog: vi.fn(),
  consoleError: vi.fn(),
}));

import {
  exchangeCodeForTokens,
  getTokenEmailFromData,
} from "@/lib/gswarm/oauth";
import { GET } from "./route";

function makeRequest(
  params: Record<string, string> = {},
  cookies: Record<string, string> = {},
): import("next/server").NextRequest {
  const url = new URL("https://example.com/api/auth/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return {
    url: url.toString(),
    cookies: {
      get: (key: string) =>
        cookies[key] ? { value: cookies[key] } : undefined,
    },
    headers: { get: () => null },
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns error HTML for missing state cookie (CSRF check)", async () => {
    const req = makeRequest({ code: "some-code", state: "expected-state" });
    const res = await GET(req);
    const text = await res.text();
    expect(text).toContain("Invalid or missing state parameter");
  });

  it("returns error HTML when state mismatch (CSRF mismatch)", async () => {
    const req = makeRequest(
      { code: "some-code", state: "attacker-state" },
      { oauth_state: "expected-state" },
    );
    const res = await GET(req);
    const text = await res.text();
    expect(text).toContain("Invalid or missing state parameter");
  });

  it("returns error HTML when code is missing", async () => {
    // State matches, no code
    const req = makeRequest(
      { state: "csrf-token" },
      { oauth_state: "csrf-token" },
    );
    const res = await GET(req);
    const text = await res.text();
    expect(text).toContain("Missing authorization code");
  });

  it("returns error HTML when OAuth error from Google", async () => {
    const req = makeRequest(
      { error: "access_denied", state: "csrf-token" },
      { oauth_state: "csrf-token" },
    );
    const res = await GET(req);
    const text = await res.text();
    expect(text).toContain("access_denied");
  });

  it("returns success HTML on valid token exchange", async () => {
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "tok",
      refresh_token: "rtok",
    } as Awaited<ReturnType<typeof exchangeCodeForTokens>>);
    vi.mocked(getTokenEmailFromData).mockResolvedValue("user@example.com");

    const req = makeRequest(
      { code: "valid-code", state: "csrf-token" },
      { oauth_state: "csrf-token" },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("user@example.com");
    expect(text).toContain("Account Added");
  });

  it("returns error HTML when token exchange fails", async () => {
    vi.mocked(exchangeCodeForTokens).mockResolvedValue(null);

    const req = makeRequest(
      { code: "bad-code", state: "csrf-token" },
      { oauth_state: "csrf-token" },
    );
    const res = await GET(req);
    const text = await res.text();
    expect(text).toContain("Token exchange failed");
  });
});
