/**
 * @file app/api/projects/create/route.ts
 * @description Admin API route for getting GCP console URL for creating projects.
 * Returns the console URL for bulk enabling APIs on GCP projects.
 *
 * @route POST /api/projects/create
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";

/**
 * Gets the GCP Console URL for bulk enabling APIs
 * This URL opens the Google Cloud Console with the API enablement page
 */
function getBulkConsoleEnableUrl(): string {
  // Base URL for enabling Vertex AI API in GCP Console
  const baseUrl = "https://console.cloud.google.com/apis/enableflow";

  // APIs to enable for GSwarm functionality
  const apis = [
    "aiplatform.googleapis.com", // Vertex AI API
    "cloudresourcemanager.googleapis.com", // Cloud Resource Manager API
    "iam.googleapis.com", // IAM API
  ];

  // Build the URL with API parameters
  const params = new URLSearchParams({
    apiid: apis.join(","),
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * POST /api/projects/create
 * Returns the GCP console URL for creating/enabling projects
 */
export async function POST(request: NextRequest) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  try {
    const consoleUrl = getBulkConsoleEnableUrl();

    return NextResponse.json({
      consoleUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate console URL",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
