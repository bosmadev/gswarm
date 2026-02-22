/**
 * @file app/api/gswarm/status/stream/route.ts
 * @version 1.0
 * @description SSE real-time status stream for GSwarm system monitoring.
 * GET /api/gswarm/status/stream - Server-Sent Events stream with system health updates.
 *
 * Events:
 * - status_update: Full system status payload (every 5s)
 * - project_cooldown: When a project enters cooldown
 * - quota_warning: When quota usage exceeds 80%
 */

import type { NextRequest } from "next/server";
import { PREFIX, consoleError } from "@/lib/console";
import { errorResponse } from "@/lib/gswarm/error-handler";
import { GSWARM_CONFIG } from "@/lib/gswarm/executor";
import { getAggregatedMetrics } from "@/lib/gswarm/storage/metrics";
import {
  getAllProjectStatuses,
  getEnabledProjects,
} from "@/lib/gswarm/storage/projects";
import { getValidTokens, loadAllTokens } from "@/lib/gswarm/storage/tokens";
import { authenticateRequest, corsPreflightResponse } from "../../_shared/auth";

const POLL_INTERVAL_MS = 5000;

/**
 * Format uptime duration
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
}

/**
 * Format an SSE event
 */
function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Build the full status payload
 */
async function buildStatusPayload() {
  const tokensResult = await loadAllTokens();
  const allTokens = tokensResult.success
    ? Array.from(tokensResult.data.values())
    : [];

  const validTokensResult = await getValidTokens();
  const validTokens = validTokensResult.success ? validTokensResult.data : [];

  const enabledProjects = (await getEnabledProjects()) || [];
  const projectStatuses = await getAllProjectStatuses();

  const now = Date.now();
  const cooldownProjects = projectStatuses.filter(
    (s) =>
      now < s.cooldownUntil ||
      (s.quotaResetTime ? now < s.quotaResetTime : false),
  );

  // Get today's metrics for quota check
  const today = new Date().toISOString().split("T")[0] ?? "";
  const metricsResult = await getAggregatedMetrics(today, today);
  const totalRequests = metricsResult.success
    ? metricsResult.data.total_requests
    : 0;

  const totalQuotaCapacity = enabledProjects.length * 1500;
  const quotaUsagePercent =
    totalQuotaCapacity > 0 ? (totalRequests / totalQuotaCapacity) * 100 : 0;

  return {
    status: {
      success: true,
      accounts: allTokens.length,
      validAccounts: validTokens.length,
      projects: enabledProjects.length,
      activeProjects: enabledProjects.length - cooldownProjects.length,
      cooldownProjects: cooldownProjects.length,
      models: [
        "gemini-2.0-flash",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-3-flash-preview",
        "gemini-3-pro-preview",
      ],
      defaultModel: GSWARM_CONFIG.model,
      uptime: formatUptime(process.uptime() * 1000),
      quota: {
        used: totalRequests,
        capacity: totalQuotaCapacity,
        usagePercent: Math.round(quotaUsagePercent * 10) / 10,
      },
      timestamp: new Date().toISOString(),
    },
    cooldownProjectIds: cooldownProjects.map((p) => p.projectId),
    quotaUsagePercent,
  };
}

/**
 * GET /api/gswarm/status/stream
 * SSE real-time status stream
 */
export async function GET(request: NextRequest) {
  // Authenticate via API key
  const auth = await authenticateRequest(request, "/api/gswarm/status/stream");
  if (!auth.success) {
    return auth.error
      ? errorResponse(auth.error)
      : new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Track previous cooldown set for diff events
      let prevCooldownIds = new Set<string>();

      const poll = async () => {
        if (closed) return;

        try {
          const payload = await buildStatusPayload();

          // Always emit status_update
          controller.enqueue(
            encoder.encode(formatSSE("status_update", payload.status)),
          );

          // Emit project_cooldown for newly cooled-down projects
          const currentCooldownIds = new Set(payload.cooldownProjectIds);
          for (const id of currentCooldownIds) {
            if (!prevCooldownIds.has(id)) {
              controller.enqueue(
                encoder.encode(
                  formatSSE("project_cooldown", {
                    projectId: id,
                    timestamp: new Date().toISOString(),
                  }),
                ),
              );
            }
          }
          prevCooldownIds = currentCooldownIds;

          // Emit quota_warning when >80% used
          if (payload.quotaUsagePercent > 80) {
            controller.enqueue(
              encoder.encode(
                formatSSE("quota_warning", {
                  usagePercent: Math.round(payload.quotaUsagePercent * 10) / 10,
                  used: payload.status.quota.used,
                  capacity: payload.status.quota.capacity,
                  timestamp: new Date().toISOString(),
                }),
              ),
            );
          }
        } catch (error) {
          consoleError(
            PREFIX.ERROR,
            `[SSE] Status stream poll error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (!closed) {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      // Start polling
      poll();
    },
    cancel() {
      closed = true;
    },
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
  });

  return new Response(stream, { headers });
}

/**
 * OPTIONS /api/gswarm/status/stream
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
