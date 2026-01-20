/**
 * Environment Variable Validator
 * Generic environment variable validation for Next.js applications
 */

import {
  EMOJI,
  PREFIX,
  consoleError,
  consoleLog,
  consoleWarn,
} from "./console";

// Environment variable configuration
interface EnvVarConfig {
  name: string;
  description: string;
  required: boolean;
  default?: string;
  validate?: (value: string) => boolean;
  validationMessage?: string;
}

// Environment variable groups
interface EnvVarGroup {
  name: string;
  description: string;
  variables: EnvVarConfig[];
}

// Validation result
interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
  errors: string[];
}

// Define environment variable groups
const ENV_GROUPS: EnvVarGroup[] = [
  {
    name: "Application",
    description: "Core application settings",
    variables: [
      {
        name: "NODE_ENV",
        description: "Node environment (development, production, test)",
        required: false,
        default: "development",
        validate: (v) => ["development", "production", "test"].includes(v),
        validationMessage: "Must be development, production, or test",
      },
      {
        name: "NEXT_PUBLIC_APP_URL",
        description: "Public application URL",
        required: false,
        default: "http://localhost:3000",
      },
    ],
  },
  {
    name: "Database",
    description: "Database connection settings",
    variables: [
      {
        name: "DATABASE_URL",
        description: "Database connection string",
        required: false,
      },
    ],
  },
  {
    name: "Authentication",
    description: "Authentication settings",
    variables: [
      {
        name: "NEXTAUTH_SECRET",
        description: "NextAuth.js secret for session encryption",
        required: false,
      },
      {
        name: "NEXTAUTH_URL",
        description: "NextAuth.js URL",
        required: false,
      },
    ],
  },
  {
    name: "API Keys",
    description: "External API keys",
    variables: [
      {
        name: "API_KEY",
        description: "General API key",
        required: false,
      },
    ],
  },
];

/**
 * Environment Variable Validator Class
 */
class EnvValidator {
  private groups: EnvVarGroup[];

  constructor(groups: EnvVarGroup[] = ENV_GROUPS) {
    this.groups = groups;
  }

  /**
   * Check if an environment variable is set
   */
  has(name: string): boolean {
    return process.env[name] !== undefined && process.env[name] !== "";
  }

  /**
   * Get an environment variable value with optional fallback
   */
  get(name: string, fallback?: string): string | undefined {
    const value = process.env[name];
    if (value !== undefined && value !== "") {
      return value;
    }
    return fallback;
  }

  /**
   * Get a required environment variable (throws if not set)
   */
  getRequired(name: string): string {
    const value = this.get(name);
    if (value === undefined) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  /**
   * Validate all environment variables
   */
  validate(): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      missing: [],
      warnings: [],
      errors: [],
    };

    for (const group of this.groups) {
      for (const variable of group.variables) {
        const value = process.env[variable.name];
        const hasValue = value !== undefined && value !== "";

        // Check required variables
        if (variable.required && !hasValue) {
          result.missing.push(variable.name);
          result.valid = false;
        }

        // Run custom validation if value exists
        if (hasValue && variable.validate) {
          if (!variable.validate(value)) {
            result.errors.push(
              `${variable.name}: ${variable.validationMessage || "Invalid value"}`,
            );
            result.valid = false;
          }
        }

        // Add warnings for optional but recommended variables
        if (!variable.required && !hasValue && !variable.default) {
          result.warnings.push(
            `${variable.name} is not set (${variable.description})`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Validate and print results to console
   */
  validateAndPrint(): boolean {
    const result = this.validate();

    consoleLog(PREFIX.INFO, "Environment Variable Validation");

    if (result.valid) {
      consoleLog(
        PREFIX.SUCCESS,
        `${EMOJI.SUCCESS} All required environment variables are set`,
      );
    } else {
      consoleError(PREFIX.ERROR, `${EMOJI.ERROR} Validation failed`);
    }

    if (result.missing.length > 0) {
      consoleError(PREFIX.ERROR, "Missing required variables:");
      for (const name of result.missing) {
        consoleError(PREFIX.ERROR, `  - ${name}`);
      }
    }

    if (result.errors.length > 0) {
      consoleError(PREFIX.ERROR, "Errors:");
      for (const error of result.errors) {
        consoleError(PREFIX.ERROR, `  - ${error}`);
      }
    }

    if (result.warnings.length > 0) {
      consoleWarn(PREFIX.WARNING, "Warnings:");
      for (const warning of result.warnings.slice(0, 5)) {
        consoleWarn(PREFIX.WARNING, `  - ${warning}`);
      }
      if (result.warnings.length > 5) {
        consoleWarn(
          PREFIX.WARNING,
          `  ... and ${result.warnings.length - 5} more`,
        );
      }
    }

    return result.valid;
  }

  /**
   * Add a custom environment variable group
   */
  addGroup(group: EnvVarGroup): void {
    this.groups.push(group);
  }

  /**
   * Get all environment variable groups
   */
  getGroups(): EnvVarGroup[] {
    return this.groups;
  }
}

// Export singleton instance
export const envValidator = new EnvValidator();

// Export types for extension
export type { EnvVarConfig, EnvVarGroup, ValidationResult };

// CLI runner (ESM compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  envValidator.validateAndPrint();
}
