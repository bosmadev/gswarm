/**
 * GSwarm Storage - Centralized exports for storage modules
 */

// API Keys storage
export {
  API_KEYS_CACHE_TTL_MS,
  API_KEYS_FILE,
  type ApiKeysStore,
  type CreateApiKeyOptions,
  type RateLimitEntry,
  clearApiKeysCache,
  createApiKey,
  deleteApiKey,
  generateApiKey,
  hashApiKey,
  loadApiKeys,
  maskApiKey,
  revokeApiKey,
  validateApiKey,
} from "./api-keys";
// Base storage utilities
export {
  DATA_DIR,
  type FileStats,
  STORAGE_BASE_DIR,
  deleteFile,
  ensureDir,
  fileExists,
  getDataPath,
  getFileStats,
  getStoragePath,
  listFiles,
  readJsonFile,
  writeJsonFile,
} from "./base";
// Configuration storage
export {
  CONFIG_CACHE_TTL_MS,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  clearConfigCache,
  getConfigSection,
  getDefaultConfig,
  loadConfig,
  mergeWithDefaults,
  resetConfig,
  updateConfig,
} from "./config";
// Errors storage
export {
  type DailyErrorLog,
  ERRORS_CACHE_TTL_MS,
  ERRORS_DIR,
  type ErrorLogEntry,
  type ErrorLogType,
  type QueryErrorsOptions,
  type RecordErrorOptions,
  cleanupOldErrors,
  clearAllErrors,
  clearTodaysErrors,
  createEmptyDailyErrorLog,
  getErrorCountsByType,
  getErrorsPath,
  invalidateErrorsCache,
  loadErrorLog,
  queryErrors,
  recordError,
} from "./errors";
// Metrics storage
export {
  METRICS_CACHE_TTL_MS,
  METRICS_DIR,
  cleanupOldMetrics,
  createEmptyAggregated,
  createEmptyDailyMetrics,
  getAccountErrorRates,
  getAggregatedMetrics,
  getMetricsPath,
  getTodayDateString,
  loadMetrics,
  mergeAggregated,
  predictQuotaExhaustion,
  recordMetric,
  updateAggregated,
} from "./metrics";
// Projects storage
export {
  DEFAULT_COOLDOWN,
  PROJECT_CACHE_TTL_MS,
  PROJECT_STATUS_FILE,
  type ProjectStatusMap,
  clearAllProjectStatus,
  clearProjectCooldown,
  createDefaultStatus,
  getAllProjectStatuses,
  getAllProjects,
  getAvailableProjects,
  getEnabledProjects,
  getProjectStatus,
  getQuotaExhaustedProjects,
  invalidateProjectCache,
  isProjectInCooldown,
  loadProjectStatuses,
  recordProjectError,
  recordProjectSuccess,
  saveProjectStatus,
  saveProjectStatuses,
  updateProjectStatus,
} from "./projects";
