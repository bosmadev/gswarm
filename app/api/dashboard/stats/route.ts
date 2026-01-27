/**
 * @file app/api/dashboard/stats/route.ts
 * @description API route for fetching dashboard statistics.
 * Returns aggregated counts and metrics for the dashboard overview.
 *
 * @module app/api/dashboard/stats
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getDataPath,
  listFiles,
  readJsonFile,
} from "@/lib/gswarm/storage/base";
import { getTodayDateString, loadMetrics } from "@/lib/gswarm/storage/metrics";

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

/** Dashboard statistics response */
interface DashboardStats {
  totalAccounts: number;
  activeProjects: number;
  apiRequestsToday: number;
  errorRate: number;
}

/**
 * GET /api/dashboard/stats
 * Get aggregated dashboard statistics
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
    // Count total accounts
    const tokensDir = getDataPath("oauth-tokens");
    const tokensResult = await listFiles(tokensDir, ".json");
    const totalAccounts = tokensResult.success ? tokensResult.data.length : 0;

    // Count active projects
    const projectsDir = getDataPath("projects");
    const projectsResult = await listFiles(projectsDir, ".json");

    let activeProjects = 0;

    if (projectsResult.success) {
      // Parallelize all project file reads to avoid N+1 pattern
      const projectReadPromises = projectsResult.data.map((file) => {
        const filePath = `${projectsDir}/${file}`;
        return readJsonFile<ProjectsStorage>(filePath);
      });

      const projectResults = await Promise.all(projectReadPromises);

      for (const projectsData of projectResults) {
        if (projectsData.success && projectsData.data) {
          activeProjects += projectsData.data.projects.filter(
            (p) => p.enabled,
          ).length;
        }
      }
    }

    // Calculate actual API requests today from metrics
    const metricsResult = await loadMetrics(getTodayDateString());
    let apiRequestsToday = 0;
    let errorRate = 0;

    if (metricsResult.success && metricsResult.data.aggregated) {
      const agg = metricsResult.data.aggregated;
      apiRequestsToday = agg.total_requests;
      errorRate =
        agg.total_requests > 0
          ? (agg.failed_requests / agg.total_requests) * 100
          : 0;
    }

    const stats: DashboardStats = {
      totalAccounts,
      activeProjects,
      apiRequestsToday,
      errorRate,
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch dashboard statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
