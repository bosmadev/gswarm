// GSwarm types for storage, metrics, and OAuth

/**
 * Generic storage result type for all storage operations
 */
export type StorageResult<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: string; data?: undefined };

/**
 * Request metric for tracking individual API requests
 */
export interface RequestMetric {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  account_id: string;
  project_id: string;
  duration_ms: number;
  status: "success" | "error";
  status_code?: number;
  error_type?: string;
  error_message?: string;
  tokens_used?: number;
  model?: string;
}

/**
 * Endpoint statistics
 */
export interface EndpointStats {
  total: number;
  successful: number;
  failed: number;
  avg_duration_ms: number;
  total_duration_ms: number;
}

/**
 * Account statistics
 */
export interface AccountStats {
  total: number;
  successful: number;
  failed: number;
  avg_duration_ms: number;
  total_duration_ms: number;
  error_types: Record<string, number>;
}

/**
 * Project statistics
 */
export interface ProjectStats {
  total: number;
  successful: number;
  failed: number;
  avg_duration_ms: number;
  total_duration_ms: number;
  tokens_used: number;
}

/**
 * Aggregated metrics for a time period
 */
export interface AggregatedMetrics {
  period_start: string;
  period_end: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_duration_ms: number;
  total_duration_ms: number;
  by_endpoint: Record<string, EndpointStats>;
  by_account: Record<string, AccountStats>;
  by_project: Record<string, ProjectStats>;
  error_breakdown: Record<string, number>;
}

/**
 * Daily metrics containing all requests and aggregated data
 */
export interface DailyMetrics {
  date: string;
  requests: RequestMetric[];
  aggregated: AggregatedMetrics;
  updated_at: string;
}

/**
 * Error rate information for an account
 */
export interface ErrorRateInfo {
  errorRate: number;
  total: number;
}

/**
 * Quota exhaustion prediction result
 */
export interface QuotaExhaustionPrediction {
  exhaustedAt?: string;
  remainingRequests: number;
}

// =============================================================================
// OAuth Types
// =============================================================================

/**
 * OAuth token data structure
 * Contains access token, refresh token, and expiry information
 */
export interface TokenData {
  /** OAuth access token for API requests */
  access_token: string;

  /** OAuth refresh token for obtaining new access tokens */
  refresh_token?: string;

  /** Token type (typically "Bearer") */
  token_type: string;

  /** Token expiry time in seconds from issuance */
  expires_in: number;

  /** Unix timestamp (seconds) when token expires */
  expiry_timestamp?: number;

  /** OAuth scope granted */
  scope?: string;

  /** ID token (JWT) containing user info */
  id_token?: string;
}

/**
 * Stored token with metadata
 * Extends TokenData with storage-related fields
 */
export interface StoredToken extends TokenData {
  /** Email address associated with this token */
  email: string;

  /** Unix timestamp (seconds) when token was created/saved */
  created_at: number;

  /** Whether this token is marked as invalid */
  is_invalid?: boolean;

  /** Error message if token was marked invalid */
  invalid_reason?: string;

  /** Unix timestamp (seconds) when token was marked invalid */
  invalid_at?: number;

  /** Last successful use timestamp */
  last_used_at?: number;
}

/**
 * Google userinfo API response
 */
export interface GoogleUserInfo {
  /** User's email address */
  email: string;

  /** Whether the email is verified */
  verified_email: boolean;

  /** User's Google ID */
  id?: string;

  /** User's display name */
  name?: string;

  /** URL to user's profile picture */
  picture?: string;
}

/**
 * OAuth error response from Google
 */
export interface OAuthError {
  /** Error code */
  error: string;

  /** Human-readable error description */
  error_description?: string;
}

// =============================================================================
// Project Types
// =============================================================================

/**
 * Error types for project status tracking
 */
export type ProjectErrorType =
  | "rate_limit"
  | "auth"
  | "server"
  | "not_logged_in"
  | "quota_exhausted"
  | "preview_disabled"
  | "billing_disabled";

/**
 * Project status including usage, cooldown, and error tracking information
 */
export interface ProjectStatus {
  /** Unique project identifier */
  projectId: string;

  /** Timestamp of last usage (ms since epoch) */
  lastUsedAt: number;

  /** Timestamp of last successful request (ms since epoch) */
  lastSuccessAt: number;

  /** Timestamp of last error (ms since epoch) */
  lastErrorAt: number;

  /** Total successful requests count */
  successCount: number;

  /** Total error count */
  errorCount: number;

  /** Count of consecutive errors (resets on success) */
  consecutiveErrors: number;

  /** Timestamp until which project is in cooldown (ms since epoch) */
  cooldownUntil: number;

  /** Type of the last error encountered */
  lastErrorType?: ProjectErrorType;

  /** Timestamp when quota will reset (parsed from 429 error, ms since epoch) */
  quotaResetTime?: number;

  /** Human-readable reset time (e.g., "21h10m20s") */
  quotaResetReason?: string;
}

/**
 * Statistics about project selection availability
 */
export interface ProjectSelectionStats {
  available: number;
  inCooldown: number;
  total: number;
}

/**
 * Call source for tracking request origins
 */
export type CallSource = "api" | "internal" | "scheduled" | "manual";

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Google Search configuration
 */
export interface GoogleSearchConfig {
  enabled: boolean;
  maxResults: number;
}

/**
 * Tools configuration
 */
export interface ToolsConfig {
  enabled: string[];
  disabled: string[];
}

/**
 * Generation configuration for AI models
 */
