/**
 * @file app/api/gswarm/metrics/export/route.ts
 * @version 1.0
 * @description Metrics export endpoint supporting JSON, CSV, and gzipped ZIP formats.
 * GET /api/gswarm/metrics/export?format=json|csv|zip&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * All metrics are sourced from Redis (30-day TTL). Max export range: 30 days.
 */

import { gzipSync } from "node:zlib";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import { loadMetrics } from "@/lib/gswarm/storage/metrics";
import type { DailyMetrics } from "@/lib/gswarm/types";
import {
  addCorsHeaders,
  corsPreflightResponse,
  extractClientIp,
} from "../../_shared/auth";

const MAX_RANGE_DAYS = 30;

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
 */
async function authenticateExportRequest(
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

  const clientIp = extractClientIp(request);
  return validateApiKey(apiKey, clientIp, "/api/gswarm/metrics/export");
}

/**
 * Get date range as array of YYYY-MM-DD strings
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0] ?? d.toISOString().slice(0, 10));
  }

  return dates;
}

/**
 * Convert daily metrics to CSV rows
 */
function metricsToCSV(allMetrics: DailyMetrics[]): string {
  const headers = [
    "date",
    "id",
    "timestamp",
    "endpoint",
    "method",
    "account_id",
    "project_id",
    "duration_ms",
    "status",
    "status_code",
    "error_type",
    "tokens_used",
    "model",
  ];

  const rows: string[] = [headers.join(",")];

  for (const daily of allMetrics) {
    for (const req of daily.requests) {
      rows.push(
        [
          daily.date,
          csvEscape(req.id),
          csvEscape(req.timestamp),
          csvEscape(req.endpoint),
          csvEscape(req.method),
          csvEscape(req.account_id),
          csvEscape(req.project_id),
          req.duration_ms,
          req.status,
          req.status_code ?? "",
          req.error_type ?? "",
          req.tokens_used ?? "",
          req.model ?? "",
        ].join(","),
      );
    }
  }

  return rows.join("\n");
}

/**
 * Escape a CSV field value
 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * GET /api/gswarm/metrics/export
 * Export metrics in JSON, CSV, or gzipped ZIP format
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateExportRequest(request);
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
  const format = searchParams.get("format") || "json";
  const today =
    new Date().toISOString().split("T")[0] ??
    new Date().toISOString().slice(0, 10);
  const startDate = searchParams.get("startDate") || today;
  const endDate = searchParams.get("endDate") || today;

  // Validate format
  if (!["json", "csv", "zip"].includes(format)) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid format",
          message: "Supported formats: json, csv, zip. Example: ?format=csv",
        },
        { status: 400 },
      ),
    );
  }

  // Validate date range
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid date",
          message: "Dates must be in YYYY-MM-DD format",
        },
        { status: 400 },
      ),
    );
  }

  if (endMs < startMs) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid range",
          message: "endDate must be >= startDate",
        },
        { status: 400 },
      ),
    );
  }

  const rangeDays = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Range too large",
          message: `Maximum export range is ${MAX_RANGE_DAYS} days (Redis TTL limit). Requested: ${rangeDays} days.`,
        },
        { status: 400 },
      ),
    );
  }

  try {
    // Load all daily metrics in parallel
    const dates = getDateRange(startDate, endDate);
    const results = await Promise.allSettled(
      dates.map((date) => loadMetrics(date)),
    );

    const allMetrics: DailyMetrics[] = [];
    for (const result of results) {
      if (
        result.status === "fulfilled" &&
        result.value.success &&
        result.value.data.requests.length > 0
      ) {
        allMetrics.push(result.value.data);
      }
    }

    const filename = `gswarm-metrics-${startDate}-to-${endDate}`;

    if (format === "csv") {
      const csv = metricsToCSV(allMetrics);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (format === "zip") {
      const jsonStr = JSON.stringify(allMetrics, null, 2);
      const compressed = gzipSync(Buffer.from(jsonStr, "utf-8"));

      return new Response(compressed, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${filename}.json.gz"`,
          "Content-Encoding": "identity",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Default: JSON
    return addCorsHeaders(
      NextResponse.json({
        success: true,
        period: { start: startDate, end: endDate },
        days: allMetrics.length,
        totalRequests: allMetrics.reduce(
          (sum, d) => sum + d.requests.length,
          0,
        ),
        metrics: allMetrics,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/metrics/export failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * OPTIONS /api/gswarm/metrics/export
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
