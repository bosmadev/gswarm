/**
 * @file lib/gswarm/__tests__/error-handler.test.ts
 * @description Tests for CloudCode PA error handling (429/403 parsing)
 */

import { describe, expect, it } from "vitest";
import { GSwarmErrorHandler } from "../gswarm-error-handler";

describe("GSwarmErrorHandler", () => {
  describe("parseResetTime", () => {
    it("parses 0s reset time", () => {
      const message = "You have exhausted your capacity on this model. Your quota will reset after 0s.";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBe(0);
    });

    it("parses complex reset time with hours, minutes, seconds", () => {
      const message = "Your quota will reset after 1h 23m 45s.";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBe(
        (1 * 3600 + 23 * 60 + 45) * 1000, // 5025000ms
      );
    });

    it("parses reset time with only minutes", () => {
      const message = "Your quota will reset after 30m 0s.";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBe(30 * 60 * 1000); // 1800000ms
    });

    it("parses reset time with only seconds", () => {
      const message = "Your quota will reset after 45s.";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBe(45 * 1000);
    });

    it("handles inconsistent spacing", () => {
      const message = "reset after 2h23m15s";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBe(
        (2 * 3600 + 23 * 60 + 15) * 1000,
      );
    });

    it("returns null for invalid format", () => {
      const message = "Rate limit exceeded without reset time";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBeNull();
    });

    it("is case insensitive", () => {
      const message = "Reset After 1H 30M 15S";
      expect(GSwarmErrorHandler.parseResetTime(message)).toBe(
        (1 * 3600 + 30 * 60 + 15) * 1000,
      );
    });
  });

  describe("extractValidationUrl", () => {
    it("extracts validation URL from VALIDATION_REQUIRED error", () => {
      const errorBody = JSON.stringify({
        error: {
          details: [
            {
              metadata: {
                validation_url:
                  "https://accounts.google.com/signin/continue?continue=https://cloudcode-pa.googleapis.com",
              },
            },
          ],
        },
      });

      expect(GSwarmErrorHandler.extractValidationUrl(errorBody)).toBe(
        "https://accounts.google.com/signin/continue?continue=https://cloudcode-pa.googleapis.com",
      );
    });

    it("returns null when validation_url is missing", () => {
      const errorBody = JSON.stringify({
        error: {
          message: "Permission denied",
        },
      });

      expect(GSwarmErrorHandler.extractValidationUrl(errorBody)).toBeNull();
    });

    it("returns null when details array is empty", () => {
      const errorBody = JSON.stringify({
        error: {
          details: [],
        },
      });

      expect(GSwarmErrorHandler.extractValidationUrl(errorBody)).toBeNull();
    });

    it("handles malformed JSON gracefully", () => {
      const errorBody = "not valid JSON {";
      expect(GSwarmErrorHandler.extractValidationUrl(errorBody)).toBeNull();
    });

    it("handles deeply nested structure correctly", () => {
      const errorBody = JSON.stringify({
        error: {
          code: 403,
          message: "VALIDATION_REQUIRED",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              metadata: {
                validation_url: "https://accounts.google.com/verify",
                other_field: "ignored",
              },
            },
          ],
        },
      });

      expect(GSwarmErrorHandler.extractValidationUrl(errorBody)).toBe(
        "https://accounts.google.com/verify",
      );
    });
  });

  describe("handleRateLimit", () => {
    it("uses parsed reset time from CloudCode PA message", () => {
      const errorBody = JSON.stringify({
        error: {
          message:
            "You have exhausted your capacity on this model. Your quota will reset after 30m 0s.",
        },
      });

      const result = GSwarmErrorHandler.handleRateLimit(
        "project-123",
        errorBody,
        150,
      );
      expect(result.resetDuration).toBe(30 * 60 * 1000); // 30 minutes
    });

    it("falls back to default when reset time not found", () => {
      const errorBody = JSON.stringify({
        error: {
          message: "Rate limit exceeded",
        },
      });

      const result = GSwarmErrorHandler.handleRateLimit(
        "project-123",
        errorBody,
        150,
      );
      expect(result.resetDuration).toBe(60000); // Default 60 seconds
    });
  });

  describe("handleForbidden", () => {
    it("returns validation URL when VALIDATION_REQUIRED", () => {
      const errorBody = JSON.stringify({
        error: {
          details: [
            {
              metadata: {
                validation_url: "https://accounts.google.com/verify",
              },
            },
          ],
        },
      });

      const result = GSwarmErrorHandler.handleForbidden(
        "project-123",
        errorBody,
      );
      expect(result.validationUrl).toBe("https://accounts.google.com/verify");
    });

    it("returns empty object when no validation URL", () => {
      const errorBody = JSON.stringify({
        error: {
          message: "Permission denied",
        },
      });

      const result = GSwarmErrorHandler.handleForbidden(
        "project-123",
        errorBody,
      );
      expect(result).toEqual({});
    });
  });

  describe("calculateHealthPenalty", () => {
    it("assigns correct penalties to status codes", () => {
      expect(GSwarmErrorHandler.calculateHealthPenalty(200)).toBe(0); // Success
      expect(GSwarmErrorHandler.calculateHealthPenalty(429)).toBe(30); // Rate limit
      expect(GSwarmErrorHandler.calculateHealthPenalty(403)).toBe(50); // Forbidden
      expect(GSwarmErrorHandler.calculateHealthPenalty(401)).toBe(60); // Unauthorized
      expect(GSwarmErrorHandler.calculateHealthPenalty(404)).toBe(40); // Not found
      expect(GSwarmErrorHandler.calculateHealthPenalty(500)).toBe(25); // Internal error
      expect(GSwarmErrorHandler.calculateHealthPenalty(503)).toBe(20); // Service unavailable
    });

    it("applies default penalty for unknown status codes", () => {
      expect(GSwarmErrorHandler.calculateHealthPenalty(418)).toBe(50); // 4xx default
      expect(GSwarmErrorHandler.calculateHealthPenalty(502)).toBe(30); // 5xx default
    });
  });
});
