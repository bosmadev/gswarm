/**
 * @file app/api/dashboard/metrics/route.ts
 * @description API route for fetching historical metrics for charts.
 * Returns time-series data for requests, tokens, and errors.
 *
 * @module app/api/dashboard/metrics
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getAggregatedMetrics,
  getTodayDateString,
} from "@/lib/gswarm/storage/metrics";

/** Metrics data point for charts */
interface MetricsDataPoint {
  date: string;
  requests: number;
  successful: number;
  failed: number;
  errorRate: number;
  avgDurationMs: number;
  tokensUsed: number;
}

/** Metrics response */
interface MetricsResponse {
  data: MetricsDataPoint[];
  period: {
    start: string;
    end: string;
    days: number;
  };
}

/**
 * GET /api/dashboard/metrics
 * Get historical metrics for charting
 * Query params:
 * - days: Number of days to fetch (default: 7, max: 30)
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
    // Parse days parameter
    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get("days");
    const days = Math.min(
      Math.max(Number.parseInt(daysParam || "7", 10), 1),
      30,
    );

    // Calculate date range
    const endDate = getTodayDateString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    const startDateStr = startDate.toISOString().split("T")[0];

    // Build date strings for parallel fetching
    const dateStrings: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dateStrings.push(date.toISOString().split("T")[0]);
    }

    // Parallelize all metrics fetches to avoid N+1 pattern
    const metricsPromises = dateStrings.map((dateStr) =>
      getAggregatedMetrics(dateStr, dateStr).then((result) => ({
        dateStr,
        result,
      })),
    );

    const metricsResults = await Promise.all(metricsPromises);

    // Process results in order
    const dataPoints: MetricsDataPoint[] = metricsResults.map(
      ({ dateStr, result }) => {
        if (result.success) {
          const agg = result.data;

          // Calculate total tokens used across all projects
          let totalTokens = 0;
          for (const projectStats of Object.values(agg.by_project)) {
            totalTokens += projectStats.tokens_used || 0;
          }

          return {
            date: dateStr,
            requests: agg.total_requests,
            successful: agg.successful_requests,
            failed: agg.failed_requests,
            errorRate:
              agg.total_requests > 0
                ? (agg.failed_requests / agg.total_requests) * 100
                : 0,
            avgDurationMs: agg.avg_duration_ms,
            tokensUsed: totalTokens,
          };
        }
        // No data for this day
        return {
          date: dateStr,
          requests: 0,
          successful: 0,
          failed: 0,
          errorRate: 0,
          avgDurationMs: 0,
          tokensUsed: 0,
        };
      },
    );

    const response: MetricsResponse = {
      data: dataPoints,
      period: {
        start: startDateStr,
        end: endDate,
        days,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
