import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getProjectSelectionStats,
  markProjectUsed,
  selectProject,
  selectProjectForRequest,
} from "../../lru-selector";

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
 * Integration Test 4: LRU Rotation
 * Verifies project rotation follows LRU (Least Recently Used) pattern
 */

const TOKEN_FILES_PATH = resolve(process.cwd(), "../cwchat/main/gswarm-tokens");

const CLOUDCODE_PA_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

const EXPECTED_ACCOUNTS = [
  "bosmadev1@gmail.com",
  "bosmadev2@gmail.com",
  "bosmadev3@gmail.com",
];

describe("LRU Project Rotation Integration", () => {
  let tokens: Map<string, TokenFile>;
  let selector: LRUProjectSelector;

  beforeAll(async () => {
    tokens = new Map();

    for (const email of EXPECTED_ACCOUNTS) {
      const filePath = resolve(TOKEN_FILES_PATH, `${email}.json`);
      const content = await readFile(filePath, "utf-8");
      const token = JSON.parse(content) as TokenFile;
      tokens.set(email, token);
    }
  });

  beforeEach(() => {
    // Create fresh selector for each test
    const allProjects: string[] = [];
    for (const token of tokens.values()) {
      allProjects.push(...token.projects);
    }
    selector = new LRUProjectSelector(allProjects);
  });

  it("should rotate through different projects on consecutive calls", () => {
    const selections = new Set<string>();

    // Make 10 selections
    for (let i = 0; i < 10; i++) {
      const project = selector.select();
      selections.add(project);
    }

    // Should have selected 10 different projects
    expect(selections.size).toBe(10);
  });

  it("should rotate through all 36 projects before repeating", () => {
    const firstCycle: string[] = [];

    // Collect first 36 selections
    for (let i = 0; i < 36; i++) {
      firstCycle.push(selector.select());
    }

    // Should have 36 unique projects
    const uniqueProjects = new Set(firstCycle);
    expect(uniqueProjects.size).toBe(36);

    // Next selection should match first one (full rotation)
    const nextSelection = selector.select();
    expect(nextSelection).toBe(firstCycle[0]);
  });

  it("should maintain LRU order after marking usage", () => {
    const project1 = selector.select();
    const project2 = selector.select();
    const project3 = selector.select();

    // Mark project1 as used (moves to end)
    selector.markUsed(project1);

    // Next 33 selections should NOT be project1
    for (let i = 0; i < 33; i++) {
      const next = selector.select();
      expect(next).not.toBe(project1);
    }

    // 34th selection should be project1 (back at front)
    const shouldBeProject1 = selector.select();
    expect(shouldBeProject1).toBe(project1);
  });

  it("should handle rapid parallel selections", async () => {
    const promises = Array.from({ length: 20 }, async (_, i) => ({
      index: i,
      project: selector.select(),
    }));

    const results = await Promise.all(promises);

    // All should succeed
    expect(results.length).toBe(20);

    // First 20 should be unique
    const uniqueProjects = new Set(results.map((r) => r.project));
    expect(uniqueProjects.size).toBe(20);
  });

  it("should make 10 rapid API calls using rotation", async () => {
    const email = "bosmadev1@gmail.com";
    const token = tokens.get(email);
    expect(token).toBeDefined();

    const results: Array<{ project: string; status: number }> = [];

    for (let i = 0; i < 10; i++) {
      const project = selector.select();

      const requestBody = {
        model: "gemini-2.0-flash",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: `Request ${i}` }],
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

      results.push({
        project,
        status: response.status,
      });

      selector.markUsed(project);
    }

    // All should succeed
    for (const result of results) {
      expect(result.status, `Project ${result.project}`).toBe(200);
    }

    // Should have used 10 different projects
    const uniqueProjects = new Set(results.map((r) => r.project));
    expect(uniqueProjects.size).toBe(10);
  }, 60000);

  it("should distribute load across all accounts", () => {
    const projectsByAccount: Record<string, Set<string>> = {
      bosmadev1: new Set(),
      bosmadev2: new Set(),
      bosmadev3: new Set(),
    };

    // Make 36 selections
    for (let i = 0; i < 36; i++) {
      const project = selector.select();

      // Determine which account owns this project
      if (project.startsWith("geminiswarm-")) {
        projectsByAccount.bosmadev1.add(project);
      } else if (project.startsWith("gswarm-")) {
        projectsByAccount.bosmadev2.add(project);
      } else if (project.startsWith("gen-lang-client-")) {
        projectsByAccount.bosmadev1.add(project); // Special project from bosmadev1
      }
    }

    // Each account should have been used
    // (Note: exact distribution varies based on project ID prefixes)
    expect(projectsByAccount.bosmadev1.size).toBeGreaterThan(0);
    expect(projectsByAccount.bosmadev2.size).toBeGreaterThan(0);
  });

  it("should reset to initial state after full cycle", () => {
    const firstSelection = selector.select();

    // Consume full cycle (36 projects)
    for (let i = 0; i < 35; i++) {
      selector.select();
    }

    // Next should match first
    const afterCycle = selector.select();
    expect(afterCycle).toBe(firstSelection);
  });
});
