/**
 * GSwarm Request Executor
 *
 * Handles request execution to the Cloud Code API with:
 * - LRU-based project selection
 * - Error handling and retry logic
 * - Metrics recording
 * - Response parsing
 */

import { PREFIX, consoleDebug, consoleError } from "@/lib/console";
import {
  GSwarmNetworkError,
  GSwarmParseError,
  GSwarmProjectError,
} from "./errors";
import { GSwarmErrorHandler } from "./gswarm-error-handler";
import type {
  ApiGenerationConfig,
  GSwarmRequest,
  GSwarmRequestInner,
  GSwarmResponse,
  StorageResult,
} from "./types";

export type {
  ErrorHandlerResult,
  ParsedJsonError,
} from "./gswarm-error-handler";
// Re-export error handler types and namespace for backward compatibility
export { GSwarmErrorHandler } from "./gswarm-error-handler";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Cloud Code endpoint URL
 */
export const ENDPOINT_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:generateContent";

/**
 * Default request timeout in milliseconds (60 seconds)
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

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
  /** Custom fetch function for dependency injection (defaults to global fetch) */
  fetchFn?: typeof fetch;
  /** Request timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
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
 * LRU selector interface (implemented by lru-selector module)
 */
export interface LruSelector {
  selectProjectForRequest(callSource?: string): Promise<{
    project: { project_id: string; owner_email: string };
    accessToken: string;
    email: string;
    fromCache: boolean;
    healthScore?: number;
  } | null>;
  markProjectUsed(projectId: string): Promise<void>;
  markProjectCooldown(
    projectId: string,
    durationMs: number,
    resetMessage?: string,
  ): Promise<void>;
  recordProjectError(
    projectId: string,
    statusCode: number,
    errorType: string,
  ): Promise<void>;
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
function buildRequestBody(
  options: ExecuteRequestOptions,
  projectId: string,
): GSwarmRequest {
  const inner: GSwarmRequestInner = {
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
    inner.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  // Add Google Search tool if enabled
  if (options.useGoogleSearch) {
    inner.tools = [{ googleSearch: {} }];
  }

  return {
    model: GSWARM_CONFIG.model,
    request: inner,
    project: projectId,
  };
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
 * Validate that the parsed response data has the expected GSwarmResponse shape.
 * Checks that either `candidates` or `error` is present.
 *
 * @param data - Parsed JSON data to validate
 * @returns true if the data looks like a valid GSwarmResponse
 */
function isValidGSwarmResponse(data: unknown): data is GSwarmResponse {
  if (data === null || typeof data !== "object") {
    return false;
  }
  const obj = data as Record<string, unknown>;
  // A valid response must have either `candidates` (success) or `error` (failure)
  return (
    Array.isArray(obj.candidates) ||
    (typeof obj.error === "object" && obj.error !== null)
  );
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
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    // Select project using LRU
    const selection = await lruSelector.selectProjectForRequest(
      options.callSource,
    );
    if (!selection) {
      throw new GSwarmProjectError("No projects available for selection", {
        errorType: "selection_failed",
      });
    }

    const { project, accessToken, email, healthScore } = selection;
    const projectId = project.project_id;
    const startTime = Date.now();

    try {
      consoleDebug(
        PREFIX.DEBUG,
        `[GSwarm] Attempt ${attempt}/${maxRetries} using project ${projectId} (account: ${email}, health: ${healthScore?.toFixed(3) ?? "N/A"})${options.callSource ? ` [${options.callSource}]` : ""}`,
      );

      // Build request with project context
      const requestBody = buildRequestBody(options, projectId);

      // Set up abort controller for request timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        // Make API request with timeout
        response = await fetchFn(ENDPOINT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (fetchError) {
        // Re-throw abort errors as timeout errors
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          throw new GSwarmNetworkError(
            `Request timed out after ${timeoutMs}ms for project ${projectId}`,
            { isRetryable: true, projectId },
          );
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }

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
        await lruSelector.recordProjectError(
          projectId,
          response.status,
          `HTTP_${response.status}`,
        );

        // Mark cooldown if specified
        if (errorResult.resetDuration) {
          await lruSelector.markProjectCooldown(
            projectId,
            errorResult.resetDuration,
            errorBody, // Pass error body for rate limit message parsing
          );
        }

        // Check if we should retry
        if (!errorResult.retry) {
          throw new GSwarmNetworkError(
            `Request failed with status ${response.status}: ${errorBody.slice(0, 200)}`,
            { isRetryable: false, projectId },
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

      // Parse successful response -- wrap in try-catch to handle malformed JSON
      let rawData: unknown;
      try {
        rawData = await response.json();
      } catch (parseError) {
        const rawText = await response.text().catch(() => "(unreadable)");
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Failed to parse JSON response from project ${projectId}: ${rawText.slice(0, 200)}`,
        );
        await lruSelector.recordProjectError(projectId, 0, "JSON_PARSE_ERROR");
        throw new GSwarmParseError(
          `Failed to parse API response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          { projectId, cause: parseError },
        );
      }

      // Validate response structure at runtime
      if (!isValidGSwarmResponse(rawData)) {
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Invalid response structure from project ${projectId}: missing 'candidates' and 'error' fields`,
        );
        await lruSelector.recordProjectError(
          projectId,
          0,
          "INVALID_RESPONSE_STRUCTURE",
        );
        throw new GSwarmParseError(
          "API response missing expected 'candidates' or 'error' field",
          { projectId },
        );
      }

      const responseData: GSwarmResponse = rawData;

      // Check for API-level errors
      if (responseData.error) {
        const errorMessage = responseData.error.message ?? "Unknown API error";
        await lruSelector.recordProjectError(
          projectId,
          responseData.error.code ?? 500,
          responseData.error.status ?? "API_ERROR",
        );
        throw new GSwarmNetworkError(`API error: ${errorMessage}`, {
          isRetryable: false,
          projectId,
        });
      }

      // Parse response parts
      const { text, thoughts } = parseResponse(responseData);

      // Record success
      await lruSelector.markProjectUsed(projectId);

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
      const latencyMs = Date.now() - startTime;

      // Timeout errors (GSwarmNetworkError with isRetryable) -- retryable
      if (
        error instanceof GSwarmNetworkError &&
        error.message.includes("timed out")
      ) {
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Request timeout for project ${projectId} (${latencyMs}ms)`,
        );
        await lruSelector.recordProjectError(projectId, 0, "TIMEOUT");
        await lruSelector.markProjectCooldown(projectId, 30000);

        lastError = error;

        const backoffDelay = baseDelay * 2 ** (attempt - 1);
        await sleep(Math.min(backoffDelay, 30000));
        continue;
      }

      // Network errors (TypeError from fetch) -- retryable
      if (error instanceof TypeError) {
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Network error for project ${projectId} (${latencyMs}ms): ${error.message}`,
        );
        await lruSelector.recordProjectError(projectId, 0, "NETWORK_ERROR");
        await lruSelector.markProjectCooldown(projectId, 30000);

        lastError = error;

        const backoffDelay = baseDelay * 2 ** (attempt - 1);
        await sleep(Math.min(backoffDelay, 30000));
        continue;
      }

      // Errors thrown by our own error handler (HTTP errors) -- already handled, retried via continue above.
      // If we reach here, the error was thrown by typed GSwarm errors in non-retry paths.
      // These are non-retryable (e.g., GSwarmProjectError, GSwarmNetworkError, GSwarmParseError).
      if (error instanceof Error) {
        // Log for visibility, then re-throw -- don't swallow structured errors
        consoleError(
          PREFIX.ERROR,
          `[GSwarm] Non-retryable error for project ${projectId}: ${error.message}`,
        );
        throw error;
      }

      // Unknown error type -- wrap and throw
      throw new GSwarmNetworkError(`Unexpected error: ${String(error)}`, {
        isRetryable: false,
        projectId,
        cause: error,
      });
    }
  }

  // All retries exhausted
  throw (
    lastError ??
    new GSwarmProjectError("Request failed after all retries", {
      errorType: "all_failed",
    })
  );
}
