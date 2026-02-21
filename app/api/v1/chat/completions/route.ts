/**
 * @file app/api/v1/chat/completions/route.ts
 * @version 1.0
 * @description OpenAI-compatible chat completions endpoint.
 * Maps OpenAI API format to Gemini Cloud Code API with model translation.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  addCorsHeaders,
  addRateLimitHeaders,
  authenticateRequest,
  corsPreflightResponse,
  rateLimitResponse,
  unauthorizedResponse,
} from "@/app/api/gswarm/_shared/auth";
import { streamingResponse } from "@/app/api/gswarm/_shared/streaming";
import { parseAndValidate } from "@/lib/api-validation";
import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import { gswarmClient } from "@/lib/gswarm/client";
import { errorResponse } from "@/lib/gswarm/error-handler";
import { ApiError } from "@/lib/gswarm/errors";
import { recordMetric } from "@/lib/gswarm/storage/metrics";
import type { RequestMetric } from "@/lib/gswarm/types";

// =============================================================================
// MODEL MAPPING
// =============================================================================

/**
 * Maps OpenAI model names to Gemini models
 */
const MODEL_MAP: Record<string, string> = {
  "gpt-4": "gemini-2.5-pro",
  "gpt-4o": "gemini-2.0-flash",
  "gpt-4o-mini": "gemini-2.0-flash",
  "gpt-3.5-turbo": "gemini-2.0-flash",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3-pro": "gemini-3-pro-preview",
};

/**
 * Allowlist of supported Gemini model IDs.
 * Any gemini-* model string not in this list is rejected.
 */
const ALLOWED_MODELS = new Set<string>([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
]);

/**
 * Maps OpenAI model to Gemini model.
 * Returns null if the resolved Gemini model is not in the allowlist.
 */
function mapModel(openaiModel: string): string | null {
  let geminiModel: string;

  // If it's already a gemini-* model, validate against allowlist directly
  if (openaiModel.startsWith("gemini-")) {
    geminiModel = openaiModel;
  } else {
    // Use mapping table, default to gemini-2.0-flash
    geminiModel = MODEL_MAP[openaiModel] || "gemini-2.0-flash";
  }

  // Validate against allowlist
  if (!ALLOWED_MODELS.has(geminiModel)) {
    return null;
  }

  return geminiModel;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Chat message structure (OpenAI format)
 */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Request body for chat endpoint (OpenAI format)
 */
interface ChatRequestBody {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  [key: string]: unknown;
}

/**
 * OpenAI-compatible chat completion response
 */
interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generates a unique completion ID
 */
function generateCompletionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `chatcmpl-${timestamp}${random}`;
}

/**
 * Strips role-prefix injection patterns from user content.
 * Prevents users from injecting "System:", "Assistant:", "User:" prefixes
 * to manipulate the conversation structure.
 */
function stripRolePrefixes(content: string): string {
  // Remove leading role-prefix patterns (case-insensitive, with optional whitespace)
  return content.replace(/^\s*(?:system|assistant|user)\s*:\s*/i, "");
}

/**
 * Converts messages array to a single prompt string.
 * Exported for unit testing.
 */
