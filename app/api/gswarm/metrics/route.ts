/**
 * @file app/api/gswarm/metrics/route.ts
 * @version 1.0
 * @description GSwarm metrics and status API endpoint
 * GET /api/gswarm/metrics - Get current status and quota information
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { GSWARM_CONFIG } from "@/lib/gswarm/executor";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import {
  getAccountErrorRates,
  getAggregatedMetrics,
  predictQuotaExhaustion,
} from "@/lib/gswarm/storage/metrics";
import { getEnabledProjects } from "@/lib/gswarm/storage/projects";
import {
  addCorsHeaders,
  corsPreflightResponse,
  extractClientIp,
} from "../_shared/auth";

/**
 * Extract API key from Authorization header
 */
function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Authenticate request using either session cookie or API key.
 *
 * @param request - The incoming Next.js request
 * @returns Validation result with error message if invalid
 */
async function authenticateRequest(
  request: NextRequest,
): Promise<{ valid: boolean; error?: string }> {
  // First, try session authentication (for dashboard)
  const sessionValidation = await validateAdminSession(request);
  if (sessionValidation.valid) {
    return { valid: true };
  }

  // Fall back to API key authentication
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { valid: false, error: "Missing authentication" };
  }

  const clientIp = extractClientIp(request);
  const validationResult = await validateApiKey(
    apiKey,
    clientIp,
    "/api/gswarm/metrics",
  );

  return validationResult;
}

/**
 * GET /api/gswarm/metrics
 * Get current status and quota information
 */
export async function GET(request: NextRequest) {
  // Authenticate request
  const authResult = await authenticateRequest(request);
  if (!authResult.valid) {
    const isRateLimit = authResult.error === "Rate limit exceeded";
    return addCorsHeaders(
      NextResponse.json(
        {
          error: isRateLimit ? "Rate limit exceeded" : "Unauthorized",
          message: authResult.error,
        },
        { status: isRateLimit ? 429 : 401 },
      ),
    );
  }

  // Get date range from query params (default: today only)
  const { searchParams } = new URL(request.url);
  const startDate =
    searchParams.get("startDate") || new Date().toISOString().slice(0, 10);
  const endDate = searchParams.get("endDate") || startDate;

  try {
    // Get projects
    const projectsResult = await getEnabledProjects();
    const projects = projectsResult || [];

    // Get aggregated metrics
    const metricsResult = await getAggregatedMetrics(startDate, endDate);
    if (!metricsResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          { error: "Failed to load metrics", message: metricsResult.error },
          { status: 500 },
        ),
      );
    }

    const aggregated = metricsResult.data;

    // Get error rates per account
    const errorRatesResult = await getAccountErrorRates();
    const accountErrorRates = errorRatesResult.success
      ? errorRatesResult.data
      : {};

    // Calculate quota prediction (using first project as reference)
    let quotaPrediction = null;
    if (projects.length > 0) {
      // projects is string[] (project IDs)
      const predictionResult = await predictQuotaExhaustion(
        projects[0]!,
        1500, // Assume 1500 daily quota per project
      );
      if (predictionResult.success) {
        quotaPrediction = predictionResult.data;
      }
    }

    // Calculate overall stats
    const totalQuotaCapacity = projects.length * 1500; // Assume 1500 per project
    const usedToday = aggregated.total_requests;
    const remainingQuota = Math.max(0, totalQuotaCapacity - usedToday);

    // Calculate usage rate (requests per hour)
    const now = new Date();
    const startOfDay = new Date(now.toISOString().slice(0, 10));
    const hoursElapsed = Math.max(
      1,
      (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60),
    );
    const usageRatePerHour = usedToday / hoursElapsed;

    // Predict exhaustion time
    let exhaustsAt: number | null = null;
    let exhaustsIn: string | null = null;
    if (usageRatePerHour > 0 && remainingQuota > 0) {
      const hoursUntilExhaust = remainingQuota / usageRatePerHour;
      exhaustsAt = Math.floor(
        now.getTime() + hoursUntilExhaust * 60 * 60 * 1000,
      );
      const hours = Math.floor(hoursUntilExhaust);
      const mins = Math.floor((hoursUntilExhaust - hours) * 60);
      exhaustsIn = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        status: {
          healthy: projects.length > 0,
          backend: "gswarm",
          model: GSWARM_CONFIG.model,
          projectCount: projects.length,
        },
        quota: {
          used: usedToday,
          capacity: totalQuotaCapacity,
          remaining: remainingQuota,
          usageRatePerHour: Math.round(usageRatePerHour * 10) / 10,
          exhaustsAt,
          exhaustsIn,
          prediction: quotaPrediction,
        },
        metrics: {
          period: {
            start: startDate,
            end: endDate,
          },
          requests: {
            total: aggregated.total_requests,
            successful: aggregated.successful_requests,
            failed: aggregated.failed_requests,
            successRate:
              aggregated.total_requests > 0
                ? (aggregated.successful_requests / aggregated.total_requests) *
                  100
                : 100,
          },
          latency: {
            avgMs: Math.round(aggregated.avg_duration_ms),
            totalMs: aggregated.total_duration_ms,
          },
          byEndpoint: aggregated.by_endpoint,
          byAccount: aggregated.by_account,
          byProject: aggregated.by_project,
          errors: aggregated.error_breakdown,
        },
        accountErrorRates,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/metrics failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      ),
    );
  }
}

/**
 * OPTIONS /api/gswarm/metrics
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
