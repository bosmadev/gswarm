/**
 * Comprehensive error handling system for GSwarm API
 *
 * Error code ranges:
 * - 1xxx: Authentication & Authorization
 * - 2xxx: Validation & Request Errors
 * - 3xxx: GSwarm/Gemini API Errors
 * - 5xxx: System & Server Errors
 */

/**
 * Error codes organized by category
 */
export enum ErrorCode {
  // ============================================================================
  // 1xxx: Authentication & Authorization
  // ============================================================================
  AUTH_MISSING_KEY = 1001,
  AUTH_INVALID_KEY = 1002,
  AUTH_KEY_DISABLED = 1003,
  AUTH_IP_NOT_ALLOWED = 1004,
  AUTH_ENDPOINT_NOT_ALLOWED = 1005,
  AUTH_RATE_LIMIT = 1006,
  AUTH_UNAUTHORIZED = 1401, // Maps to 401 HTTP
  AUTH_FORBIDDEN = 1403, // Maps to 403 HTTP

  // ============================================================================
  // 2xxx: Validation & Request Errors
  // ============================================================================
  VALIDATION_MISSING_FIELD = 2001,
  VALIDATION_INVALID_TYPE = 2002,
  VALIDATION_OUT_OF_RANGE = 2003,
  VALIDATION_EMPTY_VALUE = 2004,
  VALIDATION_INVALID_FORMAT = 2005,
  VALIDATION_MALFORMED_JSON = 2006,
  VALIDATION_MESSAGES_EMPTY = 2007,
  VALIDATION_MESSAGE_INVALID = 2008,
  VALIDATION_PROMPT_EMPTY = 2009,
  VALIDATION_STREAMING_UNSUPPORTED = 2010,

  // ============================================================================
  // 3xxx: GSwarm/Gemini API Errors
  // ============================================================================
  GSWARM_BAD_REQUEST = 3400, // Gemini 400
  GSWARM_UNAUTHORIZED = 3401, // Gemini 401
  GSWARM_FORBIDDEN = 3403, // Gemini 403
  GSWARM_NOT_FOUND = 3404, // Gemini 404 (model/preview)
  GSWARM_RATE_LIMIT = 3429, // Gemini 429
  GSWARM_INTERNAL_ERROR = 3500, // Gemini 500
  GSWARM_SERVICE_UNAVAILABLE = 3503, // Gemini 503
  GSWARM_GENERATION_FAILED = 3000,
  GSWARM_NO_PROJECTS = 3001,
  GSWARM_ALL_PROJECTS_FAILED = 3002,
  GSWARM_INVALID_RESPONSE = 3003,
  GSWARM_PREVIEW_REQUIRED = 3405, // Preview channel required

  // ============================================================================
  // 5xxx: System & Server Errors
  // ============================================================================
  SYSTEM_INTERNAL_ERROR = 5000,
  SYSTEM_DATABASE_ERROR = 5001,
  SYSTEM_STORAGE_ERROR = 5002,
  SYSTEM_NETWORK_ERROR = 5003,
  SYSTEM_TIMEOUT = 5004,
  SYSTEM_UNKNOWN = 5999,
}

/**
 * Maps error codes to HTTP status codes
 */
