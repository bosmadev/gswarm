/**
 * @file app/api/projects/[id]/enable/route.ts
 * @version 2.0
 * @description Admin API route for checking project API enabled status.
 * Projects are now discovered live via GCP - actual enabling is done in GCP console.
 *
 * @route POST /api/projects/[id]/enable
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
 * POST /api/projects/[id]/enable
 * Returns the current API enabled status for a GCP project.
 * API status is managed via Google Cloud Console, not toggled here.
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
    const projects = await getAllGcpProjects();
    const project = projects.find((p) => p.project_id === projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      projectId: project.project_id,
      enabled: project.api_enabled,
      message: "API status is managed via Google Cloud Console",
    });
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] POST /api/projects/[id]/enable failed: ${error instanceof Error ? error.message : String(error)}`,
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
