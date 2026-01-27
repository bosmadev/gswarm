/**
 * @file app/api/api-keys/route.ts
 * @description Admin API route for managing API keys.
 * Provides endpoints to list and create API keys.
 *
 * @route GET /api/api-keys - List all API keys (sanitized)
 * @route POST /api/api-keys - Create new API key
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  type CreateApiKeyOptions,
  createApiKey,
  loadApiKeys,
  maskApiKey,
} from "@/lib/gswarm/storage/api-keys";
import type { ApiKeyConfig } from "@/lib/gswarm/types";

/** Sanitized API key for response (no raw key) */
interface SanitizedApiKey {
  key_hash: string;
  name: string;
  created_at: string;
  expires_at?: string;
  is_active: boolean;
  rate_limit?: number;
  allowed_endpoints?: string[];
  allowed_ips?: string[];
  metadata?: Record<string, unknown>;
}

/** Request body for creating a new API key */
interface CreateApiKeyRequest {
  name: string;
  expires_at?: string;
  rate_limit?: number;
  allowed_endpoints?: string[];
  allowed_ips?: string[];
  metadata?: Record<string, unknown>;
}

/** Response for creating a new API key (includes raw key) */
interface CreateApiKeyResponse {
  key_hash: string;
  name: string;
  created_at: string;
  expires_at?: string;
  is_active: boolean;
  rate_limit?: number;
  allowed_endpoints?: string[];
  allowed_ips?: string[];
  metadata?: Record<string, unknown>;
  raw_key: string;
  masked_key: string;
}

/**
 * Sanitizes an API key config by removing sensitive data
 */
function sanitizeApiKey(key: ApiKeyConfig): SanitizedApiKey {
  return {
    key_hash: key.key_hash,
    name: key.name,
    created_at: key.created_at,
    expires_at: key.expires_at,
    is_active: key.is_active,
    rate_limit: key.rate_limit,
    allowed_endpoints: key.allowed_endpoints,
    allowed_ips: key.allowed_ips,
    metadata: key.metadata,
  };
}

/**
 * GET /api/api-keys
 * List all API keys with sanitized information
 */
export async function GET(request: NextRequest) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  try {
    const result = await loadApiKeys();

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to load API keys", message: result.error },
        { status: 500 },
      );
    }

    // Sanitize all keys
    const sanitizedKeys = result.data.map(sanitizeApiKey);

    return NextResponse.json({ keys: sanitizedKeys });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load API keys",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/api-keys
 * Create a new API key
 */
export async function POST(request: NextRequest) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as CreateApiKeyRequest;

    // Validate required fields
    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Name is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Validate optional fields
    if (body.expires_at !== undefined) {
      const expiresAt = new Date(body.expires_at);
      if (Number.isNaN(expiresAt.getTime())) {
        return NextResponse.json(
          { error: "Invalid expires_at date format" },
          { status: 400 },
        );
      }
      if (expiresAt <= new Date()) {
        return NextResponse.json(
          { error: "expires_at must be in the future" },
          { status: 400 },
        );
      }
    }

    if (body.rate_limit !== undefined) {
      if (
        typeof body.rate_limit !== "number" ||
        body.rate_limit <= 0 ||
        !Number.isInteger(body.rate_limit)
      ) {
        return NextResponse.json(
          { error: "rate_limit must be a positive integer" },
          { status: 400 },
        );
      }
    }

    if (body.allowed_endpoints !== undefined) {
      if (
        !Array.isArray(body.allowed_endpoints) ||
        !body.allowed_endpoints.every((e) => typeof e === "string")
      ) {
        return NextResponse.json(
          { error: "allowed_endpoints must be an array of strings" },
          { status: 400 },
        );
      }
    }

    if (body.allowed_ips !== undefined) {
      if (
        !Array.isArray(body.allowed_ips) ||
        !body.allowed_ips.every((ip) => typeof ip === "string")
      ) {
        return NextResponse.json(
          { error: "allowed_ips must be an array of strings" },
          { status: 400 },
        );
      }
    }

    // Create API key options
    const options: CreateApiKeyOptions = {
      expires_at: body.expires_at,
      rate_limit: body.rate_limit,
      allowed_endpoints: body.allowed_endpoints,
      allowed_ips: body.allowed_ips,
      metadata: body.metadata,
    };

    // Create the API key
    const result = await createApiKey(body.name.trim(), options);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to create API key", message: result.error },
        { status: 500 },
      );
    }

    // Return the created key with raw key (only time it's available)
    const response: CreateApiKeyResponse = {
      key_hash: result.data.key_hash,
      name: result.data.name,
      created_at: result.data.created_at,
      expires_at: result.data.expires_at,
      is_active: result.data.is_active,
      rate_limit: result.data.rate_limit,
      allowed_endpoints: result.data.allowed_endpoints,
      allowed_ips: result.data.allowed_ips,
      metadata: result.data.metadata,
      raw_key: result.data.raw_key,
      masked_key: maskApiKey(result.data.raw_key),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create API key",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
