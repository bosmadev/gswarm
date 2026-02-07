/**
 * @file app/api/projects/[id]/test/route.ts
 * @version 3.0
 * @description Admin API route for testing a specific project's API connectivity.
 * Makes a direct API call to the requested project (bypasses LRU selector).
 *
 * @route POST /api/projects/[id]/test
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError, consoleLog } from "@/lib/console";
import { ENDPOINT_URL, GSWARM_CONFIG } from "@/lib/gswarm/executor";
import { getAllGcpProjects } from "@/lib/gswarm/projects";
import { loadToken } from "@/lib/gswarm/storage/tokens";

/** Route params */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/test
 * Test a specific project's API connectivity by making a direct API call.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Validate admin session
  const session = await validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  const { id: projectId } = await params;

  if (!projectId) {
    return NextResponse.json(
      { error: "Project ID is required" },
      { status: 400 },
    );
  }

  try {
    // Discover projects live via GCP APIs
    const gcpProjects = await getAllGcpProjects();
    const project = gcpProjects.find((p) => p.project_id === projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.api_enabled) {
      return NextResponse.json(
        {
          success: false,
          error: "API not enabled for this project",
          message:
            "Enable the Cloud AI Companion API before testing this project",
        },
        { status: 400 },
      );
    }

    // Get the access token for this project's owner
    const tokenResult = await loadToken(project.owner_email);
    if (!tokenResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Token not found",
          message: `No valid token for ${project.owner_email}. Re-login required.`,
        },
        { status: 400 },
      );
    }

    const token = tokenResult.data;
    if (token.is_invalid) {
      return NextResponse.json(
        {
          success: false,
          error: "Token invalidated",
          message: `Token for ${project.owner_email} was invalidated: ${token.invalid_reason ?? "unknown reason"}. Re-login required.`,
        },
        { status: 400 },
      );
    }

    // Make a direct test API call to this specific project
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const requestBody = {
        model: GSWARM_CONFIG.model,
        request: {
          contents: [
            { role: "user", parts: [{ text: "Say 'OK' if you can hear me." }] },
          ],
          generationConfig: {
            maxOutputTokens: 10,
            temperature: 0,
          },
        },
        project: projectId,
      };

      const response = await fetch(ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorBody = await response.text();
        consoleError(
          PREFIX.API,
          `POST /api/projects/${projectId}/test - HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
        );

        // Parse error for user-friendly message
        let userMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorBody);
          const rawMsg = errorJson?.error?.message ?? "";
          // Check for Google account verification requirement
          if (rawMsg.includes("verify your account")) {
            userMessage =
              "Google requires account verification. Visit the verification URL in your browser, then retry.";
          } else if (rawMsg.includes("PERMISSION_DENIED")) {
            userMessage =
              "Permission denied. The API may not be accessible with this account.";
          } else if (response.status === 401) {
            userMessage =
              "Authentication failed. Token may be expired — try refreshing tokens.";
          } else if (response.status === 429) {
            userMessage =
              "Rate limited. This project has exceeded its quota — try again later.";
          } else {
            userMessage =
              rawMsg.split("\n")[0] || `API error (HTTP ${response.status})`;
          }
        } catch {
          userMessage = errorBody.slice(0, 200);
        }

        return NextResponse.json(
          {
            success: false,
            projectId,
            projectName: project.name,
            message: userMessage,
            tested: true,
            latencyMs,
            httpStatus: response.status,
            timestamp: new Date().toISOString(),
          },
          { status: 503 },
        );
      }

      // Parse successful response
      const data = await response.json();
      const responseText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no text)";

      consoleLog(
        PREFIX.SUCCESS,
        `Project ${projectId} test passed (${latencyMs}ms): ${responseText.slice(0, 50)}`,
      );

      return NextResponse.json({
        success: true,
        projectId,
        projectName: project.name,
        ownerEmail: project.owner_email,
        message: "Project API test successful",
        tested: true,
        latencyMs,
        response: responseText.slice(0, 100),
        timestamp: new Date().toISOString(),
      });
    } catch (testError) {
      const latencyMs = Math.round(performance.now() - startTime);

      if (
        testError instanceof DOMException &&
        testError.name === "AbortError"
      ) {
        return NextResponse.json(
          {
            success: false,
            projectId,
            projectName: project.name,
            message: "Request timed out after 15 seconds",
            tested: true,
            latencyMs,
            timestamp: new Date().toISOString(),
          },
          { status: 504 },
        );
      }

      const errorMessage =
        testError instanceof Error ? testError.message : String(testError);
      consoleError(
        PREFIX.API,
        `POST /api/projects/${projectId}/test failed:`,
        testError,
      );

      return NextResponse.json(
        {
          success: false,
          projectId,
          projectName: project.name,
          message: `API test failed: ${errorMessage}`,
          tested: true,
          latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    consoleError(PREFIX.API, "POST /api/projects/[id]/test failed:", error);
    return NextResponse.json(
      {
        error: "Failed to test project",
        message: "An internal error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
