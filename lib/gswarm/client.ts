/**
 * GSwarm Client
 *
 * High-level client for interacting with the GSwarm API.
 * Provides simplified methods for content generation and status checking.
 */

import { PREFIX, consoleDebug, consoleError, consoleLog } from "@/lib/console";
import {
  type ExecuteRequestOptions,
  GSWARM_CONFIG,
  type LruSelector,
  executeRequest,
  extractJsonFromResponse,
} from "./executor";
import {
  getProjectSelectionStats,
  markProjectUsed,
  selectProjectForRequest,
} from "./lru-selector";
import { recordProjectError, updateProjectStatus } from "./storage/projects";
import { getValidTokens } from "./storage/tokens";
import type { AccountStatus, GSwarmStatus, StorageResult } from "./types";

// =============================================================================
// TYPES
// =============================================================================

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
 * with the well-factored functions from lru-selector.ts
 */
async function createLruSelectorAdapter(): Promise<LruSelector> {
  // Pre-load tokens map for fast lookup
  let tokensMap: Map<string, string> = new Map();

  async function refreshTokens(): Promise<void> {
    const tokensResult = await getValidTokens();
    if (tokensResult.success) {
      tokensMap = new Map();
      for (const token of tokensResult.data) {
        tokensMap.set(token.email, token.access_token);
      }
    }
  }

  // Initial token load
  await refreshTokens();

  return {
    async selectProject(): Promise<
      StorageResult<{ projectId: string; accessToken: string; email?: string }>
    > {
      // Refresh tokens if map is empty (may have expired)
      if (tokensMap.size === 0) {
        await refreshTokens();
      }

      const selection = await selectProjectForRequest();

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
      // Use markProjectUsed from lru-selector.ts which updates lastUsedAt and successCount
      markProjectUsed(projectId).catch((err) =>
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to record project success: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    },

    async recordError(
      projectId: string,
      _statusCode: number,
      _errorType: string,
    ): Promise<void> {
      // Fire-and-forget: non-blocking storage write
      recordProjectError(projectId, "server").catch((err) =>
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to record project error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    },

    async markProjectCooldown(
      projectId: string,
      durationMs: number,
    ): Promise<void> {
      // Update cooldownUntil in project status storage
      updateProjectStatus(projectId, {
        cooldownUntil: Date.now() + durationMs,
      }).catch((err) =>
        consoleError(
          PREFIX.ERROR,
          `[LruSelector] Failed to mark project cooldown: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
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
  private lruSelector: LruSelector | null = null;
  private initialized = false;
  private model: string;

  constructor() {
    this.model = GSWARM_CONFIG.model;
  }

  /**
   * Initialize the client (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized || !this.lruSelector) {
      this.lruSelector = await createLruSelectorAdapter();
      this.initialized = true;
    }
  }

  /**
   * Get the LRU selector (initializes if needed)
   */
  private async getLruSelector(): Promise<LruSelector> {
    await this.ensureInitialized();
    return this.lruSelector as LruSelector;
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
   * Generate content using the GSwarm API
   *
   * @param prompt - The user prompt
   * @param options - Generation options
   * @returns Generation result
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
   * Generate structured data using a JSON schema
   *
   * @param prompt - The user prompt
   * @param schema - JSON schema for the expected output
   * @param options - Additional generation options
   * @returns Parsed JSON data
   */
  async generateStructuredData<T>(
    prompt: string,
    schema: Record<string, unknown>,
    options: Omit<
      GenerateOptions,
      "responseMimeType" | "responseJsonSchema"
    > = {},
  ): Promise<T> {
    const result = await this.generateContent(prompt, {
      ...options,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    });

    // Extract and parse JSON from response
    const jsonText = extractJsonFromResponse(result.text);

    try {
      return JSON.parse(jsonText) as T;
    } catch (error) {
      consoleError(
        PREFIX.ERROR,
        `[GSwarmClient] Failed to parse structured data: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to parse JSON response: ${result.text.slice(0, 200)}`,
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
      const stats = await getProjectSelectionStats();
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
    const stats = await getProjectSelectionStats();

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
// SINGLETON EXPORT
// =============================================================================

/**
 * Singleton GSwarm client instance
 */
export const gswarmClient = new GSwarmClient();
