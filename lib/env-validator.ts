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

// =============================================================================
// Types
// =============================================================================

/** Environment variable definition */
export interface EnvVariable {
  name: string;
  required: boolean;
  description: string;
  example?: string;
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
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: false,
    description: "Public application URL for callbacks and redirects",
    example: "https://gswarm.example.com",
  },
  {
    name: "DEBUG",
    required: false,
    description: "Enable debug logging (true/false or 1/0)",
    example: "false",
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
  // GOOGLE OAUTH
  // ==================================================

  {
    name: "GOOGLE_CLIENT_ID",
    required: false, // Dynamically checked in validate() for production
    description: "Google OAuth 2.0 Client ID for authentication",
    example: "your_client_id.apps.googleusercontent.com",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    required: false, // Dynamically checked in validate() for production
    description: "Google OAuth 2.0 Client Secret",
    example: "your_client_secret",
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
  },
  {
    name: "GSWARM_MAX_OUTPUT_TOKENS",
    required: false,
    description: "Maximum number of tokens in the AI output",
    example: "65536",
  },
  {
    name: "GSWARM_TEMPERATURE",
    required: false,
    description: "AI output randomness (0.0-2.0, lower = more deterministic)",
    example: "1.0",
  },
  {
    name: "GSWARM_TOP_P",
    required: false,
    description: "Nucleus sampling parameter (0.0-1.0)",
    example: "0.95",
  },
  {
    name: "GSWARM_THINKING_ENABLED",
    required: false,
    description: "Enable thinking mode for extended reasoning (true/false)",
    example: "true",
  },
  {
    name: "GSWARM_THINKING_BUDGET",
    required: false,
    description: "Token budget for thinking mode",
    example: "32768",
  },
  {
    name: "GSWARM_MAX_RETRIES",
    required: false,
    description: "Maximum number of retries for failed requests",
    example: "3",
  },
  {
    name: "GSWARM_BASE_RETRY_DELAY",
    required: false,
    description: "Base delay in milliseconds between retries",
    example: "1000",
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

    // Google OAuth credentials are required in production
    if (
      envVarName === "GOOGLE_CLIENT_ID" ||
      envVarName === "GOOGLE_CLIENT_SECRET"
    ) {
      return isProduction;
    }

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
          // Suppress warnings for conditionally required variables not relevant in current mode
          const isOAuthKey =
            envVar.name === "GOOGLE_CLIENT_ID" ||
            envVar.name === "GOOGLE_CLIENT_SECRET";
          const isSessionKey = envVar.name === "SESSION_SECRET";

          // In development, suppress warnings for production-only requirements
          if (!isProduction && (isOAuthKey || isSessionKey)) {
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
      throw new Error(
        `Environment variable ${name} is not set and no fallback provided`,
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
        env.clientId = this.get("GOOGLE_CLIENT_ID", "");
        env.clientSecret = this.get("GOOGLE_CLIENT_SECRET", "");
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
