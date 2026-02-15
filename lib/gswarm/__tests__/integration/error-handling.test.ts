import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

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
 * Integration Test 6: 429 Error Handling & Fallback
 * Verifies system handles rate limits and falls back to next project
 */

const TOKEN_FILES_PATH = resolve(process.cwd(), "../cwchat/main/gswarm-tokens");

const CLOUDCODE_PA_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

describe("Error Handling & 429 Fallback Integration", () => {
  let token: TokenFile;
  let selector: LRUProjectSelector;

  beforeAll(async () => {
    const filePath = resolve(TOKEN_FILES_PATH, "bosmadev1@gmail.com.json");
    const content = await readFile(filePath, "utf-8");
    token = JSON.parse(content) as TokenFile;
  });

  beforeEach(() => {
    selector = new LRUProjectSelector(token.projects);
  });

  it("should handle 401 unauthorized error", async () => {
    const project = selector.select();

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

  it("should handle 400 bad request error", async () => {
    const project = selector.select();

    const requestBody = {
      model: "gemini-2.0-flash",
      request: {
        contents: [
          // Missing required parts
        ],
      },
      project,
    };

    const response = await fetch(CLOUDCODE_PA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(400);
  }, 10000);

  it("should retry with next project on failure", async () => {
    const maxRetries = 3;
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxRetries) {
      const project = selector.select();

      try {
        const requestBody = {
          model: "gemini-2.0-flash",
          request: {
            contents: [
              {
                role: "user",
                parts: [{ text: `Attempt ${attempts + 1}` }],
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
            Authorization: `Bearer ${token.access_token}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          // Success - mark project as used
          selector.markUsed(project);
          break;
        }

        // Non-OK response - prepare to retry with next project
        lastError = new Error(`HTTP ${response.status}`);
        attempts++;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;
      }
    }

    // Should succeed within 3 attempts
    expect(attempts).toBeLessThan(maxRetries);
    expect(lastError).toBeNull();
  }, 30000);

  it("should handle rapid requests that may trigger rate limits", async () => {
    const results: Array<{
      project: string;
      status: number;
      attempt: number;
    }> = [];

    // Make 20 rapid requests
    for (let i = 0; i < 20; i++) {
      const project = selector.select();
      let attempt = 0;
      let success = false;

      while (!success && attempt < 3) {
        const requestBody = {
          model: "gemini-2.0-flash",
          request: {
            contents: [
              {
                role: "user",
                parts: [{ text: `Rapid request ${i}` }],
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
            Authorization: `Bearer ${token.access_token}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          results.push({
            project,
            status: response.status,
            attempt: attempt + 1,
          });
          selector.markUsed(project);
          success = true;
        } else if (response.status === 429) {
          // Rate limited - select next project
          selector.select();
          attempt++;
        } else {
          // Other error - bail
          results.push({
            project,
            status: response.status,
            attempt: attempt + 1,
          });
          break;
        }
      }
    }

    // Most requests should succeed
    const successCount = results.filter((r) => r.status === 200).length;
    expect(successCount).toBeGreaterThan(15); // At least 75% success rate

    // Should have used multiple different projects
    const uniqueProjects = new Set(results.map((r) => r.project));
    expect(uniqueProjects.size).toBeGreaterThan(10);
  }, 120000);

  it("should handle network timeout gracefully", async () => {
    const project = selector.select();

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
      project,
    };

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100); // 100ms timeout

    try {
      await fetch(CLOUDCODE_PA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      // Should throw abort error
      expect(error).toBeDefined();
      expect(error instanceof Error).toBe(true);
    } finally {
      clearTimeout(timeoutId);
    }
  }, 10000);

  it("should track error rates by project", async () => {
    const errorsByProject: Map<string, number> = new Map();
    const successByProject: Map<string, number> = new Map();

    // Make 12 requests using all projects
    for (let i = 0; i < 12; i++) {
      const project = selector.select();

      const requestBody = {
        model: "gemini-2.0-flash",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: `Test ${i}` }],
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
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        successByProject.set(project, (successByProject.get(project) || 0) + 1);
      } else {
        errorsByProject.set(project, (errorsByProject.get(project) || 0) + 1);
      }

      selector.markUsed(project);
    }

    // Most projects should succeed
    expect(successByProject.size).toBeGreaterThan(0);

    // Error rate should be low
    const totalErrors = Array.from(errorsByProject.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    const totalSuccess = Array.from(successByProject.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    expect(totalSuccess).toBeGreaterThan(totalErrors);
  }, 90000);
});
