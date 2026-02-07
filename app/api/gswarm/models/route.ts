/**
 * @file app/api/gswarm/models/route.ts
 * @version 1.0
 * @description GSwarm available models listing endpoint
 * GET /api/gswarm/models - List available Gemini models
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import { GSWARM_CONFIG } from "@/lib/gswarm/executor";
import { validateApiKey } from "@/lib/gswarm/storage/api-keys";
import { addCorsHeaders, corsPreflightResponse } from "../_shared/auth";

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
 *
 * @param request - The incoming Next.js request
 * @returns Validation result with error message if invalid
 */
async function authenticateRequest(
  request: NextRequest,
): Promise<{ valid: boolean; error?: string }> {
  // First, try session authentication (for dashboard)
  const sessionValidation = await validateAdminSession(request);
  if (sessionValidation.valid) {
    return { valid: true };
  }

  // Fall back to API key authentication
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { valid: false, error: "Missing authentication" };
  }

  const clientIp = getClientIp(request);
  const validationResult = await validateApiKey(
    apiKey,
    clientIp,
    "/api/gswarm/models",
  );

  return validationResult;
}

/**
 * Model metadata interface
 */
interface ModelInfo {
  id: string;
  name: string;
  family: string;
  tier: "flash" | "pro";
  generation: string;
  isPreview: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsThinking: boolean;
  description: string;
}

/**
 * Available Gemini models with metadata
 */
const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    family: "gemini",
    tier: "flash",
    generation: "2.0",
    isPreview: false,
    maxInputTokens: 1_048_576,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    description: "Fast, versatile model for most tasks",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    family: "gemini",
    tier: "flash",
    generation: "2.5",
    isPreview: false,
    maxInputTokens: 1_048_576,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    description: "Enhanced Flash model with improved quality",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    family: "gemini",
    tier: "pro",
    generation: "2.5",
    isPreview: false,
    maxInputTokens: 2_097_152,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    description: "Advanced model for complex reasoning",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3.0 Flash (Preview)",
    family: "gemini",
    tier: "flash",
    generation: "3.0",
    isPreview: true,
    maxInputTokens: 1_048_576,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    description: "Experimental next-gen Flash model",
  },
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3.0 Pro (Preview)",
    family: "gemini",
    tier: "pro",
    generation: "3.0",
    isPreview: true,
    maxInputTokens: 2_097_152,
    maxOutputTokens: 65_536,
    supportsThinking: true,
    description: "Experimental next-gen Pro model with enhanced capabilities",
  },
];

/**
 * GET /api/gswarm/models
 * List available Gemini models
 */
export async function GET(request: NextRequest) {
  // Authenticate request
  const authResult = await authenticateRequest(request);
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

  try {
    // Get filter parameters
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get("tier"); // "flash" or "pro"
    const generation = searchParams.get("generation"); // "2.0", "2.5", "3.0"
    const includePreview =
      searchParams.get("includePreview")?.toLowerCase() !== "false"; // default true

    // Filter models based on query params
    let filteredModels = AVAILABLE_MODELS;

    if (tier) {
      filteredModels = filteredModels.filter((m) => m.tier === tier);
    }

    if (generation) {
      filteredModels = filteredModels.filter((m) => m.generation === generation);
    }

    if (!includePreview) {
      filteredModels = filteredModels.filter((m) => !m.isPreview);
    }

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        defaultModel: GSWARM_CONFIG.model,
        count: filteredModels.length,
        models: filteredModels,
      }),
    );
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      `[API] GET /api/gswarm/models failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * OPTIONS /api/gswarm/models
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
