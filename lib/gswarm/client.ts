/**
 * @file lib/gswarm/client.ts
 * @version 1.0
 * @description High-level GSwarm client for AI content generation.
 *
 * Provides simplified methods for text generation, structured data extraction,
 * and service status checking. Uses an LRU selector adapter to manage
 * project rotation and token lifecycle.
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import { GSwarmParseError, GSwarmProjectError } from "./errors";
import {
  type ExecuteRequestOptions,
  GSWARM_CONFIG,
  type LruSelector,
  executeRequest,
  extractJsonFromResponse,
} from "./executor";
import {
  type GcpProjectSelectionResult,
  getProjectSelectionStats as defaultGetProjectSelectionStats,
  markProjectUsed as defaultMarkProjectUsed,
  selectProjectForRequest as defaultSelectProjectForRequest,
} from "./lru-selector";
import {
  recordProjectError as defaultRecordProjectError,
  updateProjectStatus as defaultUpdateProjectStatus,
} from "./storage/projects";
import { getValidTokens as defaultGetValidTokens } from "./storage/tokens";
import type {
  AccountStatus,
  CallSource,
  GSwarmStatus,
  ProjectErrorType,
  ProjectSelectionStats,
  ProjectStatus,
  StorageResult,
  StoredToken,
} from "./types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Interface for the LRU selector adapter returned by createLruSelectorAdapter.
 * Extends executor.ts LruSelector for use with executeRequest(),
 * and adds client-level methods (selectProject, recordSuccess, recordError).
 */
interface LruSelectorAdapter extends LruSelector {
  selectProject(): Promise<
    StorageResult<{ projectId: string; accessToken: string; email?: string }>
  >;
  recordSuccess(projectId: string, latencyMs: number): Promise<void>;
  recordError(
    projectId: string,
    statusCode: number,
    errorType: string,
  ): Promise<void>;
}

/**
 * Injectable dependencies for the LRU selector adapter.
 *
 * Defaults to the real implementations when not provided.
 * Pass overrides in tests to avoid hitting real storage.
 */
export interface LruSelectorDeps {
  getValidTokens: () => Promise<StorageResult<StoredToken[]>>;
  markProjectUsed: (projectId: string) => Promise<void>;
  recordProjectError: (
    projectId: string,
    errorType: ProjectErrorType,
    quotaResetTime?: number,
  ) => Promise<StorageResult<ProjectStatus>>;
  updateProjectStatus: (
    projectId: string,
    updates: Partial<ProjectStatus>,
  ) => Promise<StorageResult<ProjectStatus>>;
  selectProjectForRequest: (
    callSource?: CallSource,
  ) => Promise<GcpProjectSelectionResult | null>;
  getProjectSelectionStats: () => Promise<ProjectSelectionStats>;
}

/** Default dependency implementations backed by real storage */
const defaultDeps: LruSelectorDeps = {
  getValidTokens: defaultGetValidTokens,
  markProjectUsed: defaultMarkProjectUsed,
  recordProjectError: defaultRecordProjectError,
  updateProjectStatus: defaultUpdateProjectStatus,
  selectProjectForRequest: defaultSelectProjectForRequest,
  getProjectSelectionStats: defaultGetProjectSelectionStats,
};

/**
 * Options for generating content
 */
export interface GenerateOptions {
  /** System instruction/prompt */
  systemInstruction?: string;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Enable Google Search tool */
  useGoogleSearch?: boolean;
  /** Response MIME type */
  responseMimeType?: string;
  /** JSON schema for structured output */
  responseJsonSchema?: Record<string, unknown>;
  /** Call source for tracking */
  callSource?: string;
}

/**
 * Result of content generation
 */
