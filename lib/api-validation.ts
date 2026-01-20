import { NextResponse } from "next/server";
import type { ApiValidationError, ApiValidationResult } from "./types";

/**
 * Validates required fields exist in request body
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
 * Validates field types
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
 * Validates enum values
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
 * Validates numeric ranges
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
 * Validates string patterns (regex)
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
 * Combines multiple validation results
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
 * Creates a validation error response
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
 * Safely parses JSON request body with error handling
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
 * Type-safe request body parser with validation
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
