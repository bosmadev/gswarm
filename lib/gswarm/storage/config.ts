import type { GSwarmConfig, StorageResult } from "../types";
import { getDataPath, readJsonFile, writeJsonFile } from "./base";

// =============================================================================
// Constants
// =============================================================================

/**
 * Configuration file name
 */
export const CONFIG_FILE = "config.json";

/**
 * Cache TTL for configuration (5 minutes)
 */
export const CONFIG_CACHE_TTL_MS = 300000;

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
// Cache
// =============================================================================

interface ConfigCache {
  config: GSwarmConfig | null;
  timestamp: number;
}

const cache: ConfigCache = {
  config: null,
  timestamp: 0,
};

/**
 * Checks if the cache is valid
 */
function isCacheValid(): boolean {
  return (
    cache.config !== null && Date.now() - cache.timestamp < CONFIG_CACHE_TTL_MS
  );
}

/**
 * Updates the cache with new config
 */
function updateCache(config: GSwarmConfig): void {
  cache.config = config;
  cache.timestamp = Date.now();
}

/**
 * Invalidates the cache
 */
function invalidateCache(): void {
  cache.config = null;
  cache.timestamp = 0;
}

// =============================================================================
// Configuration Operations
// =============================================================================

/**
 * Gets the full path to the config file
 */
function getConfigPath(): string {
  return getDataPath(CONFIG_FILE);
}

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
 * Loads configuration from storage
 * Creates default configuration if it doesn't exist
 * @returns The loaded or created configuration
 */
export async function loadConfig(): Promise<StorageResult<GSwarmConfig>> {
  // Return cached config if valid
  if (isCacheValid() && cache.config) {
    return { success: true, data: cache.config };
  }

  const configPath = getConfigPath();
  const result = await readJsonFile<Partial<GSwarmConfig>>(configPath);

  if (!result.success) {
    if (result.error.startsWith("File not found")) {
      // Create default config
      const writeResult = await writeJsonFile(configPath, DEFAULT_CONFIG);
      if (!writeResult.success) {
        return { success: false, error: writeResult.error };
      }
      updateCache(DEFAULT_CONFIG);
      return { success: true, data: DEFAULT_CONFIG };
    }
    return { success: false, error: result.error };
  }

  // Merge loaded config with defaults to ensure all fields exist
  const mergedConfig = mergeWithDefaults(result.data, DEFAULT_CONFIG);
  updateCache(mergedConfig);

  return { success: true, data: mergedConfig };
}

/**
 * Updates configuration with partial updates
 * Merges updates with existing configuration
 * @param updates - Partial configuration updates
 * @returns The updated configuration
 */
export async function updateConfig(
  updates: Partial<GSwarmConfig>,
): Promise<StorageResult<GSwarmConfig>> {
  const loadResult = await loadConfig();
  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const updatedConfig = mergeWithDefaults(updates, loadResult.data);
  const configPath = getConfigPath();

  const writeResult = await writeJsonFile(configPath, updatedConfig);
  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

  updateCache(updatedConfig);
  return { success: true, data: updatedConfig };
}

/**
 * Resets configuration to defaults
 * @returns The default configuration
 */
export async function resetConfig(): Promise<StorageResult<GSwarmConfig>> {
  const configPath = getConfigPath();

  const writeResult = await writeJsonFile(configPath, DEFAULT_CONFIG);
  if (!writeResult.success) {
    return { success: false, error: writeResult.error };
  }

  updateCache(DEFAULT_CONFIG);
  return { success: true, data: DEFAULT_CONFIG };
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
 */
export function clearConfigCache(): void {
  invalidateCache();
}
