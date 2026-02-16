/**
 * @file app/api/gswarm/metrics/trends/route.ts
 * @version 1.0
 * @description Historical trend analysis endpoint for GSwarm metrics.
 * GET /api/gswarm/metrics/trends?days=7&metric=requests
 *
 * Computes daily data points, averages, peaks, percent change,
 * and trend direction via linear regression.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import { loadMetrics } from "@/lib/gswarm/storage/metrics";
import { getEnabledProjects } from "@/lib/gswarm/storage/projects";
import { addCorsHeaders, corsPreflightResponse } from "../../_shared/auth";

type MetricType = "requests" | "errors" | "latency" | "quota";
type TrendDirection = "increasing" | "decreasing" | "stable";

const VALID_DAYS = [7, 14, 30] as const;
const VALID_METRICS: MetricType[] = ["requests", "errors", "latency", "quota"];

interface DataPoint {
  date: string;
  value: number;
}

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
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Authenticate request using either session cookie or API key.
 */
async function authenticateTrendsRequest(
  request: NextRequest,
): Promise<{ valid: boolean; error?: string }> {
  const sessionValidation = await validateAdminSession(request);
  if (sessionValidation.valid) {
    return { valid: true };
  }

  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { valid: false, error: "Missing authentication" };
  }

  const clientIp = getClientIp(request);
  return validateApiKey(apiKey, clientIp, "/api/gswarm/metrics/trends");
}

/**
 * Compute linear regression slope to determine trend direction.
 * Uses least squares method on (index, value) pairs.
 * Returns "increasing", "decreasing", or "stable".
 */
function computeTrend(values: number[]): TrendDirection {
  const n = values.length;
  if (n < 2) return "stable";

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return "stable";

  const slope = (n * sumXY - sumX * sumY) / denominator;

  // Normalize slope by mean to get relative change
  const mean = sumY / n;
  if (mean === 0) return "stable";

  const relativeSlope = slope / mean;

  // Threshold: >5% relative slope per day = trending
  if (relativeSlope > 0.05) return "increasing";
  if (relativeSlope < -0.05) return "decreasing";
  return "stable";
}

/**
 * GET /api/gswarm/metrics/trends
 * Historical trend analysis
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateTrendsRequest(request);
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

  const { searchParams } = new URL(request.url);
  const daysParam = Number.parseInt(searchParams.get("days") || "7", 10);
  const metricParam = (searchParams.get("metric") || "requests") as MetricType;

  // Validate days
  if (!VALID_DAYS.includes(daysParam as (typeof VALID_DAYS)[number])) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid days parameter",
          message: `Supported values: ${VALID_DAYS.join(", ")}`,
        },
        { status: 400 },
      ),
    );
  }

  // Validate metric
  if (!VALID_METRICS.includes(metricParam)) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid metric parameter",
          message: `Supported values: ${VALID_METRICS.join(", ")}`,
        },
        { status: 400 },
      ),
    );
  }

  try {
    // Build date range (last N days including today)
    const dates: string[] = [];
    const now = new Date();
    for (let i = daysParam - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0] ?? d.toISOString().slice(0, 10));
    }

    // Get project count for quota calculation
    const enabledProjects = (await getEnabledProjects()) || [];
    const totalQuotaCapacity = enabledProjects.length * 1500;

    // Load all daily metrics in parallel
    const results = await Promise.allSettled(
      dates.map((date) => loadMetrics(date)),
    );

    // Extract metric values per day
    const dataPoints: DataPoint[] = [];
    const values: number[] = [];

    for (let i = 0; i < dates.length; i++) {
      const result = results[i];
      let value = 0;

      if (result.status === "fulfilled" && result.value.success) {
        const daily = result.value.data;
        const agg = daily.aggregated;

        switch (metricParam) {
          case "requests":
            value = agg.total_requests;
            break;
          case "errors":
            value = agg.failed_requests;
            break;
          case "latency":
            value = Math.round(agg.avg_duration_ms);
            break;
          case "quota":
            value =
              totalQuotaCapacity > 0
                ? Math.round((agg.total_requests / totalQuotaCapacity) * 1000) /
                  10
                : 0;
            break;
        }
      }

      dataPoints.push({ date: dates[i], value });
      values.push(value);
    }

    // Compute statistics
    const nonZeroValues = values.filter((v) => v > 0);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = nonZeroValues.length > 0 ? sum / nonZeroValues.length : 0;
    const peak = Math.max(...values);

    // Percent change: first non-zero day vs last day
    const firstValue = values.find((v) => v > 0) ?? 0;
    const lastValue = values[values.length - 1];
    const percentChange =
      firstValue > 0
        ? Math.round(((lastValue - firstValue) / firstValue) * 1000) / 10
        : 0;

    const trend = computeTrend(values);

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        metric: metricParam,
        days: daysParam,
        dataPoints,
        average: Math.round(average * 10) / 10,
        peak,
        percentChange,
        trend,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/metrics/trends failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * OPTIONS /api/gswarm/metrics/trends
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