export const ERROR_CODE_TO_HTTP_STATUS: Record<ErrorCode, number> = {
  // Auth errors -> 401/403
  [ErrorCode.AUTH_MISSING_KEY]: 401,
  [ErrorCode.AUTH_INVALID_KEY]: 401,
  [ErrorCode.AUTH_KEY_DISABLED]: 403,
  [ErrorCode.AUTH_IP_NOT_ALLOWED]: 403,
  [ErrorCode.AUTH_ENDPOINT_NOT_ALLOWED]: 403,
  [ErrorCode.AUTH_RATE_LIMIT]: 429,
  [ErrorCode.AUTH_UNAUTHORIZED]: 401,
  [ErrorCode.AUTH_FORBIDDEN]: 403,

  // Validation errors -> 400
  [ErrorCode.VALIDATION_MISSING_FIELD]: 400,
  [ErrorCode.VALIDATION_INVALID_TYPE]: 400,
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: 400,
  [ErrorCode.VALIDATION_EMPTY_VALUE]: 400,
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 400,
  [ErrorCode.VALIDATION_MALFORMED_JSON]: 400,
  [ErrorCode.VALIDATION_MESSAGES_EMPTY]: 400,
  [ErrorCode.VALIDATION_MESSAGE_INVALID]: 400,
  [ErrorCode.VALIDATION_PROMPT_EMPTY]: 400,
  [ErrorCode.VALIDATION_STREAMING_UNSUPPORTED]: 400,

  // GSwarm/Gemini errors -> various
  [ErrorCode.GSWARM_BAD_REQUEST]: 400,
  [ErrorCode.GSWARM_UNAUTHORIZED]: 502,
  [ErrorCode.GSWARM_FORBIDDEN]: 502,
  [ErrorCode.GSWARM_NOT_FOUND]: 502,
  [ErrorCode.GSWARM_RATE_LIMIT]: 429,
  [ErrorCode.GSWARM_INTERNAL_ERROR]: 502,
  [ErrorCode.GSWARM_SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GSWARM_GENERATION_FAILED]: 500,
  [ErrorCode.GSWARM_NO_PROJECTS]: 500,
  [ErrorCode.GSWARM_ALL_PROJECTS_FAILED]: 500,
  [ErrorCode.GSWARM_INVALID_RESPONSE]: 502,
  [ErrorCode.GSWARM_PREVIEW_REQUIRED]: 502,

  // System errors -> 500
  [ErrorCode.SYSTEM_INTERNAL_ERROR]: 500,
  [ErrorCode.SYSTEM_DATABASE_ERROR]: 500,
  [ErrorCode.SYSTEM_STORAGE_ERROR]: 500,
  [ErrorCode.SYSTEM_NETWORK_ERROR]: 500,
  [ErrorCode.SYSTEM_TIMEOUT]: 504,
  [ErrorCode.SYSTEM_UNKNOWN]: 500,
};

/**
 * Human-readable error names
 */
export const ERROR_NAMES: Record<ErrorCode, string> = {
  // Auth
  [ErrorCode.AUTH_MISSING_KEY]: "Missing API Key",
  [ErrorCode.AUTH_INVALID_KEY]: "Invalid API Key",
  [ErrorCode.AUTH_KEY_DISABLED]: "API Key Disabled",
  [ErrorCode.AUTH_IP_NOT_ALLOWED]: "IP Address Not Allowed",
  [ErrorCode.AUTH_ENDPOINT_NOT_ALLOWED]: "Endpoint Not Allowed",
  [ErrorCode.AUTH_RATE_LIMIT]: "Rate Limit Exceeded",
  [ErrorCode.AUTH_UNAUTHORIZED]: "Unauthorized",
  [ErrorCode.AUTH_FORBIDDEN]: "Forbidden",

  // Validation
  [ErrorCode.VALIDATION_MISSING_FIELD]: "Missing Required Field",
  [ErrorCode.VALIDATION_INVALID_TYPE]: "Invalid Field Type",
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: "Value Out of Range",
  [ErrorCode.VALIDATION_EMPTY_VALUE]: "Empty Value",
  [ErrorCode.VALIDATION_INVALID_FORMAT]: "Invalid Format",
  [ErrorCode.VALIDATION_MALFORMED_JSON]: "Malformed JSON",
  [ErrorCode.VALIDATION_MESSAGES_EMPTY]: "Messages Array Empty",
  [ErrorCode.VALIDATION_MESSAGE_INVALID]: "Invalid Message Structure",
  [ErrorCode.VALIDATION_PROMPT_EMPTY]: "Prompt Empty",
  [ErrorCode.VALIDATION_STREAMING_UNSUPPORTED]: "Streaming Not Supported",

  // GSwarm
  [ErrorCode.GSWARM_BAD_REQUEST]: "GSwarm Bad Request",
  [ErrorCode.GSWARM_UNAUTHORIZED]: "GSwarm Unauthorized",
  [ErrorCode.GSWARM_FORBIDDEN]: "GSwarm Forbidden",
  [ErrorCode.GSWARM_NOT_FOUND]: "Model Not Found",
  [ErrorCode.GSWARM_RATE_LIMIT]: "GSwarm Rate Limit",
  [ErrorCode.GSWARM_INTERNAL_ERROR]: "GSwarm Internal Error",
  [ErrorCode.GSWARM_SERVICE_UNAVAILABLE]: "GSwarm Service Unavailable",
  [ErrorCode.GSWARM_GENERATION_FAILED]: "Generation Failed",
  [ErrorCode.GSWARM_NO_PROJECTS]: "No GSwarm Projects Available",
  [ErrorCode.GSWARM_ALL_PROJECTS_FAILED]: "All GSwarm Projects Failed",
  [ErrorCode.GSWARM_INVALID_RESPONSE]: "Invalid GSwarm Response",
  [ErrorCode.GSWARM_PREVIEW_REQUIRED]: "Preview Channel Required",

  // System
  [ErrorCode.SYSTEM_INTERNAL_ERROR]: "Internal Server Error",
  [ErrorCode.SYSTEM_DATABASE_ERROR]: "Database Error",
  [ErrorCode.SYSTEM_STORAGE_ERROR]: "Storage Error",
  [ErrorCode.SYSTEM_NETWORK_ERROR]: "Network Error",
  [ErrorCode.SYSTEM_TIMEOUT]: "Request Timeout",
  [ErrorCode.SYSTEM_UNKNOWN]: "Unknown Error",
};

