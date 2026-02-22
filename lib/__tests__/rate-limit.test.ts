/**
 * @file lib/__tests__/rate-limit.test.ts
 * @description Tests for RateLimiter sliding window implementation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "@/lib/rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60_000 });
  });

  describe("within limit", () => {
    it("allows requests under the limit", () => {
      const r1 = limiter.check("ip-1");
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.check("ip-1");
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check("ip-1");
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it("tracks different keys independently", () => {
      limiter.check("ip-a");
      limiter.check("ip-a");
      limiter.check("ip-a");

      const r = limiter.check("ip-b");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
    });
  });

  describe("exceeding limit", () => {
    it("blocks request when max attempts exceeded", () => {
      limiter.check("ip-2");
      limiter.check("ip-2");
      limiter.check("ip-2");

      const blocked = limiter.check("ip-2");
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("returns a positive retryAfterMs when blocked", () => {
      limiter.check("ip-3");
      limiter.check("ip-3");
      limiter.check("ip-3");

      const blocked = limiter.check("ip-3");
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe("TTL expiry / reset", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("allows requests after window expires", () => {
      const shortLimiter = new RateLimiter({ maxAttempts: 2, windowMs: 50 });

      shortLimiter.check("ip-ttl");
      shortLimiter.check("ip-ttl");
      expect(shortLimiter.check("ip-ttl").allowed).toBe(false);

      // Advance past the 50ms window
      vi.advanceTimersByTime(100);

      const r = shortLimiter.check("ip-ttl");
      expect(r.allowed).toBe(true);
    });
  });

  describe("new key", () => {
    it("starts fresh for an unseen key", () => {
      const result = limiter.check("brand-new-ip");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.retryAfterMs).toBe(0);
    });
  });
});
