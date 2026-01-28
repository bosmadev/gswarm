/**
 * @file app/api/accounts/route.ts
 * @description Admin API route for listing all accounts/tokens.
 * Returns sanitized account list without exposing actual token values.
 *
 * @route GET /api/accounts
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
import { loadProjectStatuses } from "@/lib/gswarm/storage/projects";

/** Token storage structure */
interface StoredToken {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
  lastUsed?: string;
}

/** Sanitized account info (no actual tokens) */
interface SanitizedAccount {
  id: string;
  email: string;
  status: "healthy" | "frozen" | "error";
  projectsCount: number;
  failedCount: number;
  frozenUntil: string | null;
  createdAt: string;
}

/** Projects storage structure for counting */
interface ProjectsStorage {
  projects: Array<{
    projectId: string;
    enabled: boolean;
  }>;
}

/**
 * GET /api/accounts
 * Load all tokens from storage and return sanitized list with project counts
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
    const tokensDir = getDataPath("oauth-tokens");
    const filesResult = await listFiles(tokensDir, ".json");

    if (!filesResult.success) {
      return NextResponse.json({ accounts: [], total: 0 });
    }

    const accounts: SanitizedAccount[] = [];
    const now = new Date();

    // Load today's metrics and project statuses for failed request counts and cooldown info
    const [metricsResult, projectStatusesResult] = await Promise.all([
      loadMetrics(getTodayDateString()),
      loadProjectStatuses(),
    ]);
    const accountMetrics = metricsResult.success
      ? metricsResult.data.aggregated.by_account
      : {};
    const projectStatuses = projectStatusesResult.success
      ? projectStatusesResult.data
      : new Map();
    const nowMs = Date.now();

    for (const file of filesResult.data) {
      const filePath = `${tokensDir}/${file}`;
      const tokenResult = await readJsonFile<StoredToken>(filePath);

      if (tokenResult.success && tokenResult.data) {
        const token = tokenResult.data;
        const expiresAt = new Date(token.expiresAt);
        const isExpired = expiresAt <= now;

        // Count projects for this account
        const projectsDir = getDataPath("projects");
        const projectsPath = `${projectsDir}/${token.email}.json`;
        const projectsResult =
          await readJsonFile<ProjectsStorage>(projectsPath);
        const projectsCount = projectsResult.success
          ? (projectsResult.data?.projects.length ?? 0)
          : 0;

        // Generate consistent ID from email
        const accountId = Buffer.from(token.email).toString("base64");

        // Get failed request count from today's metrics
        const accountStats = accountMetrics[accountId];
        const failedCount = accountStats?.failed ?? 0;

        // Check if any of this account's projects are in cooldown/frozen state
        // An account is frozen if ALL its projects are in cooldown
        let frozenUntilMs: number | null = null;
        let allProjectsFrozen = false;

        if (projectsResult.success && projectsResult.data?.projects.length) {
          const accountProjects = projectsResult.data.projects;
          let frozenCount = 0;
          let maxCooldownUntil = 0;

          for (const project of accountProjects) {
            const projectStatus = projectStatuses.get(project.projectId);
            if (projectStatus) {
              const cooldownUntil = Math.max(
                projectStatus.cooldownUntil || 0,
                projectStatus.quotaResetTime || 0,
              );
              if (nowMs < cooldownUntil) {
                frozenCount++;
                maxCooldownUntil = Math.max(maxCooldownUntil, cooldownUntil);
              }
            }
          }

          // Account is frozen if all its projects are in cooldown
          if (frozenCount > 0 && frozenCount === accountProjects.length) {
            allProjectsFrozen = true;
            frozenUntilMs = maxCooldownUntil;
          }
        }

        // Determine account status
        let status: "healthy" | "frozen" | "error" = "healthy";
        if (isExpired) {
          status = "error";
        } else if (allProjectsFrozen) {
          status = "frozen";
        }

        accounts.push({
          id: accountId,
          email: token.email,
          status,
          projectsCount,
          failedCount,
          frozenUntil: frozenUntilMs
            ? new Date(frozenUntilMs).toISOString()
            : null,
          createdAt: token.createdAt,
        });
      }
    }

    return NextResponse.json({ accounts, total: accounts.length });
  } catch (error) {
    consoleError(PREFIX.API, "GET /api/accounts failed:", error);
    return NextResponse.json(
      {
        error: "Failed to load accounts",
        message: "An internal error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
