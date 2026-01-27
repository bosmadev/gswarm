/**
 * @file app/api/projects/[id]/toggle/route.ts
 * @description Admin API route for toggling project enabled/disabled status.
 * Updates the local tracking of project status.
 *
 * @route POST /api/projects/[id]/toggle
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

/** Route params */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Request body */
interface ToggleRequestBody {
  enabled: boolean;
}

/**
 * POST /api/projects/[id]/toggle
 * Toggle project enabled/disabled status
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
    // Parse request body
    const body = (await request.json()) as ToggleRequestBody;
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled field must be a boolean" },
        { status: 400 },
      );
    }

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
      const projectIndex = storage.projects.findIndex(
        (p) => p.projectId === projectId,
      );

      if (projectIndex !== -1) {
        // Update the enabled status
        storage.projects[projectIndex].enabled = enabled;
        storage.updatedAt = new Date().toISOString();

        const writeResult = await writeJsonFile(filePath, storage);

        if (!writeResult.success) {
          return NextResponse.json(
            { error: "Failed to update project status" },
            { status: 500 },
          );
        }

        return NextResponse.json({
          success: true,
          enabled: storage.projects[projectIndex].enabled,
          projectId,
        });
      }
    }

    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to toggle project status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
