/**
 * @file app/api/gswarm/generate/route.ts
 * @version 1.0
 * @description Simple text generation endpoint.
 * Validates API key and IP, then generates content using GSwarm.
 */

import { type NextRequest, NextResponse } from "next/server";
import { parseAndValidate } from "@/lib/api-validation";
import { PREFIX, consoleError } from "@/lib/console";
import { gswarmClient } from "@/lib/gswarm/client";
import {
  errorResponse,
  unauthorizedErrorResponse,
} from "@/lib/gswarm/error-handler";
import { ApiError } from "@/lib/gswarm/errors";
import { recordMetric } from "@/lib/gswarm/storage/metrics";
import type { RequestMetric } from "@/lib/gswarm/types";
import {
  addCorsHeaders,
  addRateLimitHeaders,
  authenticateRequest,
  corsPreflightResponse,
} from "../_shared/auth";

/**
 * Request body for generate endpoint
 */
interface GenerateRequestBody {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  [key: string]: unknown;
}

/**
 * Response from generate endpoint
 */
interface GenerateResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  projectId: string;
  model: string;
  latencyMs: number;
}

export async function POST(request: NextRequest) {
  // Authenticate request
  const auth = await authenticateRequest(request, "/api/gswarm/generate");

  if (!auth.success) {
    if (auth.error) {
      return errorResponse(auth.error, {
        rateLimitRemaining: auth.rateLimitRemaining,
        rateLimitReset: auth.rateLimitReset,
      });
    }
    return unauthorizedErrorResponse(
      "Authentication failed",
      auth.rateLimitRemaining,
      auth.rateLimitReset,
    );
  }
  // Parse and validate request body
  const parseResult = await parseAndValidate<GenerateRequestBody>(request, {
    required: ["prompt"],
    types: {
      prompt: "string",
      model: "string",
      maxTokens: "number",
      temperature: "number",
      systemPrompt: "string",
    },
    ranges: {
      maxTokens: { min: 1, max: 65536 },
      temperature: { min: 0, max: 2 },
    },
  });

  if (!parseResult.success) {
    return parseResult.response;
  }

  const { prompt, maxTokens, temperature, systemPrompt } = parseResult.data;

  // Validate prompt is not empty
  if (!prompt.trim()) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Validation failed",
          message: "Prompt cannot be empty",
        },
        { status: 400 },
      ),
    );
  }

  const startTime = Date.now();

  try {
    // Generate content using GSwarm
    const result = await gswarmClient.generateContent(prompt, {
      systemInstruction: systemPrompt,
      maxOutputTokens: maxTokens,
      temperature,
      callSource: "api-generate",
    });

    const durationMs = Date.now() - startTime;

    // Record metrics for successful request
    const metric: RequestMetric = {
      id: `gen-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`,
      timestamp: new Date().toISOString(),
      endpoint: "/api/gswarm/generate",
      method: "POST",
      account_id: auth.keyName || "unknown",
      project_id: result.projectId,
      duration_ms: durationMs,
      status: "success",
      status_code: 200,
      tokens_used: result.usage?.totalTokens || 0,
      model: gswarmClient.getCurrentModel(),
    };

    // Record metric asynchronously (don't wait for it)
    recordMetric(metric).catch((error) => {
      consoleError(PREFIX.ERROR, `[API] Failed to record metric: ${error}`);
    });

    // Build response
    const response: GenerateResponse = {
      text: result.text,
      usage: {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      },
      projectId: result.projectId,
      model: gswarmClient.getCurrentModel(),
      latencyMs: result.latencyMs,
    };

    const jsonResponse = NextResponse.json(response);
    addCorsHeaders(jsonResponse);
    return addRateLimitHeaders(
      jsonResponse,
      auth.rateLimitRemaining,
      auth.rateLimitReset,
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Record metrics for failed request
    const metric: RequestMetric = {
      id: `gen-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`,
      timestamp: new Date().toISOString(),
      endpoint: "/api/gswarm/generate",
      method: "POST",
      account_id: auth.keyName || "unknown",
      project_id: "unknown",
      duration_ms: durationMs,
      status: "error",
      status_code: 500,
      error_type: "generation_error",
      error_message: errorMessage,
      model: gswarmClient.getCurrentModel(),
    };

    // Record metric asynchronously (don't wait for it)
    recordMetric(metric).catch((metricError) => {
      consoleError(
        PREFIX.ERROR,
        `[API] Failed to record metric: ${metricError}`,
      );
    });

    // Convert to ApiError and return with rate limit headers
    const apiError =
      error instanceof ApiError
        ? error
        : ApiError.gswarmGenerationFailed(errorMessage);

    return errorResponse(apiError, {
      rateLimitRemaining: auth.rateLimitRemaining,
      rateLimitReset: auth.rateLimitReset,
    });
  }
}

/**
 * OPTIONS /api/gswarm/generate
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
