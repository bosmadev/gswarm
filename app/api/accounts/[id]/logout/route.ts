/**
 * @file app/api/accounts/[id]/logout/route.ts
 * @description Admin API route for logging out an account.
 * Removes the OAuth token for the specified account.
 *
 * @route POST /api/accounts/[id]/logout
 */

import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import { validateAdminSession } from "@/lib/admin-session";
import {
  getDataPath,
  listFiles,
  readJsonFile,
} from "@/lib/gswarm/storage/base";

/** Token storage structure */
interface StoredToken {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
  lastUsed?: string;
}

/** Route params */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/accounts/[id]/logout
 * Remove OAuth token for the specified account
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Validate admin session
  const session = validateAdminSession(request);
  if (!session.valid) {
    return NextResponse.json(
      { error: "Unauthorized", message: session.error },
      { status: 401 },
    );
  }

  const { id: accountId } = await params;

  if (!accountId) {
    return NextResponse.json(
      { error: "Account ID is required" },
      { status: 400 },
    );
  }

  try {
    const tokensDir = getDataPath("oauth-tokens");
    const filesResult = await listFiles(tokensDir, ".json");

    if (!filesResult.success) {
      return NextResponse.json(
        { error: "Failed to access tokens storage" },
        { status: 500 },
      );
    }

    // Find the token file by matching the account ID
    for (const file of filesResult.data) {
      const filePath = `${tokensDir}/${file}`;
      const tokenResult = await readJsonFile<StoredToken>(filePath);

      if (tokenResult.success && tokenResult.data) {
        const token = tokenResult.data;
        const expectedAccountId = Buffer.from(token.email).toString("base64");

        if (expectedAccountId === accountId) {
          // Delete the token file
          await unlink(filePath);

          return NextResponse.json({
            success: true,
            message: `Account ${token.email} logged out successfully`,
          });
        }
      }
    }

    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to logout account",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
