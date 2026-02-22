/**
 * @file app/api/dashboard/stats/route.ts
 * @description API route for fetching dashboard statistics.
 * Returns aggregated counts and metrics for the dashboard overview.
 *
 * @version 1.0
 * @module app/api/dashboard/stats
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import {
  getDataPath,
  listFiles,
  readJsonFile,
} from "@/lib/gswarm/storage/base";
import { getTodayDateString, loadMetrics } from "@/lib/gswarm/storage/metrics";

// ============================================================================
// IN-MEMORY CACHE — avoids full filesystem scan on every request
// ============================================================================

interface StatsCache {
  data: DashboardStats;
  timestamp: number;
}

const STATS_CACHE_TTL_MS = 60_000; // 60 seconds

// Module-level singleton: survives across requests within the same Node process
let statsCache: StatsCache | null = null;

// In-flight promise coalescing: prevents thundering herd when cache is cold
let statsFetchInFlight: Promise<DashboardStats> | null = null;

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
 * Fetch dashboard stats from filesystem/metrics (extracted for Promise coalescing).
 * Only one instance runs at a time; concurrent callers await the same Promise.
 */
async function fetchStats(): Promise<DashboardStats> {
  // Count total accounts
  const tokensDir = getDataPath("oauth-tokens");
  const tokensResult = await listFiles(tokensDir, ".json");
  const totalAccounts = tokensResult.success ? tokensResult.data.length : 0;

  // Count active projects
  const projectsDir = getDataPath("projects");
  const projectsResult = await listFiles(projectsDir, ".json");

  let activeProjects = 0;

  if (projectsResult.success) {
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

  // Populate cache
  statsCache = { data: stats, timestamp: Date.now() };
  return stats;
}

/**
 * GET /api/dashboard/stats
 * Get aggregated dashboard statistics
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
    // Serve from cache if fresh
    if (statsCache && Date.now() - statsCache.timestamp < STATS_CACHE_TTL_MS) {
      return NextResponse.json(statsCache.data);
    }

    // Coalesce concurrent requests: reuse in-flight fetch if one is already running
    if (!statsFetchInFlight) {
      statsFetchInFlight = fetchStats();
    }

    let stats: DashboardStats;
    try {
      stats = await statsFetchInFlight;
    } finally {
      statsFetchInFlight = null;
    }

    return NextResponse.json(stats);
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/dashboard/stats failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json(
      {
        error: "Failed to fetch dashboard statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
