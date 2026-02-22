/**
 * @file app/api/gswarm/accounts/[email]/discover-projects/route.ts
 * @version 1.0
 * @description Trigger project discovery for a specific account
 * POST /api/gswarm/accounts/:email/discover-projects
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError, consoleLog } from "@/lib/console";
import { discoverProjects } from "@/lib/gswarm/oauth";
import { loadToken, updateTokenProjects } from "@/lib/gswarm/storage/tokens";
import { addCorsHeaders, corsPreflightResponse } from "../../../_shared/auth";

/**
 * POST /api/gswarm/accounts/:email/discover-projects
 * Discover and update GCP projects for an account
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  // Authenticate request
  const sessionValidation = await validateAdminSession(request);
  if (!sessionValidation.valid) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Unauthorized",
          message: "Admin authentication required",
        },
        { status: 401 },
      ),
    );
  }

  try {
    const { email } = await params;

    // Decode email from URL encoding
    const decodedEmail = decodeURIComponent(email);

    consoleLog(PREFIX.API, `Discovering projects for ${decodedEmail}`);

    // Load token
    const loadResult = await loadToken(decodedEmail);
    if (!loadResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Token not found",
            message: loadResult.error,
          },
          { status: 404 },
        ),
      );
    }

    const token = loadResult.data;

    // Check if token is invalid
    if (token.is_invalid) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Invalid token",
            message: token.invalid_reason || "Token marked as invalid",
          },
          { status: 400 },
        ),
      );
    }

    // Discover projects using the access token
    consoleLog(PREFIX.API, "Calling Cloud Resource Manager API...");
    const projects = await discoverProjects(token.access_token);

    if (projects.length === 0) {
      consoleError(
        PREFIX.ERROR,
        "No projects discovered - token may be expired",
      );
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "No projects found",
            message:
              "No GCP projects were discovered. Token may be expired or invalid.",
          },
          { status: 400 },
        ),
      );
    }

    // Update token with discovered projects
    const updateResult = await updateTokenProjects(decodedEmail, projects);
    if (!updateResult.success) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Failed to update token",
            message: updateResult.error,
          },
          { status: 500 },
        ),
      );
    }

    consoleLog(
      PREFIX.SUCCESS,
      `Successfully discovered ${projects.length} projects for ${decodedEmail}`,
    );

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        email: decodedEmail,
        projectCount: projects.length,
        projects,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] POST /api/gswarm/accounts/:email/discover-projects failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * OPTIONS handler for CORS preflight
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
