/**
 * @file app/api/bench/route.ts
 * @description Admin API route for benchmarking all enabled projects.
 * Runs a simple test on each enabled project and measures latency.
 *
 * @route POST /api/bench
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getDataPath,
  listFiles,
  readJsonFile,
} from "@/lib/gswarm/storage/base";

/** Project structure */
interface Project {
  projectId: string;
  name: string;
  enabled: boolean;
  createdAt?: string;
  lastUsed?: string;
}

/** Projects storage structure */
interface ProjectsStorage {
  projects: Project[];
  updatedAt: string;
}

/** Benchmark result for a single project */
interface BenchmarkResult {
  projectId: string;
  name: string;
  success: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Runs a simple connectivity test on a project
 */
async function benchmarkProject(project: Project): Promise<BenchmarkResult> {
  const startTime = performance.now();

  try {
    // Test endpoint for the project
    const testUrl = `https://${project.projectId}-aiplatform.googleapis.com/v1/projects/${project.projectId}/locations/us-central1/publishers/google/models`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(testUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      clearTimeout(timeout);
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      // 401/403 means endpoint is reachable (auth required, expected)
      // 200 would mean success with auth
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 200
      ) {
        return {
          projectId: project.projectId,
          name: project.name,
          success: true,
          latencyMs,
        };
      }

      return {
        projectId: project.projectId,
        name: project.name,
        success: false,
        latencyMs,
        error: `Unexpected status: ${response.status}`,
      };
    } catch (fetchError) {
      clearTimeout(timeout);
      const endTime = performance.now();

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return {
          projectId: project.projectId,
          name: project.name,
          success: false,
          latencyMs: Math.round(endTime - startTime),
          error: "Connection timeout",
        };
      }

      return {
        projectId: project.projectId,
        name: project.name,
        success: false,
        latencyMs: Math.round(endTime - startTime),
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Connection failed",
      };
    }
  } catch (error) {
    const endTime = performance.now();
    return {
      projectId: project.projectId,
      name: project.name,
      success: false,
      latencyMs: Math.round(endTime - startTime),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * POST /api/bench
 * Benchmark all enabled projects
 */
export async function POST(request: NextRequest) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  try {
    const projectsDir = getDataPath("projects");
    const filesResult = await listFiles(projectsDir, ".json");

    if (!filesResult.success) {
      return NextResponse.json({ results: [] });
    }

    // Collect all enabled projects
    const enabledProjects: Project[] = [];

    for (const file of filesResult.data) {
      const filePath = `${projectsDir}/${file}`;
      const projectsResult = await readJsonFile<ProjectsStorage>(filePath);

      if (projectsResult.success && projectsResult.data) {
        const enabled = projectsResult.data.projects.filter((p) => p.enabled);
        enabledProjects.push(...enabled);
      }
    }

    // Run benchmarks in parallel (with concurrency limit)
    const CONCURRENCY_LIMIT = 5;
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < enabledProjects.length; i += CONCURRENCY_LIMIT) {
      const batch = enabledProjects.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(batch.map(benchmarkProject));
      results.push(...batchResults);
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Benchmark failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
