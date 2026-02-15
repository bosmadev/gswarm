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
 * Integration Test 5: Model Support
 * Verifies all 5 Gemini models work with CloudCode PA
 */

const TOKEN_FILES_PATH = resolve(process.cwd(), "../cwchat/main/gswarm-tokens");

const CLOUDCODE_PA_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

const SUPPORTED_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
];

describe("Model Support Integration", () => {
  let token: TokenFile;
  let project: string;

  beforeAll(async () => {
    // Use bosmadev1 for model testing
    const filePath = resolve(TOKEN_FILES_PATH, "bosmadev1@gmail.com.json");
    const content = await readFile(filePath, "utf-8");
    token = JSON.parse(content) as TokenFile;
    project = token.projects[0];
  });

  it("should support gemini-2.0-flash", async () => {
    const requestBody = {
      model: "gemini-2.0-flash",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say: 2.0 works" }],
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
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.candidates).toBeDefined();
  }, 15000);

  it("should support gemini-2.5-flash", async () => {
    const requestBody = {
      model: "gemini-2.5-flash",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say: 2.5 flash works" }],
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
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.candidates).toBeDefined();
  }, 15000);

  it("should support gemini-2.5-pro", async () => {
    const requestBody = {
      model: "gemini-2.5-pro",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say: 2.5 pro works" }],
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
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.candidates).toBeDefined();
  }, 15000);

  it("should support gemini-3-flash-preview", async () => {
    const requestBody = {
      model: "gemini-3-flash-preview",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say: 3 flash works" }],
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
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.candidates).toBeDefined();
  }, 15000);

  it("should support gemini-3-pro-preview", async () => {
    const requestBody = {
      model: "gemini-3-pro-preview",
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say: 3 pro works" }],
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
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.candidates).toBeDefined();
  }, 15000);

  it("should test all models in parallel", async () => {
    const testPromises = SUPPORTED_MODELS.map(async (model) => {
      const requestBody = {
        model,
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: `Test ${model}` }],
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

      return {
        model,
        status: response.status,
        ok: response.ok,
      };
    });

    const results = await Promise.all(testPromises);

    for (const result of results) {
      expect(result.status, `Model ${result.model}`).toBe(200);
      expect(result.ok, `Model ${result.model}`).toBe(true);
    }
  }, 30000);

  it("should fail with unsupported model", async () => {
    const requestBody = {
      model: "claude-3-opus", // Not a Gemini model
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
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    // Should fail with 400 or 404
    expect([400, 404]).toContain(response.status);
  }, 10000);

  it("should test different generation configs", async () => {
    const configs = [
      { maxOutputTokens: 10, temperature: 0.0 },
      { maxOutputTokens: 50, temperature: 0.5 },
      { maxOutputTokens: 100, temperature: 1.0 },
    ];

    const testPromises = configs.map(async (config) => {
      const requestBody = {
        model: "gemini-2.0-flash",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: "Count from 1 to 5" }],
            },
          ],
          generationConfig: config,
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

      return {
        config,
        status: response.status,
      };
    });

    const results = await Promise.all(testPromises);

    for (const result of results) {
      expect(result.status, `Config ${JSON.stringify(result.config)}`).toBe(
        200,
      );
    }
  }, 20000);
});
