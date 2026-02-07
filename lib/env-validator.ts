/**
 * Environment Variable Validator
 * Validates required and optional environment variables at startup
 */

import {
  PREFIX,
  consoleDebug,
  consoleError,
  consoleLog,
  consoleWarn,
} from "@/lib/console";
import { GSwarmConfigError } from "@/lib/gswarm/errors";

// =============================================================================
// Types
// =============================================================================

/** Environment variable definition */
export interface EnvVariable {
  name: string;
  required: boolean;
  description: string;
  example?: string;
  /** If false, suppress warning when optional var is unset (has programmatic default). Default: true */
  warnIfMissing?: boolean;
}

/** Environment validation result */
export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
  errors: string[];
}

// =============================================================================
// Environment Variables Definition
// =============================================================================

const ENV_VARIABLES: EnvVariable[] = [
  // ==================================================
  // APPLICATION SETTINGS
  // ==================================================

  {
    name: "NODE_ENV",
    required: false,
    description: "Node environment (development, production, test)",
    example: "production",
    warnIfMissing: false,
  },
  {
    name: "GLOBAL_URL",
    required: false,
    description: "Application URL for OAuth callbacks and redirects",
    example: "https://gswarm.example.com",
    warnIfMissing: false,
  },
  {
    name: "GLOBAL_PORT",
    required: false,
    description: "Server port (used by launch script and Next.js)",
    example: "3001",
    warnIfMissing: false,
  },
  {
    name: "DEBUG",
    required: false,
    description: "Enable debug logging (true/false or 1/0)",
    example: "false",
    warnIfMissing: false,
  },

  // ==================================================
  // ADMIN AUTHENTICATION
  // ==================================================

  {
    name: "ADMIN_USERNAME",
    required: false,
    description: "Admin username for dashboard access",
    example: "admin",
  },
  {
    name: "ADMIN_PASSWORD",
    required: false,
    description: "Admin password for dashboard access",
    example: "your_secure_password",
  },

  // ==================================================
  // DASHBOARD USERS
  // ==================================================

  {
    name: "DASHBOARD_USERS",
    required: false,
    description: "Dashboard users (format: user1:pass1,user2:pass2)",
    example: "user1:password1,user2:password2",
  },

  // ==================================================
  // API KEYS
  // ==================================================

  {
    name: "API_KEYS",
    required: false,
    description: "API keys configuration (format: name:key:ips)",
    example: "myapp:sk_abc123:*",
  },

  // ==================================================
  // SESSION
  // ==================================================

  {
    name: "SESSION_SECRET",
    required: false, // Dynamically checked in validate() for production
    description:
      "Secret for session encryption (generate with: openssl rand -base64 32)",
    example: "your_random_secret_here",
  },

  // ==================================================
  // GSWARM AI CONFIGURATION
  // ==================================================

  {
    name: "GSWARM_MODEL",
    required: false,
    description: "Gemini model to use for AI generation",
    example: "gemini-2.5-pro",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_MAX_OUTPUT_TOKENS",
    required: false,
    description: "Maximum number of tokens in the AI output",
    example: "65536",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_TEMPERATURE",
    required: false,
    description: "AI output randomness (0.0-2.0, lower = more deterministic)",
    example: "1.0",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_TOP_P",
    required: false,
    description: "Nucleus sampling parameter (0.0-1.0)",
    example: "0.95",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_THINKING_ENABLED",
    required: false,
    description: "Enable thinking mode for extended reasoning (true/false)",
    example: "true",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_THINKING_BUDGET",
    required: false,
    description: "Token budget for thinking mode",
    example: "32768",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_MAX_RETRIES",
    required: false,
    description: "Maximum number of retries for failed requests",
    example: "3",
    warnIfMissing: false,
  },
  {
    name: "GSWARM_BASE_RETRY_DELAY",
    required: false,
    description: "Base delay in milliseconds between retries",
    example: "1000",
    warnIfMissing: false,
  },

  // ==================================================
  // ERROR LOG CLEANUP
  // ==================================================

  {
    name: "ERROR_LOG_MAX_AGE_DAYS",
    required: false,
    description:
      "Maximum age in days for error.log before deletion (default: 14)",
    example: "14",
    warnIfMissing: false,
  },
  {
    name: "ERROR_LOG_MAX_SIZE_MB",
    required: false,
    description:
      "Maximum size in MB for error.log before truncation (default: 10)",
    example: "10",
    warnIfMissing: false,
  },
  {
    name: "ERROR_LOG_CLEANUP_SCHEDULE",
    required: false,
    description:
      "Cron schedule for error log cleanup (default: daily midnight)",
    example: "0 0 * * *",
    warnIfMissing: false,
  },
];

