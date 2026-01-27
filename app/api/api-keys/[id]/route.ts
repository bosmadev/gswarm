/**
 * @file app/api/api-keys/[id]/route.ts
 * @description Admin API route for managing individual API keys.
 * Provides endpoint to delete API keys by their hash.
 *
 * @route DELETE /api/api-keys/[id] - Delete API key by hash
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { deleteApiKeyByHash } from "@/lib/gswarm/storage/api-keys";

/** Route params */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/api-keys/[id]
 * Delete an API key by its hash
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  const { id: keyHash } = await params;

  if (!keyHash) {
    return NextResponse.json(
      { error: "Key hash is required" },
      { status: 400 },
    );
  }

  try {
    // Delete the API key by its hash
    const result = await deleteApiKeyByHash(keyHash);

    if (!result.success) {
      // Check if it's a "not found" error
      if (result.error === "API key not found") {
        return NextResponse.json(
          { error: "API key not found", message: result.error },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "Failed to delete API key", message: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "API key deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete API key",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
