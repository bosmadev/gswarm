/**
 * GSwarm Module
 *
 * Main entry point for the GSwarm AI backend service
 */

export type {
  GSwarmStatusResponse,
  GenerateOptions,
  GenerateResult,
} from "./client";
// Re-export client and singleton
export { GSwarmClient, gswarmClient } from "./client";
export {
  errorResponse,
  errorResponseFromError,
  geminiStatusToApiError,
} from "./error-handler";
// Re-export error handling
export { ApiError, ErrorCode } from "./errors";
export type {
  ExecuteRequestOptions,
  ExecuteRequestResult,
  GSwarmRequest,
  GSwarmResponse,
  GenerationConfig,
} from "./executor";
// Re-export executor for direct API access
export {
  ENDPOINT_URL,
  GSWARM_CONFIG,
  executeRequest,
} from "./executor";
// Re-export LRU selector
export {
  clearSelectionCache,
  getProjectSelectionDetails,
  getProjectSelectionStats,
  markProjectUsed,
  selectProject,
  selectProjectForRequest,
} from "./lru-selector";
// Re-export OAuth functions
export {
  OAUTH_CONFIG,
  exchangeCodeForTokens,
  generateAuthUrl,
  getTokenEmailFromData,
  isTokenExpired,
  refreshAccessToken,
  revokeToken,
} from "./oauth";
// Re-export project management
export {
  clearProjectCooldown,
  getAllProjectStatuses,
  getEnabledGcpProjects,
  getProjectCooldownUntil,
  getProjectStatus,
  isProjectInCooldown,
  setProjectCooldown,
} from "./projects";
// Re-export storage functions
export * from "./storage";
// Re-export types
export type {
  AggregatedMetrics,
  ApiKeyConfig,
  ApiKeyValidationResult,
  CallSource,
  CooldownConfig,
  DailyMetrics,
  ErrorRateInfo,
  GSwarmConfig,
  GcpProject,
  GcpProjectInfo,
  GcpProjectsResponse,
  GenerationConfig as ConfigGenerationConfig,
  GoogleSearchConfig,
  GoogleUserInfo,
  OAuthError,
  ProjectInfo,
  ProjectSelectionResult,
  ProjectSelectionStats,
  ProjectStatus,
  QuotaExhaustionPrediction,
  QuotaManagementConfig,
  RateLimitConfig,
  RequestMetric,
  ServiceUsageResponse,
  StorageResult,
  StoredToken,
  SystemPromptsConfig,
  TokenData,
  ToolsConfig,
} from "./types";
