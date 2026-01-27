/**
 * @file app/api/projects/[id]/test/route.ts
 * @description Admin API route for testing project API connectivity.
 * Verifies that the project's API is accessible and responding.
 *
 * @route POST /api/projects/[id]/test
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { gswarmClient } from "@/lib/gswarm/client";
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

/** Route params */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/test
 * Test project API connectivity
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  const { id: projectId } = await params;

  if (!projectId) {
    return NextResponse.json(
      { error: "Project ID is required" },
      { status: 400 },
    );
  }

  try {
    const projectsDir = getDataPath("projects");
    const filesResult = await listFiles(projectsDir, ".json");

    if (!filesResult.success) {
      return NextResponse.json(
        { error: "Failed to access projects storage" },
        { status: 500 },
      );
    }

    // Search for the project in all account files
    for (const file of filesResult.data) {
      const filePath = `${projectsDir}/${file}`;
      const projectsResult = await readJsonFile<ProjectsStorage>(filePath);

      if (!projectsResult.success || !projectsResult.data) {
        continue;
      }

      const storage = projectsResult.data;
      const project = storage.projects.find((p) => p.projectId === projectId);

      if (project) {
        // Check if project is enabled
        if (!project.enabled) {
          return NextResponse.json(
            {
              success: false,
              error: "Project is disabled",
              message: "Enable the project before testing",
            },
            { status: 400 },
          );
        }

        // Test API connectivity using gswarmClient
        const startTime = performance.now();

        try {
          // Use gswarmClient to test if we can generate content
          const testResult = await gswarmClient.generateContent(
            "Say 'OK' if you can hear me.",
            {
              maxOutputTokens: 10,
              temperature: 0,
              callSource: "api-test",
            },
          );

          const latencyMs = Math.round(performance.now() - startTime);

          return NextResponse.json({
            success: true,
            projectId,
            projectName: project.name,
            message: "Project API test successful",
            tested: true,
            latencyMs,
            response: testResult.text.slice(0, 100),
            usedProject: testResult.projectId,
            timestamp: new Date().toISOString(),
          });
        } catch (testError) {
          const latencyMs = Math.round(performance.now() - startTime);
          console.error(
            `[API] POST /api/projects/${projectId}/test - API test failed:`,
            testError,
          );

          return NextResponse.json(
            {
              success: false,
              projectId,
              projectName: project.name,
              message:
                "API test failed. The service may be temporarily unavailable.",
              tested: true,
              latencyMs,
              timestamp: new Date().toISOString(),
            },
            { status: 503 },
          );
        }
      }
    }

    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    console.error("[API] POST /api/projects/[id]/test failed:", error);
    return NextResponse.json(
      {
        error: "Failed to test project",
        message: "An internal error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
