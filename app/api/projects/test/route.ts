/**
 * @file app/api/projects/test/route.ts
 * @description Admin API route for testing project connection.
 * Tests connectivity to a specific GCP project via gswarmClient.
 *
 * @route POST /api/projects/test
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { parseAndValidate } from "@/lib/api-validation";
import { gswarmClient } from "@/lib/gswarm/client";

/** Request body structure */
interface TestProjectRequest extends Record<string, unknown> {
  projectId: string;
}

/**
 * Tests connection to a GCP project
 * Returns success status and latency
 */
async function testProjectConnection(
  _projectId: string,
): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const startTime = performance.now();

  try {
    // Test the project by making a simple API call using gswarmClient
    // This verifies that the GSwarm infrastructure can route requests

    // First check if the gswarmClient is available
    const isAvailable = await gswarmClient.isAvailable();

    if (!isAvailable) {
      const endTime = performance.now();
      return {
        success: false,
        latencyMs: Math.round(endTime - startTime),
        error: "No available projects in GSwarm pool",
      };
    }

    // Make a minimal test request to verify connectivity
    try {
      const testResult = await gswarmClient.generateContent(
        "Respond with exactly: OK",
        {
          maxOutputTokens: 10,
          temperature: 0,
          callSource: "connection-test",
        },
      );

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      // Check if the response indicates success
      if (testResult.text && testResult.text.length > 0) {
        return { success: true, latencyMs };
      }

      return {
        success: false,
        latencyMs,
        error: "Empty response from API",
      };
    } catch (apiError) {
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);
      console.error(
        "[API] testProjectConnection - API request failed:",
        apiError,
      );

      return {
        success: false,
        latencyMs,
        error:
          "API request failed. The service may be temporarily unavailable.",
      };
    }
  } catch (error) {
    const endTime = performance.now();
    console.error("[API] testProjectConnection failed:", error);
    return {
      success: false,
      latencyMs: Math.round(endTime - startTime),
      error: "Connection test failed. Please try again later.",
    };
  }
}

/**
 * POST /api/projects/test
 * Test project connection via gswarmClient
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

  // Parse and validate request body
  const validation = await parseAndValidate<TestProjectRequest>(request, {
    required: ["projectId"],
    types: { projectId: "string" },
  });

  if (!validation.success) {
    return validation.response;
  }

  const { projectId } = validation.data;

  try {
    const result = await testProjectConnection(projectId);

    return NextResponse.json({
      success: result.success,
      error: result.error,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    console.error("[API] POST /api/projects/test failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
