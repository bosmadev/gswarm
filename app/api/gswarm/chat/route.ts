/**
 * @file app/api/gswarm/chat/route.ts
 * @version 1.0
 * @description OpenAI-compatible chat completions endpoint.
 * Validates API key and IP, then generates content using GSwarm.
 */

import { type NextRequest, NextResponse } from "next/server";
import { parseAndValidate } from "@/lib/api-validation";
import { PREFIX, consoleError } from "@/lib/console";
import { gswarmClient } from "@/lib/gswarm/client";
import { errorResponse } from "@/lib/gswarm/error-handler";
import { ApiError } from "@/lib/gswarm/errors";
import { recordMetric } from "@/lib/gswarm/storage/metrics";
import type { RequestMetric } from "@/lib/gswarm/types";
import {
  addCorsHeaders,
  addRateLimitHeaders,
  authenticateRequest,
  corsPreflightResponse,
  rateLimitResponse,
  unauthorizedResponse,
} from "../_shared/auth";
import { streamingResponse } from "../_shared/streaming";

// =============================================================================
// INPUT LIMITS
// =============================================================================

/** Maximum number of messages allowed per request */
const MAX_MESSAGES = 100;

/** Maximum content length per message in characters */
const MAX_CONTENT_LENGTH = 100_000;

/**
 * Chat message structure
 */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Request body for chat endpoint
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
 * Converts messages array to a single prompt string
 */
function messagesToPrompt(messages: ChatMessage[]): {
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
  const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
  const lastUserMessage = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
  const prompt = lastUserMessage
    ? stripRolePrefixes(lastUserMessage.content)
    : conversationParts.join("\n\n");

  return { prompt, systemPrompt };
}

export async function POST(request: NextRequest) {
  // Authenticate request
  const auth = await authenticateRequest(request, "/api/gswarm/chat");

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

  const { messages, max_tokens, temperature, stream } = parseResult.data;

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

  // Enforce message count limit
  if (messages.length > MAX_MESSAGES) {
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Validation failed",
          message: `Too many messages: maximum is ${MAX_MESSAGES}`,
        },
        { status: 400 },
      ),
    );
  }

  // Validate message structure and content length
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
    if (msg.content.length > MAX_CONTENT_LENGTH) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: "Validation failed",
            message: `Message content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
          },
          { status: 400 },
        ),
      );
    }
  }

  const startTime = Date.now();

  try {
    // Convert messages to prompt format
    const { prompt, systemPrompt } = messagesToPrompt(messages);

    // Generate content using GSwarm
    const result = await gswarmClient.generateContent(prompt, {
      systemInstruction: systemPrompt,
      maxOutputTokens: max_tokens,
      temperature,
      callSource: "api-chat",
    });

    const durationMs = Date.now() - startTime;
    const completionId = generateCompletionId();
    const created = Math.floor(Date.now() / 1000);
    const model = gswarmClient.getCurrentModel();

    // Return streaming response if requested
    if (stream) {
      // Record metrics for streaming request
      const metric: RequestMetric = {
        id: completionId,
        timestamp: new Date().toISOString(),
        endpoint: "/api/gswarm/chat",
        method: "POST",
        account_id: auth.keyName || "unknown",
        project_id: result.projectId,
        duration_ms: durationMs,
        status: "success",
        status_code: 200,
        tokens_used: result.usage?.totalTokens || 0,
        model,
      };

      // Record metric asynchronously (don't wait for it)
      recordMetric(metric).catch((error) => {
        consoleError(PREFIX.ERROR, `[API] Failed to record metric: ${error}`);
      });

      return streamingResponse({
        id: completionId,
        model,
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
      endpoint: "/api/gswarm/chat",
      method: "POST",
      account_id: auth.keyName || "unknown",
      project_id: result.projectId,
      duration_ms: durationMs,
      status: "success",
      status_code: 200,
      tokens_used: result.usage?.totalTokens || 0,
      model,
    };

    // Record metric asynchronously (don't wait for it)
    recordMetric(metric).catch((error) => {
      consoleError(PREFIX.ERROR, `[API] Failed to record metric: ${error}`);
    });

    // Build OpenAI-compatible response
    const response: ChatCompletionResponse = {
      id: completionId,
      object: "chat.completion",
      created,
      model,
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
      endpoint: "/api/gswarm/chat",
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
 * OPTIONS /api/gswarm/chat
 * CORS preflight handler
 */
export function OPTIONS() {
  return corsPreflightResponse();
}