export interface GenerationConfig {
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  thinkingLevel: "none" | "low" | "medium" | "high";
  includeThoughts: boolean;
}

/**
 * System prompts configuration
 */
export interface SystemPromptsConfig {
  default: string;
  general: string;
  [key: string]: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
}

/**
 * Cooldown configuration for error handling
 */
export interface CooldownConfig {
  initialMs: number;
  maxMs: number;
  multiplier: number;
  consecutiveErrorThreshold: number;
}

/**
 * Quota management configuration
 */
export interface QuotaManagementConfig {
  trackingEnabled: boolean;
  warningThreshold: number;
}

/**
 * Complete GSwarm configuration
 */
export interface GSwarmConfig {
  googleSearch: GoogleSearchConfig;
  tools: ToolsConfig;
  generation: GenerationConfig;
  systemPrompts: SystemPromptsConfig;
  rateLimit: RateLimitConfig;
  cooldown: CooldownConfig;
  quotaManagement: QuotaManagementConfig;
}

// =============================================================================
// API Key Types
// =============================================================================

/**
 * API key configuration
 */
export interface ApiKeyConfig {
  /** SHA256 hash of the API key */
  key_hash: string;

  /** Human-readable name for the key */
  name: string;

  /** ISO timestamp when the key was created */
  created_at: string;

  /** ISO timestamp when the key expires (optional) */
  expires_at?: string;

  /** Whether the key is currently active */
  is_active: boolean;

  /** Rate limit in requests per minute (optional, 0 or undefined = unlimited) */
  rate_limit?: number;

  /** Allowed endpoint patterns (optional, empty means all allowed) */
  allowed_endpoints?: string[];

  /** Allowed IP addresses (optional, "*" or empty means all allowed) */
  allowed_ips?: string[];

  /** Additional metadata for the key */
  metadata?: Record<string, unknown>;
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  /** Whether the key is valid */
  valid: boolean;

  /** Hash of the validated key (if valid) */
  key_hash?: string;

  /** Name of the key (if valid) */
  name?: string;

  /** Error message (if invalid) */
  error?: string;

  /** Remaining requests in current rate limit window */
  rate_limit_remaining?: number;

  /** Unix timestamp when rate limit resets */
  rate_limit_reset?: number;
}

// =============================================================================
// GCP Project Discovery Types
// =============================================================================

/**
 * GCP Project information with API enablement status
 */
export interface GcpProjectInfo {
  /** GCP project ID (e.g., "my-project-123") */
  project_id: string;

  /** Human-readable project name */
  name: string;

  /** Project number (numeric identifier) */
  project_number: string;

  /** Whether the Cloud AI Companion API is enabled */
  api_enabled: boolean;

  /** Email of the owner/account associated with this project */
  owner_email: string;

  /** Token ID used to access this project */
  token_id?: string;
}

/**
 * GCP Resource Manager API response for listing projects
 */
export interface GcpProjectsResponse {
  projects?: GcpProject[];
  nextPageToken?: string;
}

/**
 * Individual project from GCP Resource Manager API
 */
export interface GcpProject {
  projectId: string;
  name: string;
  projectNumber: string;
  lifecycleState: string;
  createTime?: string;
  labels?: Record<string, string>;
  parent?: {
    type: string;
    id: string;
  };
}

/**
 * Service Usage API response for checking API enablement
 */
export interface ServiceUsageResponse {
  name?: string;
  state?: "STATE_UNSPECIFIED" | "DISABLED" | "ENABLED";
  config?: {
    name?: string;
    title?: string;
  };
}

// =============================================================================
// GSWARM STATUS TYPES
// =============================================================================

/**
 * GSwarm connection status
 * Source: pulsona/lib/gswarm.ts lines 363-369
 *
 * - connected: All projects available
 * - degraded-routed: Some 429'd but request succeeded on fallback
 * - degraded-capacity: Some projects unavailable, capacity reduced
 * - frozen: Account-wide cooldown active
 * - disconnected: All accounts exhausted
 * - quota_exhausted: Daily quota exceeded
 */
export type GSwarmStatus =
  | "connected"
  | "degraded-routed"
  | "degraded-capacity"
  | "frozen"
  | "disconnected"
  | "quota_exhausted";

/**
 * Per-account status tracking
 * Source: pulsona/lib/gswarm.ts lines 374-381
 */
export interface AccountStatus {
  email: string;
  status: GSwarmStatus;
  frozenUntil: number;
  totalProjects: number;
  failedProjects: number;
  rateLimitedProjects: string[];
}

// =============================================================================
// TOKEN REFRESH TYPES
// =============================================================================

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  success: boolean;
  email: string;
  new_expiry?: number;
  error?: string;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Generation configuration for Cloud Code API requests
 * Note: This is different from GenerationConfig which is for app-level config
 */
export interface ApiGenerationConfig {
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
  thinkingConfig?: {
    thinkingBudget: number;
  };
}

/**
 * Content part in API request/response
 */
export interface ContentPart {
  text?: string;
  thought?: boolean;
}

/**
 * GSwarm API request body format
 */
export interface GSwarmRequest {
  model: string;
  contents: Array<{
    role: string;
    parts: ContentPart[];
  }>;
  systemInstruction?: {
    parts: ContentPart[];
  };
  generationConfig: ApiGenerationConfig;
  tools?: Array<{
    googleSearch?: Record<string, unknown>;
  }>;
}

/**
 * GSwarm API response format
 */
export interface GSwarmResponse {
  candidates?: Array<{
    content?: {
      parts?: ContentPart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}
