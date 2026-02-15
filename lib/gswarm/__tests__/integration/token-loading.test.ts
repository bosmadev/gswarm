import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Token structure in JSON files (cwchat format)
 * Different from StoredToken which uses Unix timestamps
 */
interface TokenFile {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  id_token: string;
  email: string;
  client: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  projects: string[];
}

/**
 * Integration Test 1: Token Loading
 * Verifies all 3 token files can be loaded and have required fields
 */

const TOKEN_FILES_PATH = resolve("D:/source/cwchat/main/gswarm-tokens");

const EXPECTED_ACCOUNTS = [
  "bosmadev1@gmail.com",
  "bosmadev2@gmail.com",
  "bosmadev3@gmail.com",
];

describe("Token Loading Integration", () => {
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

  it("should load all 3 token files", () => {
    expect(tokens.size).toBe(3);
    for (const email of EXPECTED_ACCOUNTS) {
      expect(tokens.has(email)).toBe(true);
    }
  });

  it("should have refresh_token field in each token", () => {
    for (const [email, token] of tokens) {
      expect(
        token.refresh_token,
        `${email} missing refresh_token`,
      ).toBeDefined();
      expect(
        token.refresh_token,
        `${email} refresh_token is empty`,
      ).toBeTruthy();
      expect(
        typeof token.refresh_token,
        `${email} refresh_token not string`,
      ).toBe("string");
    }
  });

  it("should have access_token field in each token", () => {
    for (const [email, token] of tokens) {
      expect(token.access_token, `${email} missing access_token`).toBeDefined();
      expect(token.access_token, `${email} access_token is empty`).toBeTruthy();
      expect(
        typeof token.access_token,
        `${email} access_token not string`,
      ).toBe("string");
    }
  });

  it("should have email field matching filename", () => {
    for (const [email, token] of tokens) {
      expect(token.email, `${email} missing email field`).toBeDefined();
      expect(token.email, `${email} email mismatch`).toBe(email);
    }
  });

  it("should have projects array with exactly 12 projects", () => {
    for (const [email, token] of tokens) {
      expect(token.projects, `${email} missing projects`).toBeDefined();
      expect(Array.isArray(token.projects), `${email} projects not array`).toBe(
        true,
      );
      expect(token.projects.length, `${email} projects count mismatch`).toBe(
        12,
      );
    }
  });

  it("should have client field set to gemini-cli", () => {
    for (const [email, token] of tokens) {
      expect(token.client, `${email} missing client field`).toBeDefined();
      expect(token.client, `${email} client mismatch`).toBe("gemini-cli");
    }
  });

  it("should have valid OAuth scopes", () => {
    const requiredScopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    for (const [email, token] of tokens) {
      expect(token.scope, `${email} missing scope`).toBeDefined();

      for (const scope of requiredScopes) {
        expect(
          token.scope.includes(scope),
          `${email} missing scope: ${scope}`,
        ).toBe(true);
      }
    }
  });

  it("should have created_at and updated_at timestamps", () => {
    for (const [email, token] of tokens) {
      expect(token.created_at, `${email} missing created_at`).toBeDefined();
      expect(token.updated_at, `${email} missing updated_at`).toBeDefined();

      // Verify ISO 8601 format
      expect(
        () => new Date(token.created_at),
        `${email} invalid created_at`,
      ).not.toThrow();
      expect(
        () => new Date(token.updated_at),
        `${email} invalid updated_at`,
      ).not.toThrow();
    }
  });

  it("should have unique project IDs across all projects", () => {
    const allProjects = new Set<string>();

    for (const [email, token] of tokens) {
      for (const project of token.projects) {
        expect(
          allProjects.has(project),
          `Duplicate project ${project} in ${email}`,
        ).toBe(false);
        allProjects.add(project);
      }
    }

    expect(allProjects.size).toBe(36); // 3 accounts × 12 projects
  });

  it("should have valid project ID format", () => {
    const projectIdPattern = /^(geminiswarm|gswarm|gen-lang-client)-\d+$/;

    for (const [email, token] of tokens) {
      for (const project of token.projects) {
        expect(
          projectIdPattern.test(project),
          `${email} has invalid project ID: ${project}`,
        ).toBe(true);
      }
    }
  });
});