/**
 * Custom API error class with structured error information
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly isOperational: boolean;
  readonly details?: Record<string, unknown>;
  readonly timestamp: number;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = ERROR_CODE_TO_HTTP_STATUS[code];
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = Date.now();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON response format
   */
  toJSON() {
    return {
      error: ERROR_NAMES[this.code] || "Unknown Error",
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }

  /**
   * Factory: Missing API key
   */
  static missingApiKey() {
    return new ApiError(
      ErrorCode.AUTH_MISSING_KEY,
      "Missing API key in Authorization header",
    );
  }

  /**
   * Factory: Invalid API key
   */
  static invalidApiKey(reason?: string) {
    return new ApiError(
      ErrorCode.AUTH_INVALID_KEY,
      reason || "Invalid API key",
    );
  }

  /**
   * Factory: API key disabled
   */
  static keyDisabled(keyName?: string) {
    return new ApiError(
      ErrorCode.AUTH_KEY_DISABLED,
      `API key ${keyName ? `'${keyName}' ` : ""}is disabled`,
    );
  }

  /**
   * Factory: IP not allowed
   */
  static ipNotAllowed(ip: string) {
    return new ApiError(
      ErrorCode.AUTH_IP_NOT_ALLOWED,
      `IP address ${ip} is not allowed for this API key`,
      { ip },
    );
  }

  /**
   * Factory: Endpoint not allowed
   */
  static endpointNotAllowed(endpoint: string) {
    return new ApiError(
      ErrorCode.AUTH_ENDPOINT_NOT_ALLOWED,
      `Endpoint ${endpoint} is not allowed for this API key`,
      { endpoint },
    );
  }

  /**
   * Factory: Rate limit exceeded
   */
  static rateLimit(resetTimestamp?: number, remaining = 0) {
    return new ApiError(ErrorCode.AUTH_RATE_LIMIT, "Rate limit exceeded", {
      rateLimitRemaining: remaining,
      rateLimitReset: resetTimestamp,
      retryAfter: resetTimestamp
        ? Math.max(1, resetTimestamp - Math.floor(Date.now() / 1000))
        : undefined,
    });
  }

  /**
   * Factory: Validation error - missing field
   */
  static missingField(field: string) {
    return new ApiError(
      ErrorCode.VALIDATION_MISSING_FIELD,
      `Missing required field: ${field}`,
      { field },
    );
  }

  /**
   * Factory: Validation error - invalid type
   */
  static invalidType(field: string, expected: string, received: string) {
    return new ApiError(
      ErrorCode.VALIDATION_INVALID_TYPE,
      `Field '${field}' must be ${expected}, received ${received}`,
      { field, expected, received },
    );
  }

  /**
   * Factory: Validation error - out of range
   */
  static outOfRange(field: string, min?: number, max?: number, value?: number) {
    return new ApiError(
      ErrorCode.VALIDATION_OUT_OF_RANGE,
      `Field '${field}' is out of range (min: ${min}, max: ${max}, received: ${value})`,
      { field, min, max, value },
    );
  }

  /**
   * Factory: Validation error - empty value
   */
  static emptyValue(field: string) {
    return new ApiError(
      ErrorCode.VALIDATION_EMPTY_VALUE,
      `Field '${field}' cannot be empty`,
      { field },
    );
  }

  /**
   * Factory: Streaming not supported
   */
  static streamingUnsupported() {
    return new ApiError(
      ErrorCode.VALIDATION_STREAMING_UNSUPPORTED,
      "Streaming not supported. Set stream: false for non-streaming responses",
    );
  }

  /**
   * Factory: Messages array empty
   */
  static messagesEmpty() {
    return new ApiError(
      ErrorCode.VALIDATION_MESSAGES_EMPTY,
      "Messages array cannot be empty",
    );
  }

  /**
   * Factory: Invalid message structure
   */
  static invalidMessage(reason: string) {
    return new ApiError(
      ErrorCode.VALIDATION_MESSAGE_INVALID,
      `Invalid message structure: ${reason}`,
    );
  }

  /**
   * Factory: Empty prompt
   */
  static emptyPrompt() {
    return new ApiError(
      ErrorCode.VALIDATION_PROMPT_EMPTY,
      "Prompt cannot be empty",
    );
  }

  /**
   * Factory: GSwarm generation failed
   */
  static gswarmGenerationFailed(
    reason: string,
    details?: Record<string, unknown>,
  ) {
    return new ApiError(
      ErrorCode.GSWARM_GENERATION_FAILED,
      `Generation failed: ${reason}`,
      details,
    );
  }

  /**
   * Factory: GSwarm bad request (400)
   */
  static gswarmBadRequest(errorBody?: string) {
    return new ApiError(
      ErrorCode.GSWARM_BAD_REQUEST,
      "GSwarm API rejected the request",
      { errorBody },
    );
  }

  /**
   * Factory: GSwarm unauthorized (401)
   */
  static gswarmUnauthorized(projectId: string) {
    return new ApiError(
      ErrorCode.GSWARM_UNAUTHORIZED,
      "GSwarm authentication failed",
      { projectId },
    );
  }

  /**
   * Factory: GSwarm forbidden (403)
   */
  static gswarmForbidden(projectId: string) {
    return new ApiError(
      ErrorCode.GSWARM_FORBIDDEN,
      "GSwarm permission denied",
      { projectId },
    );
  }

  /**
   * Factory: GSwarm not found (404)
   */
  static gswarmNotFound(projectId: string, needsPreview = false) {
    return new ApiError(
      ErrorCode.GSWARM_NOT_FOUND,
      needsPreview
        ? "Model not found. Preview channel may need to be enabled"
        : "Model or resource not found",
      { projectId, needsPreview },
    );
  }

  /**
   * Factory: GSwarm rate limit (429)
   */
  static gswarmRateLimit(projectId: string, resetDuration?: string) {
    return new ApiError(
      ErrorCode.GSWARM_RATE_LIMIT,
      "GSwarm rate limit exceeded",
      { projectId, resetDuration },
    );
  }

  /**
   * Factory: GSwarm internal error (500)
   */
  static gswarmInternalError(projectId: string) {
    return new ApiError(
      ErrorCode.GSWARM_INTERNAL_ERROR,
      "GSwarm internal server error",
      { projectId },
    );
  }

  /**
   * Factory: GSwarm service unavailable (503)
   */
  static gswarmServiceUnavailable(projectId: string) {
    return new ApiError(
      ErrorCode.GSWARM_SERVICE_UNAVAILABLE,
      "GSwarm service temporarily unavailable",
      { projectId },
    );
  }

  /**
   * Factory: No GSwarm projects
   */
  static noProjects() {
    return new ApiError(
      ErrorCode.GSWARM_NO_PROJECTS,
      "No GSwarm projects available",
    );
  }

  /**
   * Factory: All GSwarm projects failed
   */
  static allProjectsFailed() {
    return new ApiError(
      ErrorCode.GSWARM_ALL_PROJECTS_FAILED,
      "All GSwarm projects failed to generate content",
    );
  }

  /**
   * Factory: System internal error
   */
  static internalError(message?: string, details?: Record<string, unknown>) {
    return new ApiError(
      ErrorCode.SYSTEM_INTERNAL_ERROR,
      message || "Internal server error",
      details,
      false, // Not operational - unexpected error
    );
  }

  /**
   * Factory: Database error
   */
  static databaseError(message: string) {
    return new ApiError(
      ErrorCode.SYSTEM_DATABASE_ERROR,
      message,
      undefined,
      false,
    );
  }

  /**
   * Factory: Unknown error
   */
  static unknown(message: string) {
    return new ApiError(ErrorCode.SYSTEM_UNKNOWN, message, undefined, false);
  }
}
