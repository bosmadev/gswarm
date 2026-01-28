/**
 * GSwarm Request Executor
 *
 * Handles request execution to the Cloud Code API with:
 * - LRU-based project selection
 * - Error handling and retry logic
 * - Metrics recording
 * - Response parsing
 */

import { PREFIX, consoleDebug, consoleError, consoleWarn } from "@/lib/console";
import { markTokenInvalid } from "./storage/tokens";
import type {
  ApiGenerationConfig,
  GSwarmRequest,
  GSwarmResponse,
  StorageResult,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Cloud Code endpoint URL
 */
export const ENDPOINT_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

/**
 * Default GSwarm configuration from environment variables
 */
export const GSWARM_CONFIG = {
  /** Model to use for generation */
  model: process.env.GSWARM_MODEL ?? "gemini-2.5-pro",
  /** Default max output tokens */
  maxOutputTokens: Number.parseInt(
    process.env.GSWARM_MAX_OUTPUT_TOKENS ?? "65536",
    10,
  ),
  /** Default temperature */
  temperature: Number.parseFloat(process.env.GSWARM_TEMPERATURE ?? "1.0"),
  /** Default top-P */
  topP: Number.parseFloat(process.env.GSWARM_TOP_P ?? "0.95"),
  /** Enable thinking by default */
  thinkingEnabled: (process.env.GSWARM_THINKING_ENABLED ?? "true") === "true",
  /** Default thinking budget tokens */
  thinkingBudgetTokens: Number.parseInt(
    process.env.GSWARM_THINKING_BUDGET ?? "32768",
    10,
  ),
  /** Max retry attempts */
  maxRetries: Number.parseInt(process.env.GSWARM_MAX_RETRIES ?? "3", 10),
  /** Base delay for exponential backoff (ms) */
  baseRetryDelay: Number.parseInt(
    process.env.GSWARM_BASE_RETRY_DELAY ?? "1000",
    10,
  ),
} as const;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Execute request options
 */
export interface ExecuteRequestOptions {
  /** User prompt */
  prompt: string;
  /** Optional system instruction */
  systemInstruction?: string;
  /** Max output tokens override */
  maxOutputTokens?: number;
  /** Temperature override */
  temperature?: number;
  /** Enable Google Search tool */
  useGoogleSearch?: boolean;
  /** Response MIME type (e.g., "application/json") */
  responseMimeType?: string;
  /** JSON schema for structured output */
  responseJsonSchema?: Record<string, unknown>;
  /** Call source for logging/metrics */
  callSource?: string;
}

/**
 * Execute request result
 */
export interface ExecuteRequestResult {
  /** Generated text */
  text: string;
  /** Thinking/reasoning text (if enabled) */
  thoughts?: string;
  /** Project ID used for the request */
  projectId: string;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Token usage metadata */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    thoughtsTokens?: number;
  };
}

/**
 * Parsed JSON error structure
 */
export interface ParsedJsonError {
  retryDelay?: number;
  quotaLimit?: number;
  quotaValue?: number;
  message?: string;
}

/**
 * Error handler result
 */
export interface ErrorHandlerResult {
  retry: boolean;
  resetDuration?: number;
}

/**
 * LRU selector interface (to be imported from ./lru-selector)
 */
export interface LruSelector {
  selectProject(): Promise<
    StorageResult<{ projectId: string; accessToken: string; email?: string }>
  >;
  recordSuccess(projectId: string, latencyMs: number): Promise<void>;
  recordError(
    projectId: string,
    statusCode: number,
    errorType: string,
  ): Promise<void>;
  markProjectCooldown(projectId: string, durationMs: number): Promise<void>;
}

// =============================================================================
// GENERATION CONFIG BUILDER
// =============================================================================

/**
 * Build generation configuration with optional overrides
 *
 * @param overrides - Optional configuration overrides
 * @returns Complete generation configuration
 */
export function buildGenerationConfig(
  overrides?: Partial<ApiGenerationConfig>,
): ApiGenerationConfig {
  const config: ApiGenerationConfig = {
    maxOutputTokens:
      overrides?.maxOutputTokens ?? GSWARM_CONFIG.maxOutputTokens,
    temperature: overrides?.temperature ?? GSWARM_CONFIG.temperature,
    topP: overrides?.topP ?? GSWARM_CONFIG.topP,
  };

  // Add response MIME type if specified
  if (overrides?.responseMimeType) {
    config.responseMimeType = overrides.responseMimeType;
  }

  // Add JSON schema if specified
  if (overrides?.responseJsonSchema) {
    config.responseJsonSchema = overrides.responseJsonSchema;
  }

  // Add thinking config if enabled
  if (GSWARM_CONFIG.thinkingEnabled) {
    config.thinkingConfig = {
      thinkingBudget:
        overrides?.thinkingConfig?.thinkingBudget ??
        GSWARM_CONFIG.thinkingBudgetTokens,
    };
  }

  return config;
}

