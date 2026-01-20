// API validation error detail (used by lib/api-validation.ts)
export interface ApiValidationError {
  field: string; // Field name
  message: string; // Error message
  received?: unknown; // Received value (optional)
}

// API validation result - generic type for request body validation
export type ApiValidationResult<T> =
  | { success: true; data: T; errors?: undefined }
  | { success: false; errors: ApiValidationError[]; data?: undefined };
