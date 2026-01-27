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
import { getEnabledGcpProjects } from "./projects";
import { recordProjectError, recordProjectSuccess } from "./storage/projects";
import { getValidTokens } from "./storage/tokens";
import type { AccountStatus, GSwarmStatus, GcpProjectInfo } from "./types";

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
// LRU SELECTOR IMPLEMENTATION
// =============================================================================

/**
 * Simple LRU selector that works with GCP projects and tokens
 */
class SimpleLruSelector implements LruSelector {
  private projects: GcpProjectInfo[] = [];
  private tokens: Map<string, string> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private cooldowns: Map<string, number> = new Map();

  async initialize(): Promise<void> {
    // Get enabled projects
    this.projects = await getEnabledGcpProjects();

    // Get valid tokens
    const tokensResult = await getValidTokens();
    if (tokensResult.success) {
      for (const token of tokensResult.data) {
        this.tokens.set(token.email, token.access_token);
      }
    }
  }

  async selectProject(): Promise<
    | {
        success: true;
        data: { projectId: string; accessToken: string };
      }
    | { success: false; error: string }
  > {
    // Ensure we have projects and tokens
    if (this.projects.length === 0 || this.tokens.size === 0) {
      await this.initialize();
    }

    const now = Date.now();

    // Filter out projects in cooldown
    const availableProjects = this.projects.filter((p) => {
      const cooldownUntil = this.cooldowns.get(p.project_id) ?? 0;
      return now >= cooldownUntil;
    });

    if (availableProjects.length === 0) {
      // If all in cooldown, pick the one with soonest expiring cooldown
      if (this.projects.length > 0) {
        const sorted = [...this.projects].sort((a, b) => {
          const cooldownA = this.cooldowns.get(a.project_id) ?? 0;
          const cooldownB = this.cooldowns.get(b.project_id) ?? 0;
          return cooldownA - cooldownB;
        });
        const project = sorted[0];
        const token = this.tokens.get(project.owner_email);
        if (token) {
          return {
            success: true,
            data: { projectId: project.project_id, accessToken: token },
          };
        }
      }
      return { success: false, error: "No available projects" };
    }

    // Sort by last used (LRU)
    const sorted = availableProjects.sort((a, b) => {
      const usedA = this.lastUsed.get(a.project_id) ?? 0;
      const usedB = this.lastUsed.get(b.project_id) ?? 0;
      return usedA - usedB;
    });

    const project = sorted[0];
    const token = this.tokens.get(project.owner_email);

    if (!token) {
      return {
        success: false,
        error: `No token for project ${project.project_id}`,
      };
    }

    return {
      success: true,
      data: { projectId: project.project_id, accessToken: token },
    };
  }

  async recordSuccess(projectId: string, _latencyMs: number): Promise<void> {
    this.lastUsed.set(projectId, Date.now());
    this.cooldowns.delete(projectId);
    // Fire-and-forget: non-blocking storage write
    recordProjectSuccess(projectId).catch((err) =>
      consoleError(
        PREFIX.ERROR,
        `[LruSelector] Failed to record project success: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

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
  }

  async markProjectCooldown(
    projectId: string,
    durationMs: number,
  ): Promise<void> {
    this.cooldowns.set(projectId, Date.now() + durationMs);
  }

  getAvailableCount(): number {
    const now = Date.now();
    return this.projects.filter((p) => {
      const cooldownUntil = this.cooldowns.get(p.project_id) ?? 0;
      return now >= cooldownUntil;
    }).length;
  }

  getCooldownCount(): number {
    const now = Date.now();
    return this.projects.filter((p) => {
      const cooldownUntil = this.cooldowns.get(p.project_id) ?? 0;
      return now < cooldownUntil;
    }).length;
  }

  getTotalCount(): number {
    return this.projects.length;
  }
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
  private lruSelector: SimpleLruSelector;
  private initialized = false;
  private model: string;

  constructor() {
    this.lruSelector = new SimpleLruSelector();
    this.model = GSWARM_CONFIG.model;
  }

  /**
   * Initialize the client (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.lruSelector.initialize();
      this.initialized = true;
    }
  }

  /**
   * Test the connection to the GSwarm API
   *
   * @returns true if connection is successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const result = await this.lruSelector.selectProject();
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
    await this.ensureInitialized();

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

    const result = await executeRequest(executeOptions, this.lruSelector);

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
      await this.ensureInitialized();
      return this.lruSelector.getAvailableCount() > 0;
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
    await this.ensureInitialized();

    const availableCount = this.lruSelector.getAvailableCount();
    const cooldownCount = this.lruSelector.getCooldownCount();
    const totalCount = this.lruSelector.getTotalCount();

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