export function messagesToPrompt(messages: ChatMessage[]): {
  prompt: string;
  systemPrompt?: string;
} {
  let systemPrompt: string | undefined;
  const conversationParts: string[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      // Combine system messages
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n${message.content}`
        : message.content;
    } else if (message.role === "user") {
      // Strip role-prefix injection from user content
      const safeContent = stripRolePrefixes(message.content);
      conversationParts.push(`User: ${safeContent}`);
    } else if (message.role === "assistant") {
      conversationParts.push(`Assistant: ${message.content}`);
    }
  }

  // The last user message is the main prompt
  let lastUserMessage: ChatMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserMessage = messages[i];
      break;
    }
  }
  const prompt = lastUserMessage
    ? stripRolePrefixes(lastUserMessage.content)
    : conversationParts.join("\n\n");

  return { prompt, systemPrompt };
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function POST(request: NextRequest) {
  // Authenticate request
  const auth = await authenticateRequest(request, "/api/v1/chat/completions");

  if (!auth.success) {
    if (auth.error?.code === 1006) {
      // AUTH_RATE_LIMIT
      return rateLimitResponse(auth.rateLimitReset);
    }
    return unauthorizedResponse(
      auth.error?.message || "Unauthorized",
      auth.rateLimitRemaining,
      auth.rateLimitReset,
    );
  }

  // Parse and validate request body
  const parseResult = await parseAndValidate<ChatRequestBody>(request, {
    required: ["messages"],
    types: {
      messages: "array",
      model: "string",
      max_tokens: "number",
      temperature: "number",
      stream: "boolean",
    },
    ranges: {
      max_tokens: { min: 1, max: 65536 },
      temperature: { min: 0, max: 2 },
    },
  });

  if (!parseResult.success) {
    return parseResult.response;
  }

  const {
    messages,
    model: requestedModel,
    max_tokens,
    temperature,
    stream,
  } = parseResult.data;

  // Validate messages array is not empty
  if (!messages.length) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Validation failed",
          message: "Messages array cannot be empty",
        },
        { status: 400 },
      ),
    );
  }

  // Validate message structure
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Validation failed",
            message: "Each message must have 'role' and 'content' fields",
          },
          { status: 400 },
        ),
      );
    }
    if (!["user", "assistant", "system"].includes(msg.role)) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Validation failed",
            message: "Message role must be 'user', 'assistant', or 'system'",
          },
          { status: 400 },
        ),
      );
    }
  }

  // Map OpenAI model to Gemini model and validate against allowlist
  const geminiModel = requestedModel
    ? mapModel(requestedModel)
    : "gemini-2.0-flash";

  if (geminiModel === null) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Validation failed",
          message: `Unsupported model: '${requestedModel}'. Supported models: ${[...ALLOWED_MODELS].join(", ")}`,
        },
        { status: 400 },
      ),
    );
  }

  consoleDebug(
    PREFIX.DEBUG,
    `[OpenAI API] Model mapping: ${requestedModel || "default"} → ${geminiModel}`,
  );

  const startTime = Date.now();

  try {
    // Convert messages to prompt format
    const { prompt, systemPrompt } = messagesToPrompt(messages);

    // Generate content using GSwarm
    const result = await gswarmClient.generateContent(prompt, {
      systemInstruction: systemPrompt,
      maxOutputTokens: max_tokens,
      temperature,
      callSource: "openai-api",
    });

    const durationMs = Date.now() - startTime;
    const completionId = generateCompletionId();
    const created = Math.floor(Date.now() / 1000);

    // Return streaming response if requested
    if (stream) {
      // Record metrics for streaming request
      const metric: RequestMetric = {
        id: completionId,
        timestamp: new Date().toISOString(),
        endpoint: "/api/v1/chat/completions",
        method: "POST",
        account_id: auth.keyName || "unknown",
        project_id: result.projectId,
        duration_ms: durationMs,
        status: "success",
        status_code: 200,
        tokens_used: result.usage?.totalTokens || 0,
        model: geminiModel,
      };

      // Record metric asynchronously (don't wait for it)
      recordMetric(metric).catch((error) => {
        consoleError(
          PREFIX.ERROR,
          `[OpenAI API] Failed to record metric: ${error}`,
        );
      });

      return streamingResponse({
        id: completionId,
        model: requestedModel || "gpt-4o",
        text: result.text,
        created,
        rateLimitRemaining: auth.rateLimitRemaining,
        rateLimitReset: auth.rateLimitReset,
      });
    }

    // Record metrics for successful request
    const metric: RequestMetric = {
      id: completionId,
      timestamp: new Date().toISOString(),
      endpoint: "/api/v1/chat/completions",
      method: "POST",
      account_id: auth.keyName || "unknown",
      project_id: result.projectId,
      duration_ms: durationMs,
      status: "success",
      status_code: 200,
      tokens_used: result.usage?.totalTokens || 0,
      model: geminiModel,
    };

    // Record metric asynchronously (don't wait for it)
    recordMetric(metric).catch((error) => {
      consoleError(
        PREFIX.ERROR,
        `[OpenAI API] Failed to record metric: ${error}`,
      );
    });

    // Build OpenAI-compatible response
    const response: ChatCompletionResponse = {
      id: completionId,
      object: "chat.completion",
      created,
      model: requestedModel || "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: result.usage?.promptTokens || 0,
        completion_tokens: result.usage?.completionTokens || 0,
        total_tokens: result.usage?.totalTokens || 0,
      },
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
      id: generateCompletionId(),
      timestamp: new Date().toISOString(),
      endpoint: "/api/v1/chat/completions",
      method: "POST",
      account_id: auth.keyName || "unknown",
      project_id: "unknown",
      duration_ms: durationMs,
      status: "error",
      status_code: 500,
      error_type: "generation_error",
      error_message: errorMessage,
      model: geminiModel,
    };

    // Record metric asynchronously (don't wait for it)
    recordMetric(metric).catch((metricError) => {
      consoleError(
        PREFIX.ERROR,
        `[OpenAI API] Failed to record metric: ${metricError}`,
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
 * OPTIONS /api/v1/chat/completions
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
