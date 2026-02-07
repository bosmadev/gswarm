/**
 * @file lib/gswarm/schemas.ts
 * @version 1.0
 * @description Zod runtime validation schemas for GSwarm API responses and storage helpers.
 *
 * Provides:
 * - Runtime validation schemas for external API responses (GSwarm, OAuth, tokens)
 * - Type-safe factory helpers for StorageResult creation
 * - JSON parse wrapper with schema validation
 */

import { z } from "zod";
import type { StorageResult } from "./types";

// =============================================================================
// Storage Result Helpers
// =============================================================================

/**
 * Creates a successful StorageResult with typed data.
 * Eliminates manual `{ success: true, data: ... }` boilerplate.
 *
 * @example
 * ```ts
 * return storageSuccess(projects);
 * // instead of: return { success: true, data: projects };
 * ```
 */
export function storageSuccess<T>(data: T): StorageResult<T> {
  return { success: true, data };
}

/**
 * Creates a failed StorageResult with an error message.
 * Eliminates manual `{ success: false, error: ... }` boilerplate.
 *
 * @example
 * ```ts
 * return storageError("Project not found");
 * // instead of: return { success: false, error: "Project not found" };
 * ```
 */
export function storageError<T = never>(error: string): StorageResult<T> {
  return { success: false, error };
}

// =============================================================================
// GSwarm API Response Schemas
// =============================================================================

/** Token usage metadata from Gemini API response */
export const UsageMetadataSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
  thoughtsTokenCount: z.number().optional(),
});

/** Single content part from Gemini API response */
export const ContentPartSchema = z.object({
  text: z.string().optional(),
});

/** Candidate response from Gemini API */
export const CandidateSchema = z.object({
  content: z
    .object({
      parts: z.array(ContentPartSchema).optional(),
      role: z.string().optional(),
    })
    .optional(),
  finishReason: z.string().optional(),
  groundingMetadata: z.record(z.string(), z.unknown()).optional(),
});

/** Full Gemini API generateContent response */
export const GSwarmResponseSchema = z.object({
  candidates: z.array(CandidateSchema).optional(),
  usageMetadata: UsageMetadataSchema.optional(),
  modelVersion: z.string().optional(),
});

export type GSwarmResponse = z.infer<typeof GSwarmResponseSchema>;

// =============================================================================
// OAuth & Token Schemas
// =============================================================================

/** OAuth error response from Google */
export const OAuthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export type OAuthError = z.infer<typeof OAuthErrorSchema>;

/** OAuth token response from Google */
export const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

/** Stored token data for database persistence */
export const StoredTokenSchema = z.object({
  email: z.string().email(),
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  scopes: z.array(z.string()).optional(),
});

export type StoredTokenData = z.infer<typeof StoredTokenSchema>;

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Safely parses JSON and validates against a Zod schema.
 * Returns a StorageResult instead of throwing.
 *
 * @param raw - Raw JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns StorageResult with validated data or error message
 *
 * @example
 * ```ts
 * const result = safeJsonParse(responseBody, GSwarmResponseSchema);
 * if (result.success) {
 *   const response = result.data; // fully typed
 * }
 * ```
 */
export function safeJsonParse<T>(
  raw: string,
  schema: z.ZodType<T>,
): StorageResult<T> {
  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = schema.parse(parsed);
    return storageSuccess(validated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return storageError(`Validation failed: ${issues}`);
    }
    if (err instanceof SyntaxError) {
      return storageError(`Invalid JSON: ${err.message}`);
    }
    return storageError(
      `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
