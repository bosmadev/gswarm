/**
 * @file app/api/projects/route.ts
 * @version 2.0
 * @description Admin API route for listing all projects.
 * Discovers projects live from Google Cloud Resource Manager API
 * using stored OAuth tokens, with metrics overlay.
 *
 * @route GET /api/projects
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { getAllGcpProjects } from "@/lib/gswarm/projects";
import { getTodayDateString, loadMetrics } from "@/lib/gswarm/storage/metrics";
import { loadProjectStatuses } from "@/lib/gswarm/storage/projects";

/** Frontend project structure */
interface FrontendProject {
  id: string;
  name: string;
  owner: string;
  apiEnabled: boolean;
  status: "active" | "cooldown" | "disabled" | "error";
  successCount: number;
  errorCount: number;
  lastUsed: string | null;
}

/** Paginated response structure */
interface ProjectsResponse {
  projects: FrontendProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * GET /api/projects
 * Discover projects from GCP with filtering, sorting, and pagination
 */
export async function GET(request: NextRequest) {
  // Validate admin session
  const session = await validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const accountId = searchParams.get("accountId");
    const sortField = searchParams.get("sortField") || "name";
    const sortDirection = searchParams.get("sortDirection") || "asc";
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "50", 10);
    const forceRefresh = searchParams.get("refresh") === "true";

    // Discover projects from GCP + load metrics in parallel
    const [gcpProjects, metricsResult, projectStatusesResult] =
      await Promise.all([
        getAllGcpProjects(forceRefresh),
        loadMetrics(getTodayDateString()),
        loadProjectStatuses(),
      ]);

    const projectMetrics = metricsResult.success
      ? metricsResult.data.aggregated.by_project
      : {};
    const projectStatuses = projectStatusesResult.success
      ? projectStatusesResult.data
      : new Map();
    const now = Date.now();

    // Map GCP projects to frontend format
    let allProjects: FrontendProject[] = gcpProjects.map((gcp) => {
      const metrics = projectMetrics[gcp.project_id];
      const successCount = metrics?.successful ?? 0;
      const errorCount = metrics?.failed ?? 0;
      const projectStatus = projectStatuses.get(gcp.project_id);

      // Determine status
      let status: FrontendProject["status"] = "disabled";
      if (gcp.api_enabled) {
        const inCooldown =
          projectStatus &&
          (now < projectStatus.cooldownUntil ||
            (projectStatus.quotaResetTime &&
              now < projectStatus.quotaResetTime));

        if (inCooldown) {
          status = "cooldown";
        } else if (
          projectStatus?.lastErrorType &&
          projectStatus.consecutiveErrors >= 3
        ) {
          status = "error";
        } else if (metrics && metrics.total > 0) {
          const errorRate = metrics.failed / metrics.total;
          status = errorRate > 0.5 ? "error" : "active";
        } else {
          status = "active";
        }
      }

      return {
        id: gcp.project_id,
        name: gcp.name,
        owner: gcp.owner_email,
        apiEnabled: gcp.api_enabled,
        status,
        successCount,
        errorCount,
        lastUsed: null,
      };
    });

    // Filter by accountId if specified
    if (accountId && accountId !== "all") {
      const decodedEmail = Buffer.from(accountId, "base64").toString("utf-8");
      allProjects = allProjects.filter((p) => p.owner === decodedEmail);
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allProjects = allProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.id.toLowerCase().includes(searchLower),
      );
    }

    // Apply sorting
    allProjects.sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortField) {
        case "id":
          aVal = a.id;
          bVal = b.id;
          break;
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "owner":
          aVal = a.owner;
          bVal = b.owner;
          break;
        case "apiEnabled":
          aVal = a.apiEnabled ? 1 : 0;
          bVal = b.apiEnabled ? 1 : 0;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "successCount":
          aVal = a.successCount;
          bVal = b.successCount;
          break;
        case "errorCount":
          aVal = a.errorCount;
          bVal = b.errorCount;
          break;
        case "lastUsed":
          aVal = a.lastUsed || "";
          bVal = b.lastUsed || "";
          break;
        default:
          aVal = a.name;
          bVal = b.name;
      }

      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    // Calculate pagination
    const total = allProjects.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedProjects = allProjects.slice(startIndex, endIndex);

    return NextResponse.json({
      projects: paginatedProjects,
      total,
      page,
      pageSize,
      totalPages,
    } satisfies ProjectsResponse);
  } catch (error) {
    consoleError(PREFIX.API, "GET /api/projects failed:", error);
    return NextResponse.json(
      {
        error: "Failed to load projects",
        message: "An internal error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
