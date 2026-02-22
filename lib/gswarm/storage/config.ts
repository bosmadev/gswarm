/**
 * @file lib/gswarm/storage/config.ts
 * @version 1.0
 * @description GSwarm configuration storage with deep merge support.
 *
 * Manages the GSwarm configuration file including generation parameters,
 * rate limits, cooldown settings, and system prompts. All operations use
 * in-memory caching with a configurable TTL.
 */

import type { GSwarmConfig, StorageResult } from "../types";
import { getRedisClient } from "./redis";

// =============================================================================
// Constants
// =============================================================================

/**
 * Redis key for configuration storage
 */
export const CONFIG_KEY = "config";

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: GSwarmConfig = {
  googleSearch: {
    enabled: true,
    maxResults: 10,
  },
  tools: {
    enabled: [],
    disabled: [],
  },
  generation: {
    maxTokens: 8192,
    temperature: 0.3,
    topP: 0.95,
    topK: 64,
    thinkingLevel: "high",
    includeThoughts: false,
  },
  systemPrompts: {
    default: "You are a helpful AI assistant.",
    general: "You are a helpful AI assistant for general tasks.",
  },
  rateLimit: {
    requestsPerMinute: 60,
    burstLimit: 10,
  },
  cooldown: {
    initialMs: 60000,
    maxMs: 3600000,
    multiplier: 2,
    consecutiveErrorThreshold: 3,
  },
  quotaManagement: {
    trackingEnabled: true,
    warningThreshold: 0.8,
  },
};

// =============================================================================
// Configuration Operations
// =============================================================================

/**
 * Type guard to check if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Deep merges configuration with defaults
 * @param config - Partial configuration to merge
 * @param defaults - Default values to use for missing fields
 * @returns Merged configuration
 */
export function mergeWithDefaults<T>(config: Partial<T>, defaults: T): T {
  if (!isPlainObject(defaults)) {
    return (config ?? defaults) as T;
  }

  const result = { ...defaults } as Record<string, unknown>;
  const configObj = config as Record<string, unknown>;
  const defaultsObj = defaults as Record<string, unknown>;

  for (const key of Object.keys(configObj)) {
    const configValue = configObj[key];
    const defaultValue = defaultsObj[key];

    if (configValue === undefined) {
      continue;
    }

    if (isPlainObject(configValue) && isPlainObject(defaultValue)) {
      // Deep merge objects
      result[key] = mergeWithDefaults(configValue, defaultValue);
    } else {
      // Direct assignment for primitives and arrays
      result[key] = configValue;
    }
  }

  return result as T;
}

/**
 * Loads configuration from Redis storage.
 * Creates and persists the default configuration if it doesn't exist.
 * Missing fields are merged with defaults to ensure all keys are present.
 *
 * @returns The loaded or created configuration
 *
 * @example
 * ```ts
 * const result = await loadConfig();
 * if (result.success) {
 *   console.log("Max tokens:", result.data.generation.maxTokens);
 * }
 * ```
 */
export async function loadConfig(): Promise<StorageResult<GSwarmConfig>> {
  try {
    const redis = getRedisClient();
    const data = await redis.get(CONFIG_KEY);

    if (!data) {
      // Create default config in Redis
      await redis.set(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
      return { success: true, data: DEFAULT_CONFIG };
    }

    // Parse and merge with defaults to ensure all fields exist
    let parsedConfig: Partial<GSwarmConfig>;
    try {
      parsedConfig = JSON.parse(data);
    } catch {
      return {
        success: false,
        error: "Failed to parse stored config: invalid JSON",
      };
    }
    const mergedConfig = mergeWithDefaults(parsedConfig, DEFAULT_CONFIG);

    return { success: true, data: mergedConfig };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return { success: false, error: `Failed to load config: ${errorMessage}` };
  }
}

/**
 * Updates configuration with partial updates.
 * Deep-merges updates with existing configuration.
 *
 * @param updates - Partial configuration updates to apply
 * @returns The fully merged updated configuration
 *
 * @example
 * ```ts
 * const result = await updateConfig({
 *   generation: { maxTokens: 16384, temperature: 0.7 },
 * });
 * if (result.success) {
 *   console.log("Updated max tokens:", result.data.generation.maxTokens);
 * }
 * ```
 */
export async function updateConfig(
  updates: Partial<GSwarmConfig>,
): Promise<StorageResult<GSwarmConfig>> {
  try {
    const loadResult = await loadConfig();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const updatedConfig = mergeWithDefaults(updates, loadResult.data);
    const redis = getRedisClient();
    await redis.set(CONFIG_KEY, JSON.stringify(updatedConfig));

    return { success: true, data: updatedConfig };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to update config: ${errorMessage}`,
    };
  }
}

/**
 * Resets configuration to defaults
 * @returns The default configuration
 */
export async function resetConfig(): Promise<StorageResult<GSwarmConfig>> {
  try {
    const redis = getRedisClient();
    await redis.set(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
    return { success: true, data: DEFAULT_CONFIG };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Redis error";
    return {
      success: false,
      error: `Failed to reset config: ${errorMessage}`,
    };
  }
}

/**
 * Gets a specific section of the configuration
 * @param section - The configuration section to retrieve
 * @returns The requested configuration section
 */
export async function getConfigSection<K extends keyof GSwarmConfig>(
  section: K,
): Promise<StorageResult<GSwarmConfig[K]>> {
  const loadResult = await loadConfig();
  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  return { success: true, data: loadResult.data[section] };
}

/**
 * Gets the default configuration
 * @returns A copy of the default configuration
 */
export function getDefaultConfig(): GSwarmConfig {
  return structuredClone(DEFAULT_CONFIG);
}

/**
 * Clears the configuration cache
 * Useful for testing or forcing a reload
 * Note: With Redis, this is a no-op since Redis is the source of truth
 */
export function clearConfigCache(): void {
  // No-op: Redis is the cache, no in-memory cache to clear
}
