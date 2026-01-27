import { type NextRequest, NextResponse } from "next/server";
import { parseAndValidate } from "@/lib/api-validation";
import { PREFIX, consoleError, consoleWarn } from "@/lib/console";
import { revokeToken as revokeOAuthToken } from "@/lib/gswarm/oauth";
import { validateAdminSession } from "@/lib/gswarm/session";
import { deleteToken, loadToken } from "@/lib/gswarm/storage/tokens";

interface LogoutRequestBody extends Record<string, unknown> {
  email: string;
  revokeToken?: boolean;
}

/**
 * POST /api/auth/logout
 * Removes a Google account and optionally revokes the token
 * Requires admin session
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin session
    const session = await validateAdminSession(request);
    if (!session.valid) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin session required" },
        { status: 401 },
      );
    }

    // Parse and validate request body
    const validation = await parseAndValidate<LogoutRequestBody>(request, {
      required: ["email"],
      types: {
        email: "string",
        revokeToken: "boolean",
      },
    });

    if (!validation.success) {
      return validation.response;
    }

    const { email, revokeToken } = validation.data;

    // Optionally revoke token with Google before deletion
    if (revokeToken) {
      try {
        const tokenResult = await loadToken(email);
        if (tokenResult.success && tokenResult.data.access_token) {
          await revokeOAuthToken(tokenResult.data.access_token);
        }
      } catch (revokeError) {
        // Log but don't fail the request if revocation fails
        // The token will still be deleted from local storage
        consoleWarn(
          PREFIX.API,
          "Failed to revoke token with Google:",
          revokeError,
        );
      }
    }

    // Delete token from storage
    await deleteToken(email);

    return NextResponse.json({
      success: true,
      message: `Account ${email} has been removed`,
    });
  } catch (error) {
    consoleError(PREFIX.API, "Error removing account:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
