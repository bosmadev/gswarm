import { type NextRequest, NextResponse } from "next/server";
import {
  CYAN,
  GREEN,
  PREFIX,
  RESET,
  YELLOW,
  consoleDebug,
} from "./lib/console";

export function middleware(request: NextRequest) {
  const { method, nextUrl } = request;
  const path = nextUrl.pathname;

  // Color-code by method
  const methodColor =
    method === "GET" ? CYAN : method === "POST" ? GREEN : YELLOW;
  const methodStr = `${methodColor}${method.padEnd(4)}${RESET}`;

  // Log request (only outputs when DEBUG=true)
  consoleDebug(PREFIX.REQUEST_API, `${methodStr} ${path}`);

  return NextResponse.next();
}

// Match API routes and pages, exclude static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
