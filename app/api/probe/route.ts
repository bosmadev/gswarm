/**
 * @file app/api/probe/route.ts
 * @description Admin API route for probing all projects for health.
 * Checks health of all projects and disables failed ones.
 *
 * @route POST /api/probe
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getDataPath,
  listFiles,
  readJsonFile,
  writeJsonFile,
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

/** Probe result for a single project */
interface ProbeResult {
  projectId: string;
  name: string;
  healthy: boolean;
  disabled: boolean;
  error?: string;
}

/**
 * Probes a project for health
 */
async function probeProject(project: Project): Promise<ProbeResult> {
  try {
    // Health check endpoint for the project
    const testUrl = `https://${project.projectId}-aiplatform.googleapis.com/v1/projects/${project.projectId}/locations/us-central1/publishers/google/models`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(testUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      clearTimeout(timeout);

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
          healthy: true,
          disabled: false,
        };
      }

      // Other status codes indicate potential issues
      return {
        projectId: project.projectId,
        name: project.name,
        healthy: false,
        disabled: false,
        error: `Unexpected status: ${response.status}`,
      };
    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return {
          projectId: project.projectId,
          name: project.name,
          healthy: false,
          disabled: false,
          error: "Connection timeout",
        };
      }

      return {
        projectId: project.projectId,
        name: project.name,
        healthy: false,
        disabled: false,
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Connection failed",
      };
    }
  } catch (error) {
    return {
      projectId: project.projectId,
      name: project.name,
      healthy: false,
      disabled: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * POST /api/probe
 * Probe all projects for health and disable failed ones
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
      return NextResponse.json({ results: [], disabledCount: 0 });
    }

    const allResults: ProbeResult[] = [];
    let disabledCount = 0;

    // Process each account's projects file
    for (const file of filesResult.data) {
      const filePath = `${projectsDir}/${file}`;
      const projectsResult = await readJsonFile<ProjectsStorage>(filePath);

      if (!projectsResult.success || !projectsResult.data) {
        continue;
      }

      const storage = projectsResult.data;
      const enabledProjects = storage.projects.filter((p) => p.enabled);
      let storageModified = false;

      // Probe enabled projects with concurrency limit
      const CONCURRENCY_LIMIT = 5;
      for (let i = 0; i < enabledProjects.length; i += CONCURRENCY_LIMIT) {
        const batch = enabledProjects.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(batch.map(probeProject));

        // Process results and disable unhealthy projects
        for (const result of batchResults) {
          if (!result.healthy) {
            // Find and disable the project in storage
            const projectIndex = storage.projects.findIndex(
              (p) => p.projectId === result.projectId,
            );

            if (projectIndex !== -1 && storage.projects[projectIndex].enabled) {
              storage.projects[projectIndex].enabled = false;
              result.disabled = true;
              storageModified = true;
              disabledCount++;
            }
          }

          allResults.push(result);
        }
      }

      // Save updated storage if modified
      if (storageModified) {
        storage.updatedAt = new Date().toISOString();
        await writeJsonFile(filePath, storage);
      }
    }

    return NextResponse.json({
      results: allResults,
      disabledCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Probe failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
