/**
 * @file components/ui/input.tsx
 * @description Input component with label, error, and helper text support.
 * Wraps the native input element with custom styling and additional features.
 *
 * @module components/ui/input
 */

"use client";

import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full rounded-lg border bg-bg-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-orange focus:border-orange transition-all disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-8 px-3 py-1 text-sm",
        md: "h-10 px-4 py-2 text-base",
        lg: "h-12 px-5 py-3 text-lg",
      },
      variant: {
        default: "border-border",
        error: "border-red-500 focus:ring-red focus:border-red-500",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  /** Label text for the input */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text to display below the input */
  helperText?: string;
  /** Badge text to display next to the label */
  badge?: string;
}

/**
 * Input component with label, error, and helper text support.
 *
 * @component
 * @example
 * ```tsx
 * <Input
 *   label="Email"
 *   placeholder="Enter your email"
 *   error={emailError}
 *   helperText="We'll never share your email"
 *   badge="Required"
 * />
 * ```
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      badge,
      size,
      variant,
      type = "text",
      id,
      ...props
    },
    ref,
  ) => {
    const uniqueId = React.useId();
    const inputId = id || uniqueId;
    const hasError = !!error;

    return (
      <div className="space-y-2">
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-text-secondary"
            >
              {label}
            </label>
            {badge && (
              <span className="text-xs font-mono text-orange-light bg-orange/10 px-2 py-0.5 rounded border border-orange/30">
                {badge}
              </span>
            )}
          </div>
        )}

        <input
          type={type}
          id={inputId}
          ref={ref}
          className={cn(
            inputVariants({ size, variant: hasError ? "error" : variant }),
            className,
          )}
          aria-invalid={hasError}
          aria-describedby={
            hasError
              ? `${inputId}-error`
              : helperText
                ? `${inputId}-helper`
                : undefined
          }
          {...props}
        />

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs text-red-500"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-xs text-text-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
