/**
 * @file app/api/dashboard/errors/route.ts
 * @description API route for fetching and managing error logs.
 * Supports filtering by type, account, and project, with date range queries.
 *
 * @module app/api/dashboard/errors
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import { PREFIX, consoleError } from "@/lib/console";
import {
  type ErrorLogType,
  clearAllErrors,
  queryErrors,
} from "@/lib/gswarm/storage";

// =============================================================================
// GET HANDLER
// =============================================================================

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
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type") as ErrorLogType | "all" | null;
    const accountIdFilter = searchParams.get("accountId");
    const projectIdFilter = searchParams.get("projectId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limitParam = searchParams.get("limit");

    // Query errors from storage
    const result = await queryErrors({
      type: typeFilter || "all",
      accountId: accountIdFilter || "all",
      projectId: projectIdFilter || "all",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: limitParam ? Number.parseInt(limitParam, 10) : 100,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to fetch error logs", details: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      errors: result.data,
      total: result.data.length,
    });
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      "[API] GET /api/dashboard/errors failed:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Failed to fetch error logs" },
      { status: 500 },
    );
  }
}

// =============================================================================
// DELETE HANDLER (Clear all errors)
// =============================================================================

export async function DELETE(request: NextRequest) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  try {
    const result = await clearAllErrors();

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to clear error logs", details: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "All errors have been cleared",
      filesDeleted: result.data,
    });
  } catch (error) {
    consoleError(
      PREFIX.ERROR,
      "[API] DELETE /api/dashboard/errors failed:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Failed to clear error logs" },
      { status: 500 },
    );
  }
}