// =============================================================================
// Environment Validator Class
// =============================================================================

class EnvValidator {
  /**
   * Check if an environment variable is required based on current mode
   */
  private isRequired(envVarName: string): boolean {
    const isProduction = process.env.NODE_ENV === "production";

    // Session secret is required in production
    if (envVarName === "SESSION_SECRET") {
      return isProduction;
    }

    // For all other variables, use the static required field
    const envVar = ENV_VARIABLES.find((v) => v.name === envVarName);
    return envVar?.required ?? false;
  }

  /**
   * Validate all environment variables
   */
  validate(): EnvValidationResult {
    const missing: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const isProduction = process.env.NODE_ENV === "production";

    for (const envVar of ENV_VARIABLES) {
      const value = process.env[envVar.name];
      const isRequired = this.isRequired(envVar.name);

      if (!value || value.trim() === "") {
        if (isRequired) {
          missing.push(envVar.name);
          errors.push(
            `Missing required environment variable: ${envVar.name}\n` +
              `  Description: ${envVar.description}\n` +
              `  Example: ${envVar.example || "N/A"}`,
          );
        } else {
          // Suppress warnings for vars with programmatic defaults
          if (envVar.warnIfMissing === false) {
            continue;
          }

          // Suppress warnings for conditionally required variables not relevant in current mode
          const isSessionKey = envVar.name === "SESSION_SECRET";

          // In development, suppress warnings for production-only requirements
          if (!isProduction && isSessionKey) {
            continue;
          }

          warnings.push(
            `Optional environment variable not set: ${envVar.name}\n` +
              `  Description: ${envVar.description}`,
          );
        }
      }
    }

    const valid = missing.length === 0;
    return {
      valid,
      missing,
      warnings,
      errors,
    };
  }

  /**
   * Validate and print results to console
   */
  validateAndPrint(): boolean {
    consoleDebug(PREFIX.INFO, "Validating environment variables...");
    const result = this.validate();

    if (result.valid) {
      consoleLog(PREFIX.SUCCESS, "All required environment variables are set");

      if (result.warnings.length > 0) {
        consoleWarn(
          PREFIX.WARNING,
          `${result.warnings.length} optional variable(s) not set (use DEBUG=true for details)`,
        );
        for (const warning of result.warnings) {
          consoleDebug(PREFIX.WARNING, ` ${warning}`);
        }
      }
      return true;
    }

    consoleError(PREFIX.ERROR, "Environment validation failed");
    consoleError(PREFIX.ERROR, "Missing required environment variables:");
    for (const error of result.errors) {
      consoleError(PREFIX.ERROR, ` ${error}`);
    }
    consoleError(PREFIX.ERROR, "Please set these variables in your .env file");
    return false;
  }

  /**
   * Get environment variable with fallback
   */
  get(name: string, fallback?: string): string {
    const value = process.env[name];
    if (!value && fallback === undefined) {
      throw new GSwarmConfigError(
        `Environment variable ${name} is not set and no fallback provided`,
        { configKey: name },
      );
    }
    return value || fallback || "";
  }

  /**
   * Check if environment variable is set
   */
  has(name: string): boolean {
    const value = process.env[name];
    return value !== undefined && value.trim() !== "";
  }

  /**
   * Get all environment variables for a service
   */
  getServiceEnv(
    service: "google" | "admin" | "gswarm",
  ): Record<string, string> {
    const env: Record<string, string> = {};
    switch (service) {
      case "google":
        // OAuth credentials are hardcoded (gemini-cli public creds), not env vars
        break;
      case "admin":
        env.username = this.get("ADMIN_USERNAME", "");
        env.password = this.get("ADMIN_PASSWORD", "");
        break;
      case "gswarm":
        env.model = this.get("GSWARM_MODEL", "gemini-2.5-pro");
        env.maxOutputTokens = this.get("GSWARM_MAX_OUTPUT_TOKENS", "65536");
        env.temperature = this.get("GSWARM_TEMPERATURE", "1.0");
        env.topP = this.get("GSWARM_TOP_P", "0.95");
        env.thinkingEnabled = this.get("GSWARM_THINKING_ENABLED", "true");
        env.thinkingBudget = this.get("GSWARM_THINKING_BUDGET", "32768");
        break;
    }
    return env;
  }
}

export const envValidator = new EnvValidator();

// CLI interface
if (typeof require !== "undefined" && require.main === module) {
  const valid = envValidator.validateAndPrint();
  process.exit(valid ? 0 : 1);
}
