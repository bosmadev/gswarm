/**
 * @file app/api/projects/[id]/toggle/route.ts
 * @version 2.0
 * @description Admin API route for project enable/disable status.
 * Projects are now discovered live from GCP. The Cloud AI Companion API
 * status is managed via the Google Cloud Console, not locally.
 *
 * @route POST /api/projects/[id]/toggle
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { getAllGcpProjects } from "@/lib/gswarm/projects";

/** Route params */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/toggle
 *
 * Returns the current API-enabled status for the project.
 * The Cloud AI Companion API is managed via the Google Cloud Console;
 * this endpoint reports the live status discovered from GCP.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Validate admin session
  const session = await validateAdminSession(request);
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
    // Discover projects live from GCP
    const gcpProjects = await getAllGcpProjects();

    // Find the requested project
    const project = gcpProjects.find((p) => p.project_id === projectId);

    if (!project) {
      return NextResponse.json(
        {
          error: "Project not found",
          message: `Project "${projectId}" was not found in GCP project discovery. It may not exist or the associated account may not have access.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      projectId: project.project_id,
      name: project.name,
      enabled: project.api_enabled,
      owner_email: project.owner_email,
      message: project.api_enabled
        ? "Cloud AI Companion API is enabled. To disable it, use the Google Cloud Console."
        : "Cloud AI Companion API is not enabled. To enable it, use the Google Cloud Console.",
    });
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] POST /api/projects/${projectId}/toggle failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      {
        error: "Failed to check project status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
