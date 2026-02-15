import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { refreshAccessToken } from "../../oauth";

interface TokenFile {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  id_token: string;
  email: string;
  client: string;
  created_at: string;
  updated_at: string;
  projects: string[];
}

/**
 * Integration Test 2: Token Refresh
 * Verifies tokens can be refreshed using Gemini CLI credentials
 */

const TOKEN_FILES_PATH = resolve(process.cwd(), "../cwchat/main/gswarm-tokens");

const EXPECTED_ACCOUNTS = [
  "bosmadev1@gmail.com",
  "bosmadev2@gmail.com",
  "bosmadev3@gmail.com",
];

describe("Token Refresh Integration", () => {
  let tokens: Map<string, TokenFile>;

  beforeAll(async () => {
    tokens = new Map();

    for (const email of EXPECTED_ACCOUNTS) {
      const filePath = resolve(TOKEN_FILES_PATH, `${email}.json`);
      const content = await readFile(filePath, "utf-8");
      const token = JSON.parse(content) as TokenFile;
      tokens.set(email, token);
    }
  });

  it("should refresh access token for bosmadev1@gmail.com", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const refreshedToken = await refreshAccessToken({
      access_token: token?.access_token,
      refresh_token: token?.refresh_token,
      token_type: token?.token_type,
      expires_in: token?.expires_in,
    });

    expect(refreshedToken).not.toBeNull();
    expect(refreshedToken?.access_token).toBeTruthy();
    expect(refreshedToken?.access_token).not.toBe(token?.access_token);
    expect(refreshedToken?.expires_in).toBeGreaterThan(0);
    expect(refreshedToken?.token_type).toBe("Bearer");
  }, 10000);

  it("should refresh access token for bosmadev2@gmail.com", async () => {
    const email = "bosmadev2@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const refreshedToken = await refreshAccessToken({
      access_token: token?.access_token,
      refresh_token: token?.refresh_token,
      token_type: token?.token_type,
      expires_in: token?.expires_in,
    });

    expect(refreshedToken).not.toBeNull();
    expect(refreshedToken?.access_token).toBeTruthy();
    expect(refreshedToken?.access_token).not.toBe(token?.access_token);
    expect(refreshedToken?.expires_in).toBeGreaterThan(0);
    expect(refreshedToken?.token_type).toBe("Bearer");
  }, 10000);

  it("should refresh access token for bosmadev3@gmail.com", async () => {
    const email = "bosmadev3@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const refreshedToken = await refreshAccessToken({
      access_token: token?.access_token,
      refresh_token: token?.refresh_token,
      token_type: token?.token_type,
      expires_in: token?.expires_in,
    });

    expect(refreshedToken).not.toBeNull();
    expect(refreshedToken?.access_token).toBeTruthy();
    expect(refreshedToken?.access_token).not.toBe(token?.access_token);
    expect(refreshedToken?.expires_in).toBeGreaterThan(0);
    expect(refreshedToken?.token_type).toBe("Bearer");
  }, 10000);

  it("should maintain refresh_token after refresh (optional return)", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const refreshedToken = await refreshAccessToken({
      access_token: token?.access_token,
      refresh_token: token?.refresh_token,
      token_type: token?.token_type,
      expires_in: token?.expires_in,
    });

    expect(refreshedToken).not.toBeNull();
    // Google sometimes returns new refresh_token, sometimes doesn't
    if (refreshedToken?.refresh_token) {
      expect(refreshedToken?.refresh_token).toBeTruthy();
    }
  }, 10000);

  it("should refresh all accounts in parallel", async () => {
    const refreshPromises = EXPECTED_ACCOUNTS.map(async (email) => {
      const token = tokens.get(email);
      expect(token).toBeDefined();

      return refreshAccessToken({
        access_token: token?.access_token,
        refresh_token: token?.refresh_token,
        token_type: token?.token_type,
        expires_in: token?.expires_in,
      });
    });

    const results = await Promise.all(refreshPromises);

    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result).not.toBeNull();
      expect(result?.access_token).toBeTruthy();
      expect(result?.expires_in).toBeGreaterThan(0);
    }
  }, 15000);

  it("should return null with invalid refresh token", async () => {
    const result = await refreshAccessToken({
      access_token: "invalid",
      refresh_token: "1//INVALID_TOKEN",
      token_type: "Bearer",
      expires_in: 0,
    });

    expect(result).toBeNull();
  }, 10000);
});
