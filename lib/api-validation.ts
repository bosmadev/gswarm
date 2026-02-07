import { NextResponse } from "next/server";
import type { ApiValidationError, ApiValidationResult } from "./types";

/**
 * Validates that required fields exist in the request body.
 *
 * @param body - The parsed request body object
 * @param requiredFields - Array of field names that must be present
 * @returns Validation result with data on success, or errors on failure
 */
function validateRequired<T extends Record<string, unknown>>(
  body: T,
  requiredFields: (keyof T)[],
): ApiValidationResult<T> {
  const errors: ApiValidationError[] = [];
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      errors.push({
        field: String(field),
        message: `Field '${String(field)}' is required`,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: body };
}

/**
 * Validates that field values match their expected types.
 * Skips undefined/null values (handled by validateRequired).
 *
 * @param body - The parsed request body object
 * @param typeMap - Map of field names to expected types ("string", "number", "boolean", "object", "array")
 * @returns Validation result with data on success, or errors on failure
 */
function validateTypes<T extends Record<string, unknown>>(
  body: T,
  typeMap: Partial<
    Record<keyof T, "string" | "number" | "boolean" | "object" | "array">
  >,
): ApiValidationResult<T> {
  const errors: ApiValidationError[] = [];
  for (const [field, expectedType] of Object.entries(typeMap)) {
    const value = body[field as keyof T];
    if (value === undefined || value === null) {
      continue; // Skip undefined/null (handled by validateRequired)
    }

    let isValid = false;
    switch (expectedType) {
      case "string":
        isValid = typeof value === "string";
        break;
      case "number":
        isValid = typeof value === "number" && !Number.isNaN(value);
        break;
      case "boolean":
        isValid = typeof value === "boolean";
        break;
      case "object":
        isValid = typeof value === "object" && !Array.isArray(value);
        break;
      case "array":
        isValid = Array.isArray(value);
        break;
    }

    if (!isValid) {
      errors.push({
        field,
        message: `Field '${field}' must be of type '${expectedType}'`,
        received: typeof value,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: body };
}

/**
 * Validates that a field value is one of the allowed values.
 *
 * @param body - The parsed request body object
 * @param field - The field name to validate
 * @param allowedValues - Array of allowed values for the field
 * @returns Validation result with data on success, or errors on failure
 */
export function validateEnum<T extends Record<string, unknown>>(
  body: T,
  field: keyof T,
  allowedValues: unknown[],
): ApiValidationResult<T> {
  const value = body[field];
  if (value !== undefined && value !== null && !allowedValues.includes(value)) {
    return {
      success: false,
      errors: [
        {
          field: String(field),
          message: `Field '${String(field)}' must be one of: ${allowedValues.join(", ")}`,
          received: value,
        },
      ],
    };
  }
  return { success: true, data: body };
}

/**
 * Validates that a numeric field is within the specified range.
 * Skips non-numeric values.
 *
 * @param body - The parsed request body object
 * @param field - The field name to validate
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @returns Validation result with data on success, or errors on failure
 */
function validateRange<T extends Record<string, unknown>>(
  body: T,
  field: keyof T,
  min?: number,
  max?: number,
): ApiValidationResult<T> {
  const value = body[field];
  if (typeof value !== "number") {
    return { success: true, data: body }; // Skip if not a number
  }

  const errors: ApiValidationError[] = [];
  if (min !== undefined && value < min) {
    errors.push({
      field: String(field),
      message: `Field '${String(field)}' must be >= ${min}`,
      received: value,
    });
  }
  if (max !== undefined && value > max) {
    errors.push({
      field: String(field),
      message: `Field '${String(field)}' must be <= ${max}`,
      received: value,
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: body };
}

/**
 * Validates that a string field matches a regular expression pattern.
 * Skips non-string values.
 *
 * @param body - The parsed request body object
 * @param field - The field name to validate
 * @param pattern - Regular expression the field value must match
 * @param message - Optional custom error message
 * @returns Validation result with data on success, or errors on failure
 */
export function validatePattern<T extends Record<string, unknown>>(
  body: T,
  field: keyof T,
  pattern: RegExp,
  message?: string,
): ApiValidationResult<T> {
  const value = body[field];
  if (typeof value !== "string") {
    return { success: true, data: body }; // Skip if not a string
  }

  if (!pattern.test(value)) {
    return {
      success: false,
      errors: [
        {
          field: String(field),
          message: message || `Field '${String(field)}' has invalid format`,
          received: value,
        },
      ],
    };
  }
  return { success: true, data: body };
}

/**
 * Combines multiple validation results into a single result.
 * Aggregates all errors from failed validations.
 *
 * @param results - Validation results to combine
 * @returns Combined validation result with all errors, or success with data
 */
function combineValidations<T>(
  ...results: ApiValidationResult<T>[]
): ApiValidationResult<T> {
  const allErrors: ApiValidationError[] = [];
  let finalData: T | undefined;

  for (const result of results) {
    if (!result.success && result.errors) {
      allErrors.push(...result.errors);
    }
    if (result.data) {
      finalData = result.data;
    }
  }

  if (allErrors.length > 0) {
    // If there are errors, return false and the combined errors
    return { success: false, errors: allErrors };
  }
  // If successful, return true and the last available data (all should be the same)
  if (finalData) {
    return { success: true, data: finalData };
  }
  return { success: false, errors: [{ field: "", message: "No data" }] };
}

/**
 * Creates a standardized validation error response (HTTP 400).
 *
 * @param errors - Array of validation error details
 * @returns NextResponse with status 400 and error details
 */
export function validationErrorResponse(
  errors: ApiValidationError[],
): NextResponse {
  return NextResponse.json(
    {
      error: "Validation failed",
      details: errors,
    },
    {
      status: 400,
    },
  );
}

/**
 * Safely parses JSON request body with error handling.
 * Returns a structured result instead of throwing on parse failure.
 *
 * @param request - The incoming HTTP request
 * @returns Object with success flag, parsed data, or error message
 *
 * @example
 * ```ts
 * const result = await safeParseBody<MyType>(request);
 * if (!result.success) {
 *   return NextResponse.json({ error: result.error }, { status: 400 });
 * }
 * const data = result.data;
 * ```
 */
export async function safeParseBody<T = unknown>(
  request: Request,
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const body = await request.json();
    return { success: true, data: body as T };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Invalid JSON in request body",
    };
  }
}

/**
 * Type-safe request body parser with comprehensive validation.
 * Parses JSON body and validates required fields, types, enums, ranges, and patterns.
 *
 * @param request - The incoming HTTP request
 * @param options - Validation configuration with required fields, types, enums, ranges, and patterns
 * @returns Success with validated data, or failure with a pre-built error response
 *
 * @example
 * ```ts
 * const result = await parseAndValidate<MyBody>(request, {
 *   required: ["name", "email"],
 *   types: { name: "string", email: "string", age: "number" },
 *   ranges: { age: { min: 0, max: 150 } },
 *   patterns: { email: { regex: /@/, message: "Must be a valid email" } },
 * });
 * if (!result.success) return result.response;
 * const { name, email, age } = result.data;
 * ```
 */
export async function parseAndValidate<T extends Record<string, unknown>>(
  request: Request,
  options: {
    required?: (keyof T)[];
    types?: Partial<
      Record<keyof T, "string" | "number" | "boolean" | "object" | "array">
    >;
    enums?: Partial<Record<keyof T, unknown[]>>;
    ranges?: Partial<Record<keyof T, { min?: number; max?: number }>>;
    patterns?: Partial<Record<keyof T, { regex: RegExp; message?: string }>>;
  },
): Promise<
  { success: true; data: T } | { success: false; response: NextResponse }
> {
  // Parse body
  const parseResult = await safeParseBody<T>(request);
  if (!parseResult.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Invalid request body",
          message: parseResult.error,
        },
        {
          status: 400,
        },
      ),
    };
  }

  if (!parseResult.data) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Invalid request body",
          message: "Request body is empty",
        },
        {
          status: 400,
        },
      ),
    };
  }
  const body = parseResult.data;

  const validations: ApiValidationResult<T>[] = [];

  // Validate required fields
  if (options.required) {
    validations.push(validateRequired<T>(body, options.required));
  }

  // Validate types
  if (options.types) {
    validations.push(validateTypes<T>(body, options.types));
  }

  // Validate enums
  if (options.enums) {
    for (const [field, allowedValues] of Object.entries(options.enums)) {
      validations.push(
        validateEnum<T>(body, field as keyof T, allowedValues as unknown[]),
      );
    }
  }

  // Validate ranges
  if (options.ranges) {
    for (const [field, range] of Object.entries(options.ranges)) {
      const { min, max } = range as { min?: number; max?: number };
      validations.push(validateRange<T>(body, field as keyof T, min, max));
    }
  }

  // Validate patterns
  if (options.patterns) {
    for (const [field, pattern] of Object.entries(options.patterns)) {
      const { regex, message } = pattern as { regex: RegExp; message?: string };
      validations.push(
        validatePattern<T>(body, field as keyof T, regex, message),
      );
    }
  }

  // Combine all validations
  const result = combineValidations<T>(...validations);

  if (!result.success) {
    return {
      success: false,
      response: validationErrorResponse(result.errors ?? []),
    };
  }

  // Return the successfully validated body data
  return { success: true, data: body };
}