export interface GenerateResult {
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
 * GSwarm status response
 */
export interface GSwarmStatusResponse {
  /** Overall status */
  status: GSwarmStatus;
  /** Whether the service is available */
  available: boolean;
  /** Current model being used */
  model: string;
  /** Number of available projects */
  availableProjects: number;
  /** Number of projects in cooldown */
  cooldownProjects: number;
  /** Total number of projects */
  totalProjects: number;
  /** Per-account status (if available) */
  accounts?: AccountStatus[];
  /** Timestamp of status check */
  timestamp: number;
}

// =============================================================================
// LRU SELECTOR ADAPTER
// =============================================================================

/**
 * Creates an LruSelector adapter that uses the database-backed lru-selector.ts
 *
 * This adapter bridges the LruSelector interface expected by executeRequest
 * with the well-factored functions from lru-selector.ts.
 *
 * @param deps - Optional dependency overrides for testing. Defaults to real implementations.
 */
async function createLruSelectorAdapter(
  deps: LruSelectorDeps = defaultDeps,
): Promise<LruSelectorAdapter> {
  // Pre-load tokens map for fast lookup
  let tokensMap: Map<string, string> = new Map();
  let lastRefreshAt = 0;

  /** Token cache TTL — refresh every 30 minutes to catch expired tokens */
  const TOKEN_CACHE_TTL_MS = 30 * 60 * 1000;

  async function refreshTokens(): Promise<void> {
    try {
      const tokensResult = await deps.getValidTokens();
      if (tokensResult.success) {
        // Atomic swap: build new map first, then replace.
        // Prevents empty-map window if iteration were to throw.
        const newMap = new Map<string, string>();
        for (const token of tokensResult.data) {
          newMap.set(token.email, token.access_token);
        }
        tokensMap = newMap;
        lastRefreshAt = Date.now();
        consoleDebug(
          PREFIX.DEBUG,
          `[LruSelector] Refreshed ${tokensMap.size} tokens`,
        );
      } else {
        // Preserve existing tokens on failure — stale tokens are better than none
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Token refresh returned failure (keeping ${tokensMap.size} cached tokens): ${tokensResult.error}`,
        );
      }
    } catch (err) {
      // Preserve existing tokens on exception — stale tokens are better than none
      consoleError(
        PREFIX.ERROR,
        `[LruSelector] Token refresh threw (keeping ${tokensMap.size} cached tokens): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Check if tokens need refreshing (empty or stale) */
  function isTokenCacheStale(): boolean {
    return (
      tokensMap.size === 0 || Date.now() - lastRefreshAt > TOKEN_CACHE_TTL_MS
    );
  }

  // Initial token load
  await refreshTokens();

  return {
    async selectProject(): Promise<
      StorageResult<{ projectId: string; accessToken: string; email?: string }>
    > {
      // Refresh tokens if map is empty or stale (may have expired)
      if (isTokenCacheStale()) {
        await refreshTokens();
      }

      const selection = await deps.selectProjectForRequest();

      if (!selection) {
        return { success: false, error: "No available projects" };
      }

      const { project } = selection;
      const accessToken = tokensMap.get(project.owner_email);

      if (!accessToken) {
        // Token not found, try refreshing
        await refreshTokens();
        const refreshedToken = tokensMap.get(project.owner_email);

        if (!refreshedToken) {
          return {
            success: false,
            error: `No valid token for project ${project.project_id} (owner: ${project.owner_email})`,
          };
        }

        return {
          success: true,
          data: {
            projectId: project.project_id,
            accessToken: refreshedToken,
            email: project.owner_email,
          },
        };
      }

      return {
        success: true,
        data: {
          projectId: project.project_id,
          accessToken,
          email: project.owner_email,
        },
      };
    },

    async recordSuccess(projectId: string, _latencyMs: number): Promise<void> {
      // Await to ensure project state is consistent for subsequent selections
      try {
        await deps.markProjectUsed(projectId);
      } catch (err) {
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to record project success: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async recordError(
      projectId: string,
      _statusCode: number,
      _errorType: string,
    ): Promise<void> {
      try {
        await deps.recordProjectError(projectId, "server");
      } catch (err) {
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to record project error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async markProjectCooldown(
      projectId: string,
      durationMs: number,
      _resetMessage?: string,
    ): Promise<void> {
      try {
        await deps.updateProjectStatus(projectId, {
          cooldownUntil: Date.now() + durationMs,
        });
      } catch (err) {
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to mark project cooldown: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    // LruSelector interface methods (for executeRequest compatibility)
    async selectProjectForRequest(callSource?: CallSource) {
      if (isTokenCacheStale()) {
        await refreshTokens();
      }
      const selection = await deps.selectProjectForRequest(callSource);
      if (!selection) return null;
      // Inject cached access token
      const cachedToken = tokensMap.get(selection.project.owner_email);
      if (cachedToken) {
        return { ...selection, accessToken: cachedToken };
      }
      return selection;
    },

    async markProjectUsed(projectId: string): Promise<void> {
      try {
        await deps.markProjectUsed(projectId);
      } catch (err) {
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to mark project used: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async recordProjectError(
      projectId: string,
      _statusCode: number,
      _errorType: string,
    ): Promise<void> {
      try {
        await deps.recordProjectError(projectId, "server");
      } catch (err) {
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to record project error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

// =============================================================================
// GSWARM CLIENT CLASS
// =============================================================================

/**
 * GSwarm Client for AI content generation
 *
 * Provides a high-level interface for:
 * - Text generation with configurable parameters
 * - Structured data generation with JSON schemas
 * - Service status and availability checks
 */
export class GSwarmClient {
  private lruSelector: LruSelectorAdapter | null = null;
  private initialized = false;
  private model: string;
  private deps: LruSelectorDeps;

  constructor(deps: LruSelectorDeps = defaultDeps) {
    this.model = GSWARM_CONFIG.model;
    this.deps = deps;
  }

  /**
   * Initialize the client (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized || !this.lruSelector) {
      this.lruSelector = await createLruSelectorAdapter(this.deps);
      this.initialized = true;
    }
  }

  /**
   * Get the LRU selector (initializes if needed)
   */
  private async getLruSelector(): Promise<LruSelectorAdapter> {
    await this.ensureInitialized();
    if (!this.lruSelector) {
      throw new GSwarmProjectError("LruSelector not initialized", {
        errorType: "selection_failed",
      });
    }
    return this.lruSelector;
  }

  /**
   * Test the connection to the GSwarm API
   *
   * @returns true if connection is successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      const selector = await this.getLruSelector();
      const result = await selector.selectProject();
      return result.success;
    } catch (error) {
      consoleError(
        PREFIX.ERROR,
        `[GSwarmClient] Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Generate content using the GSwarm API.
   *
   * Selects a project via LRU rotation, sends the prompt, and returns
   * the generated text with usage metadata.
   *
   * @param prompt - The user prompt
   * @param options - Generation options (system prompt, tokens, temperature, etc.)
   * @returns Generation result with text, project ID, latency, and token usage
   * @throws {GSwarmProjectError} When no projects are available
   * @throws {ApiError} When the upstream API returns an error
   *
   * @example
   * ```ts
   * const result = await gswarmClient.generateContent("Explain quantum computing", {
   *   maxOutputTokens: 1024,
   *   temperature: 0.7,
   *   callSource: "api-generate",
   * });
   * console.log(result.text);
   * ```
   */
  async generateContent(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const selector = await this.getLruSelector();

    consoleDebug(
      PREFIX.DEBUG,
      `[GSwarmClient] Generating content${options.callSource ? ` (${options.callSource})` : ""}`,
    );

    const executeOptions: ExecuteRequestOptions = {
      prompt,
      systemInstruction: options.systemInstruction,
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
      useGoogleSearch: options.useGoogleSearch,
      responseMimeType: options.responseMimeType,
      responseJsonSchema: options.responseJsonSchema,
      callSource: options.callSource,
    };

    const result = await executeRequest(executeOptions, selector);

    return {
      text: result.text,
      thoughts: result.thoughts,
      projectId: result.projectId,
      latencyMs: result.latencyMs,
      usage: result.usage,
    };
  }

  /**
   * Generate structured data using a JSON schema.
   *
   * Sends a prompt with `responseMimeType: "application/json"` and parses
   * the response as JSON. An optional validation callback provides runtime
   * type safety.
   *
   * @param prompt - The user prompt
   * @param schema - JSON schema for the expected output
   * @param options - Additional generation options
   * @param validate - Optional validation callback (e.g., Zod `.parse()`)
   * @returns Parsed and optionally validated JSON data
   * @throws {GSwarmParseError} When the response cannot be parsed as JSON
   *
   * @example
   * ```ts
   * interface Summary { title: string; points: string[] }
   * const data = await gswarmClient.generateStructuredData<Summary>(
   *   "Summarize this article",
   *   { type: "object", properties: { title: { type: "string" }, points: { type: "array" } } },
   *   { callSource: "api-structured" },
   * );
   * console.log(data.title);
   * ```
   */
  async generateStructuredData<T>(
    prompt: string,
    schema: Record<string, unknown>,
    options: Omit<
      GenerateOptions,
      "responseMimeType" | "responseJsonSchema"
    > = {},
    validate?: (data: unknown) => T,
  ): Promise<T> {
    const result = await this.generateContent(prompt, {
      ...options,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    });

    // Extract and parse JSON from response
    const jsonText = extractJsonFromResponse(result.text);

    try {
      const parsed: unknown = JSON.parse(jsonText);

      // When a validate callback is provided, use it for runtime type safety.
      // Otherwise the caller is responsible for ensuring the parsed data
      // conforms to T (the `as T` cast is unchecked).
      if (validate) {
        return validate(parsed);
      }
      return parsed as T;
    } catch (error) {
      consoleError(
        PREFIX.ERROR,
        `[GSwarmClient] Failed to parse structured data: ${error instanceof Error ? error.message : String(error)}`,
      );
      // SECURITY: Truncate response text to avoid leaking sensitive data in error messages
      throw new GSwarmParseError(
        `Failed to parse JSON response (${jsonText.length} chars, parse error: ${error instanceof Error ? error.message : "unknown"})`,
        { rawLength: jsonText.length, cause: error },
      );
    }
  }

  /**
   * Get the current model being used
   *
   * @returns Model identifier
   */
  getCurrentModel(): string {
    return this.model;
  }

  /**
   * Check if the service is available
   *
   * @returns true if at least one project is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const stats = await this.deps.getProjectSelectionStats();
      return stats.available > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed status information
   *
   * @returns Status response with project availability
   */
  async getStatus(): Promise<GSwarmStatusResponse> {
    const stats = await this.deps.getProjectSelectionStats();

    const availableCount = stats.available;
    const cooldownCount = stats.inCooldown;
    const totalCount = stats.total;

    // Determine overall status
    let status: GSwarmStatus;
    if (totalCount === 0) {
      status = "disconnected";
    } else if (availableCount === 0) {
      status = cooldownCount > 0 ? "frozen" : "disconnected";
    } else if (cooldownCount > 0) {
      status = "degraded-capacity";
    } else {
      status = "connected";
    }

    consoleLog(
      PREFIX.INFO,
      `[GSwarmClient] Status: ${status} (${availableCount}/${totalCount} available)`,
    );

    return {
      status,
      available: availableCount > 0,
      model: this.model,
      availableProjects: availableCount,
      cooldownProjects: cooldownCount,
      totalProjects: totalCount,
      timestamp: Date.now(),
    };
  }

  /**
   * Force re-initialization of the client
   * Useful after adding new projects or tokens
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    this.lruSelector = null;
    await this.ensureInitialized();
    consoleLog(PREFIX.INFO, "[GSwarmClient] Client refreshed");
  }
}

// =============================================================================
// FACTORY & SINGLETON EXPORTS
// =============================================================================

/**
 * Create a new GSwarmClient instance.
 *
 * Use this factory in tests or when you need isolated client instances
 * with custom dependency overrides.
 *
 * @param deps - Optional dependency overrides (defaults to real implementations)
 * @returns A fresh GSwarmClient instance
 */
export function createGSwarmClient(deps?: LruSelectorDeps): GSwarmClient {
  return new GSwarmClient(deps);
}

/**
 * Singleton GSwarm client instance
 *
 * For production use. Prefer `createGSwarmClient()` in tests.
 */
export const gswarmClient = new GSwarmClient();
