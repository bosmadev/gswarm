/**
 * @file lib/gswarm/storage/facade.ts
 * @version 1.0
 * @description Barrel export for the GSwarm storage layer.
 *
 * Provides a single entry point for all storage operations. Consumers
 * should import from this facade instead of reaching into individual
 * storage modules, keeping layer boundaries clean.
 *
 * @example
 * ```ts
 * import { getProjectStatus, validateApiKey, getValidTokens } from "@/lib/gswarm/storage/facade";
 * ```
 */

// --- Schemas & helpers ---
export {
  GSwarmResponseSchema,
  OAuthErrorSchema,
  StoredTokenSchema,
  TokenResponseSchema,
  safeJsonParse,
  storageError,
  storageSuccess,
} from "../schemas";
// --- API Keys ---
export {
  checkRateLimit,
  createApiKey,
  deleteApiKey,
  deleteApiKeyByHash,
  generateApiKey,
  generateKeySalt,
  hashApiKey,
  loadApiKeys,
  revokeApiKey,
  validateApiKey,
  verifyApiKey,
} from "./api-keys";
// --- Base utilities ---
export {
  CacheManager,
  getDataPath,
  getTodayDateString,
  readJsonFile,
  writeJsonFile,
} from "./base";
// --- Config ---
export {
  clearConfigCache,
  getConfigSection,
  getDefaultConfig,
  loadConfig,
  resetConfig,
  updateConfig,
} from "./config";
// --- Errors ---
export {
  cleanupOldErrors,
  clearAllErrors,
  clearTodaysErrors,
  getErrorCountsByType,
  queryErrors,
  recordError,
} from "./errors";
// --- Metrics ---
export {
  cleanupOldMetrics,
  getAccountErrorRates,
  getAggregatedMetrics,
  loadMetrics,
  recordMetric,
} from "./metrics";
// --- Projects ---
export {
  clearProjectCooldown,
  createDefaultStatus,
  getAllProjectStatuses,
  getAllProjects,
  getAvailableProjects,
  getEnabledProjects,
  getProjectStatus,
  invalidateProjectCache,
  isProjectInCooldown,
  loadProjectStatuses,
  recordProjectError,
  recordProjectSuccess,
  saveProjectStatus,
  saveProjectStatuses,
  updateProjectStatus,
} from "./projects";
// --- Redis ---
export { shutdown as shutdownRedis } from "./redis";
// --- Tokens ---
export {
  deleteToken,
  getTokenExpiryTime,
  getTokensNeedingRefresh,
  getValidTokens,
  invalidateTokenCache,
  isTokenExpired,
  loadAllTokens,
  loadToken,
  markTokenInvalid,
  saveToken,
  updateTokenClient,
  updateTokenProjects,
} from "./tokens";
