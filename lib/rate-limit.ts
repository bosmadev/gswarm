/**
 * @file lib/rate-limit.ts
 * @description In-memory sliding window rate limiter for auth endpoints.
 *
 * Uses a simple Map-based counter that is atomic within a single Node.js process
 * (synchronous operations are serialized by the event loop). Not suitable for
 * multi-process deployments — use Redis or similar for those scenarios.
 *
 * @module lib/rate-limit
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// =============================================================================
// Types
// =============================================================================

interface SlidingWindowEntry {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window */
  maxAttempts: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

// =============================================================================
// RateLimiter Class
// =============================================================================

/**
 * In-memory sliding window rate limiter.
 *
 * Each key (typically an IP address) tracks a list of request timestamps.
 * Old entries outside the window are pruned on each check. This gives a true
 * sliding window rather than a fixed-window counter.
 */
export class RateLimiter {
  private store = new Map<string, SlidingWindowEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  /** Interval handle for periodic cleanup */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: RateLimiterOptions) {
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;

    // Periodic cleanup every 5 minutes to prevent unbounded memory growth
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Allow the process to exit without waiting for this interval
    if (this.cleanupInterval?.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if a request should be allowed and record it if so.
   *
   * @param key - Rate limit key (e.g., client IP)
   * @returns Object with `allowed` boolean, `remaining` count, and `retryAfterMs`
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let entry = this.store.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Prune timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= this.maxAttempts) {
      // Rate limit exceeded — calculate retry-after from oldest entry in window
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    }

    // Allow the request and record the timestamp
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: this.maxAttempts - entry.timestamps.length,
      retryAfterMs: 0,
    };
  }

  /**
   * Remove stale entries from the store to prevent memory leaks.
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// =============================================================================
// Pre-configured Limiters
// =============================================================================

/**
 * Rate limiter for authentication endpoints.
 * Allows 10 attempts per IP per 60-second window.
 */
export const authRateLimiter = new RateLimiter({
  maxAttempts: 10,
  windowMs: 60 * 1000,
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract client IP from a Next.js request.
 * Checks standard proxy headers before falling back.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-client-ip")?.trim() ||
    "unknown"
  );
}

/**
 * Applies auth rate limiting to a request. Returns a 429 response if the limit
 * is exceeded, or `null` if the request is allowed.
 */
export function checkAuthRateLimit(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request);
  const result = authRateLimiter.check(ip);

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    return NextResponse.json(
      {
        success: false,
        error: "Too many login attempts. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  return null;
}
