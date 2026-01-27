/**
 * @file app/api/gswarm/config/route.ts
 * @description GSwarm configuration API endpoint
 * GET /api/gswarm/config - Get current configuration
 * POST /api/gswarm/config - Update configuration
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import { loadConfig, updateConfig } from "@/lib/gswarm/storage/config";
import type { GSwarmConfig } from "@/lib/gswarm/types";

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
 * GET /api/gswarm/config
 * Get current GSwarm configuration
 */
export async function GET(request: NextRequest) {
  // Extract and validate API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Missing API key" },
      { status: 401 },
    );
  }

  const clientIp = getClientIp(request);
  const validationResult = await validateApiKey(
    apiKey,
    clientIp,
    "/api/gswarm/config",
  );

  if (!validationResult.valid) {
    return NextResponse.json(
      { success: false, error: validationResult.error },
      { status: validationResult.error === "Rate limit exceeded" ? 429 : 401 },
    );
  }

  try {
    const configResult = await loadConfig();
    if (!configResult.success) {
      return NextResponse.json(
        { success: false, error: configResult.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      config: configResult.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/gswarm/config
 * Update GSwarm configuration (partial updates supported)
 */
export async function POST(request: NextRequest) {
  // Extract and validate API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Missing API key" },
      { status: 401 },
    );
  }

  const clientIp = getClientIp(request);
  const validationResult = await validateApiKey(
    apiKey,
    clientIp,
    "/api/gswarm/config",
  );

  if (!validationResult.valid) {
    return NextResponse.json(
      { success: false, error: validationResult.error },
      { status: validationResult.error === "Rate limit exceeded" ? 429 : 401 },
    );
  }

  // Parse request body
  let updates: Partial<GSwarmConfig>;
  try {
    updates = (await request.json()) as Partial<GSwarmConfig>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Validate updates (basic validation)
  if (
    typeof updates !== "object" ||
    updates === null ||
    Array.isArray(updates)
  ) {
    return NextResponse.json(
      { success: false, error: "Updates must be an object" },
      { status: 400 },
    );
  }

  try {
    const updateResult = await updateConfig(updates);
    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: updateResult.error },
        { status: 500 },
      );
    }

    // Return updated config
    const configResult = await loadConfig();
    if (!configResult.success) {
      return NextResponse.json(
        { success: false, error: configResult.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Configuration updated successfully",
      config: configResult.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