// =============================================================================
// ERROR HANDLER NAMESPACE
// =============================================================================

/**
 * GSwarm error handler namespace
 * Provides error parsing and handling utilities for API responses
 */
export namespace GSwarmErrorHandler {
  /**
   * Parse JSON error body to extract retry/quota information
   *
   * @param errorBody - Raw error body string
   * @returns Parsed error info or null
   */
  export function parseJsonError(errorBody: string): ParsedJsonError | null {
    try {
      const parsed = JSON.parse(errorBody);
      const result: ParsedJsonError = {};

      // Extract message
      if (parsed.error?.message) {
        result.message = parsed.error.message;
      }

      // Look for retry-after in the error
      const message = result.message ?? "";

      // Parse retry delay from message (e.g., "retry after 60s")
      const retryMatch = message.match(/retry\s+after\s+(\d+)\s*s/i);
      if (retryMatch) {
        result.retryDelay = Number.parseInt(retryMatch[1], 10) * 1000;
      }

      // Parse quota information
      const quotaLimitMatch = message.match(/quota[:\s]+(\d+)/i);
      if (quotaLimitMatch) {
        result.quotaLimit = Number.parseInt(quotaLimitMatch[1], 10);
      }

      const quotaValueMatch = message.match(/used[:\s]+(\d+)/i);
      if (quotaValueMatch) {
        result.quotaValue = Number.parseInt(quotaValueMatch[1], 10);
      }

      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  /**
   * Handle 400 Bad Request error
   *
   * @param projectId - Project identifier
   * @param errorBody - Error response body
   */
  export function handleBadRequest(projectId: string, errorBody: string): void {
    const parsed = parseJsonError(errorBody);
    consoleError(
      PREFIX.ERROR,
      `[GSwarm] Bad request for project ${projectId}: ${parsed?.message ?? errorBody.slice(0, 200)}`,
    );
  }

  /**
   * Handle 401 Unauthorized error
   * Auto-invalidates the token for the associated email
   *
   * @param projectId - Project identifier
   * @param email - Optional email to auto-invalidate token
   */
  export async function handleUnauthorized(
    projectId: string,
    email?: string,
  ): Promise<void> {
    consoleError(
      PREFIX.ERROR,
      `[GSwarm] Unauthorized for project ${projectId} - token may be expired or invalid`,
    );

    // Auto-invalidate token if email is provided
    if (email) {
      try {
        await markTokenInvalid(
          email,
          `401 Unauthorized for project ${projectId}`,
        );
        consoleWarn(
          PREFIX.WARNING,
          `[GSwarm] Token auto-invalidated for ${email} due to 401 error`,
        );
      } catch (error) {
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Failed to auto-invalidate token for ${email}: ${error}`,
        );
      }
    }
  }

  /**
   * Handle 403 Forbidden error
   *
   * @param projectId - Project identifier
   */
  export function handleForbidden(projectId: string): void {
    consoleError(
      PREFIX.ERROR,
      `[GSwarm] Forbidden for project ${projectId} - insufficient permissions or API not enabled`,
    );
  }

  /**
   * Handle 404 Not Found error
   *
   * @param projectId - Project identifier
   */
  export function handleNotFound(projectId: string): void {
    consoleError(
      PREFIX.ERROR,
      `[GSwarm] Not found for project ${projectId} - endpoint or model may not exist`,
    );
  }

  /**
   * Handle 429 Rate Limit error
   *
   * @param projectId - Project identifier
   * @param errorBody - Error response body
   * @param latencyMs - Request latency
   * @param callSource - Call source identifier
   * @returns Object with optional reset duration
   */
  export function handleRateLimit(
    projectId: string,
    errorBody: string,
    latencyMs: number,
    callSource?: string,
  ): { resetDuration?: number } {
    const parsed = parseJsonError(errorBody);
    const result: { resetDuration?: number } = {};

    if (parsed?.retryDelay) {
      result.resetDuration = parsed.retryDelay;
    } else {
      // Default cooldown of 60 seconds
      result.resetDuration = 60000;
    }

    consoleWarn(
      PREFIX.WARNING,
      `[GSwarm] Rate limited for project ${projectId}${callSource ? ` (${callSource})` : ""} - cooldown ${result.resetDuration}ms (latency: ${latencyMs}ms)`,
    );

    if (parsed?.quotaLimit || parsed?.quotaValue) {
      consoleDebug(
        PREFIX.DEBUG,
        `[GSwarm] Quota info: limit=${parsed.quotaLimit}, used=${parsed.quotaValue}`,
      );
    }

    return result;
  }

  /**
   * Handle 500 Internal Server Error
   *
   * @param projectId - Project identifier
   */
  export function handleInternalError(projectId: string): void {
    consoleError(
      PREFIX.ERROR,
      `[GSwarm] Internal server error for project ${projectId} - API service issue`,
    );
  }

  /**
   * Handle 503 Service Unavailable error
   *
   * @param projectId - Project identifier
   */
  export function handleServiceUnavailable(projectId: string): void {
    consoleWarn(
      PREFIX.WARNING,
      `[GSwarm] Service unavailable for project ${projectId} - API may be overloaded`,
    );
  }

  /**
   * Main error handler - routes to specific handlers based on status code
   *
   * @param projectId - Project identifier
   * @param status - HTTP status code
   * @param errorBody - Error response body
   * @param latencyMs - Request latency
   * @param callSource - Call source identifier
   * @param email - Optional email for token auto-invalidation on 401
   * @returns Error handler result with retry flag and optional reset duration
   */
  export async function handle(
    projectId: string,
    status: number,
    errorBody: string,
    latencyMs: number,
    callSource?: string,
    email?: string,
  ): Promise<ErrorHandlerResult> {
    switch (status) {
      case 400:
        handleBadRequest(projectId, errorBody);
        return { retry: false };

      case 401:
        await handleUnauthorized(projectId, email);
        // Retry with different project - token expired
        return { retry: true, resetDuration: 300000 }; // 5 min cooldown

      case 403:
        handleForbidden(projectId);
        // Retry with different project - permission issue
        return { retry: true, resetDuration: 600000 }; // 10 min cooldown

      case 404:
        handleNotFound(projectId);
        // Retry with different project
        return { retry: true, resetDuration: 3600000 }; // 1 hour cooldown

      case 429: {
        const rateLimitResult = handleRateLimit(
          projectId,
          errorBody,
          latencyMs,
          callSource,
        );
        return { retry: true, resetDuration: rateLimitResult.resetDuration };
      }

      case 500:
        handleInternalError(projectId);
        // Retry - transient server error
        return { retry: true };

      case 503:
        handleServiceUnavailable(projectId);
        // Retry - service temporarily unavailable
        return { retry: true, resetDuration: 30000 }; // 30 sec cooldown

      default:
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Unexpected error ${status} for project ${projectId}: ${errorBody.slice(0, 200)}`,
        );
        return { retry: status >= 500 };
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract JSON from a response that may contain markdown code blocks
 *
 * @param text - Response text that may contain JSON
 * @returns Extracted JSON string
 */
export function extractJsonFromResponse(text: string): string {
  // Try to extract from markdown code block
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch?.[1]) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find JSON object or array directly
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch?.[1]) {
    // Validate it's actually JSON
    try {
      JSON.parse(jsonMatch[1]);
      return jsonMatch[1];
    } catch {
      // Not valid JSON, return original
    }
  }

  // Return trimmed original text
  return text.trim();
}

/**
 * Build the request body for the GSwarm API
 *
 * @param options - Execute request options
 * @returns GSwarm request body
 */
function buildRequestBody(options: ExecuteRequestOptions): GSwarmRequest {
  const body: GSwarmRequest = {
    model: GSWARM_CONFIG.model,
    contents: [
      {
        role: "user",
        parts: [{ text: options.prompt }],
      },
    ],
    generationConfig: buildGenerationConfig({
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
      responseMimeType: options.responseMimeType,
      responseJsonSchema: options.responseJsonSchema,
    }),
  };

  // Add system instruction if provided
  if (options.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  // Add Google Search tool if enabled
  if (options.useGoogleSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  return body;
}

/**
 * Parse the API response to extract text and thoughts
 *
 * @param response - GSwarm API response
 * @returns Parsed text and thoughts
 */
function parseResponse(response: GSwarmResponse): {
  text: string;
  thoughts?: string;
} {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  let thoughts = "";

  for (const part of parts) {
    if (part.thought) {
      thoughts += (thoughts ? "\n" : "") + (part.text ?? "");
    } else if (part.text) {
      text += (text ? "\n" : "") + part.text;
    }
  }

  return {
    text: text.trim(),
    thoughts: thoughts.trim() || undefined,
  };
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN EXECUTOR
// =============================================================================

/**
 * Execute a request to the GSwarm API
 *
 * Uses LRU selector to pick a project, makes the API request,
 * handles errors with retry logic, and records metrics.
 *
 * @param options - Request execution options
 * @param lruSelector - LRU selector instance for project selection
 * @returns Promise resolving to execution result
 * @throws Error if all retries exhausted or non-retryable error
 */
export async function executeRequest(
  options: ExecuteRequestOptions,
  lruSelector: LruSelector,
): Promise<ExecuteRequestResult> {
  const maxRetries = GSWARM_CONFIG.maxRetries;
  const baseDelay = GSWARM_CONFIG.baseRetryDelay;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    // Select project using LRU
    const selection = await lruSelector.selectProject();
    if (!selection.success) {
      throw new Error(`Failed to select project: ${selection.error}`);
    }

    const { projectId, accessToken, email } = selection.data;
    const startTime = Date.now();

    try {
      consoleDebug(
        PREFIX.DEBUG,
        `[GSwarm] Attempt ${attempt}/${maxRetries} using project ${projectId}${options.callSource ? ` (${options.callSource})` : ""}`,
      );

      // Build request
      const requestBody = buildRequestBody(options);

      // Make API request
      const response = await fetch(ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      const latencyMs = Date.now() - startTime;

      // Handle non-OK responses
      if (!response.ok) {
        const errorBody = await response.text();
        const errorResult = await GSwarmErrorHandler.handle(
          projectId,
          response.status,
          errorBody,
          latencyMs,
          options.callSource,
          email, // Pass email for 401 auto-invalidation
        );

        // Record error
        await lruSelector.recordError(
          projectId,
          response.status,
          `HTTP_${response.status}`,
        );

        // Mark cooldown if specified
        if (errorResult.resetDuration) {
          await lruSelector.markProjectCooldown(
            projectId,
            errorResult.resetDuration,
          );
        }

        // Check if we should retry
        if (!errorResult.retry) {
          throw new Error(
            `Request failed with status ${response.status}: ${errorBody.slice(0, 200)}`,
          );
        }

        // Calculate backoff delay
        const backoffDelay = baseDelay * 2 ** (attempt - 1);
        const jitter = Math.random() * 1000;
        const delayMs = Math.min(backoffDelay + jitter, 30000);

        consoleDebug(
          PREFIX.DEBUG,
          `[GSwarm] Retrying in ${Math.round(delayMs)}ms...`,
        );
        await sleep(delayMs);

        lastError = new Error(
          `HTTP ${response.status}: ${errorBody.slice(0, 100)}`,
        );
        continue;
      }

      // Parse successful response
      const responseData: GSwarmResponse = await response.json();

      // Check for API-level errors
      if (responseData.error) {
        const errorMessage = responseData.error.message ?? "Unknown API error";
        await lruSelector.recordError(
          projectId,
          responseData.error.code ?? 500,
          responseData.error.status ?? "API_ERROR",
        );
        throw new Error(`API error: ${errorMessage}`);
      }

      // Parse response parts
      const { text, thoughts } = parseResponse(responseData);

      // Record success
      await lruSelector.recordSuccess(projectId, latencyMs);

      consoleDebug(
        PREFIX.DEBUG,
        `[GSwarm] Request successful for project ${projectId} (${latencyMs}ms)`,
      );

      // Build result
      const result: ExecuteRequestResult = {
        text,
        thoughts,
        projectId,
        latencyMs,
      };

      // Add usage metadata if available
      if (responseData.usageMetadata) {
        result.usage = {
          promptTokens: responseData.usageMetadata.promptTokenCount ?? 0,
          completionTokens:
            responseData.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: responseData.usageMetadata.totalTokenCount ?? 0,
          thoughtsTokens: responseData.usageMetadata.thoughtsTokenCount,
        };
      }

      return result;
    } catch (error) {
      // Handle fetch errors (network issues, etc.)
      if (error instanceof TypeError && error.message.includes("fetch")) {
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Network error for project ${projectId}: ${error.message}`,
        );
        await lruSelector.recordError(projectId, 0, "NETWORK_ERROR");
        await lruSelector.markProjectCooldown(projectId, 30000);

        lastError = error;

        // Retry on network errors
        const backoffDelay = baseDelay * 2 ** (attempt - 1);
        await sleep(Math.min(backoffDelay, 30000));
        continue;
      }

      // Re-throw non-retryable errors
      if (
        error instanceof Error &&
        !error.message.includes("HTTP") &&
        !error.message.includes("Network")
      ) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  // All retries exhausted
  throw lastError ?? new Error("Request failed after all retries");
}
