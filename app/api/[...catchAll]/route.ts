/**
 * @file app/api/[...catchAll]/route.ts
 * @description Catch-all route handler for unmatched API paths.
 * Returns a JSON 404 response instead of the default Next.js HTML 404 page.
 *
 * @module app/api/catchAll
 */

import { NextResponse } from "next/server";

/**
 * CORS headers for cross-origin API access
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

/**
 * Creates a JSON 404 response for unmatched API routes
 */
function notFoundResponse() {
  return NextResponse.json(
    {
      error: "Not found",
      message: "The requested API endpoint does not exist",
    },
    { status: 404, headers: CORS_HEADERS },
  );
}

/** GET handler */
export function GET() {
  return notFoundResponse();
}

/** POST handler */
export function POST() {
  return notFoundResponse();
}

/** PUT handler */
export function PUT() {
  return notFoundResponse();
}

/** DELETE handler */
export function DELETE() {
  return notFoundResponse();
}

/** PATCH handler */
export function PATCH() {
  return notFoundResponse();
}

/** OPTIONS handler for CORS preflight */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
