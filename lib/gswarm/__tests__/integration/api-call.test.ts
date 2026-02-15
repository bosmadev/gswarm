import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

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
 * Integration Test 3: API Call
 * Verifies authenticated CloudCode PA API calls work for all accounts/projects
 */

const TOKEN_FILES_PATH = resolve(process.cwd(), "../cwchat/main/gswarm-tokens");

const CLOUDCODE_PA_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

const EXPECTED_ACCOUNTS = [
  "bosmadev1@gmail.com",
  "bosmadev2@gmail.com",
  "bosmadev3@gmail.com",
];

interface GenerateContentRequest {
  model: string;
  request: {
    contents: Array<{
      role: string;
      parts: Array<{ text: string }>;
    }>;
    generationConfig?: {
      maxOutputTokens?: number;
      temperature?: number;
    };
  };
  project: string;
}

describe("CloudCode PA API Integration", () => {
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

  it("should make successful API call with bosmadev1 first project", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const project = token?.projects[0];
    const requestBody: GenerateContentRequest = {
      model: "gemini-2.0-flash",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say hello in 3 words" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0.1,
        },
      },
      project,
    };

    const response = await fetch(CLOUDCODE_PA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token?.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
    expect(data.candidates).toBeDefined();
    expect(data.candidates.length).toBeGreaterThan(0);
  }, 15000);

  it("should test all 3 accounts with their first project", async () => {
    const testPromises = EXPECTED_ACCOUNTS.map(async (email) => {
      const token = tokens.get(email);
      expect(token).toBeDefined();

      const project = token?.projects[0];
      const requestBody: GenerateContentRequest = {
        model: "gemini-2.0-flash",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: "Say OK" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 5,
            temperature: 0.1,
          },
        },
        project,
      };

      const response = await fetch(CLOUDCODE_PA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token?.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      return {
        email,
        project,
        status: response.status,
        ok: response.ok,
      };
    });

    const results = await Promise.all(testPromises);

    for (const result of results) {
      expect(result.status, `${result.email}:${result.project}`).toBe(200);
      expect(result.ok, `${result.email}:${result.project}`).toBe(true);
    }
  }, 30000);

  it("should test multiple projects from same account", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    // Test first 3 projects
    const projectsToTest = token?.projects.slice(0, 3);

    const testPromises = projectsToTest.map(async (project) => {
      const requestBody: GenerateContentRequest = {
        model: "gemini-2.0-flash",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: "Respond with: OK" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 5,
            temperature: 0.1,
          },
        },
        project,
      };

      const response = await fetch(CLOUDCODE_PA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token?.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      return {
        project,
        status: response.status,
      };
    });

    const results = await Promise.all(testPromises);

    for (const result of results) {
      expect(result.status, `Project ${result.project}`).toBe(200);
    }
  }, 30000);

  it("should fail with invalid access token", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const project = token?.projects[0];
    const requestBody: GenerateContentRequest = {
      model: "gemini-2.0-flash",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
        ],
      },
      project,
    };

    const response = await fetch(CLOUDCODE_PA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer INVALID_TOKEN",
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(401);
  }, 10000);

  it("should fail with missing project field", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const requestBody = {
      model: "gemini-2.0-flash",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
        ],
      },
      // Missing project field
    };

    const response = await fetch(CLOUDCODE_PA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token?.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(400);
  }, 10000);
});
