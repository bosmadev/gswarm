/**
 * @file app/api/projects/route.ts
 * @description Admin API route for listing all projects grouped by owner.
 * Retrieves projects from all accounts and groups them by owner email.
 *
 * @route GET /api/projects
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getDataPath,
  listFiles,
  readJsonFile,
} from "@/lib/gswarm/storage/base";
import { getTodayDateString, loadMetrics } from "@/lib/gswarm/storage/metrics";
import { loadProjectStatuses } from "@/lib/gswarm/storage/projects";

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
 * Get all projects with filtering, sorting, and pagination
 */
export async function GET(request: NextRequest) {
  // Validate admin session
  const session = validateAdminSession(request);
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
    const sortField = searchParams.get("sortField") || "lastUsed";
    const sortDirection = searchParams.get("sortDirection") || "desc";
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10", 10);

    const projectsDir = getDataPath("projects");
    const filesResult = await listFiles(projectsDir, ".json");

    if (!filesResult.success) {
      return NextResponse.json({
        projects: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 0,
      } satisfies ProjectsResponse);
    }

    const allProjects: FrontendProject[] = [];

    // Load metrics and project statuses for status detection
    const [metricsResult, projectStatusesResult] = await Promise.all([
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

    // Filter files by accountId if specified (before loading)
    const filesToLoad = filesResult.data.filter((file) => {
      if (accountId && accountId !== "all") {
        const email = file.replace(".json", "");
        const expectedAccountId = Buffer.from(email).toString("base64");
        return expectedAccountId === accountId;
      }
      return true;
    });

    // Parallelize all project file reads to avoid N+1 pattern
    const projectReadPromises = filesToLoad.map((file) => {
      const filePath = `${projectsDir}/${file}`;
      return readJsonFile<ProjectsStorage>(filePath).then((result) => ({
        file,
        result,
      }));
    });

    const projectResults = await Promise.all(projectReadPromises);

    for (const { file, result: projectsResult } of projectResults) {
      // Extract email from filename (email.json)
      const email = file.replace(".json", "");

      if (projectsResult.success && projectsResult.data) {
        for (const project of projectsResult.data.projects) {
          // API enabled status comes from the project's enabled property
          const apiEnabled = project.enabled;

          // Get metrics for this project
          const metrics = projectMetrics[project.projectId];
          const successCount = metrics?.successful ?? 0;
          const errorCount = metrics?.failed ?? 0;

          // Get project status for cooldown/error detection
          const projectStatus = projectStatuses.get(project.projectId);

          // Determine status based on project state, cooldown, and error rate
          let status: FrontendProject["status"] = "disabled";
          if (project.enabled) {
            // Check if in cooldown
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
              // High consecutive errors indicate error state
              status = "error";
            } else if (metrics && metrics.total > 0) {
              // Check error rate - if > 50% errors, mark as error
              const errorRate = metrics.failed / metrics.total;
              status = errorRate > 0.5 ? "error" : "active";
            } else {
              status = "active";
            }
          }

          allProjects.push({
            id: project.projectId,
            name: project.name,
            owner: email,
            apiEnabled,
            status,
            successCount,
            errorCount,
            lastUsed: project.lastUsed || null,
          });
        }
      }
    }

    // Apply search filter
    let filteredProjects = allProjects;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProjects = allProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.id.toLowerCase().includes(searchLower),
      );
    }

    // Apply sorting
    filteredProjects.sort((a, b) => {
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
          aVal = a.lastUsed || "";
          bVal = b.lastUsed || "";
      }

      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    // Calculate pagination
    const total = filteredProjects.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

    return NextResponse.json({
      projects: paginatedProjects,
      total,
      page,
      pageSize,
      totalPages,
    } satisfies ProjectsResponse);
  } catch (error) {
    console.error("[API] GET /api/projects failed:", error);
    return NextResponse.json(
      {
        error: "Failed to load projects",
        message: "An internal error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
