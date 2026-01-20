/**
 * @file components/ui/checkbox.tsx
 * @description Checkbox component built on Radix UI Checkbox primitive.
 * Provides accessible checkbox inputs with customizable styling, labels, and descriptions.
 *
 * @module components/ui/checkbox
 */

"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** Label text for the checkbox */
  label?: string;
  /** Description text for the checkbox */
  description?: string;
  /** Error message to display */
  error?: string;
  /** Size variant of the checkbox */
  size?: "sm" | "md" | "lg";
  /** Whether the checkbox is in an indeterminate state */
  indeterminate?: boolean;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

/**
 * Checkbox component with label and description support.
 *
 * @component
 * @example
 * ```tsx
 * <Checkbox
 *   checked={isChecked}
 *   onCheckedChange={setIsChecked}
 *   label="Accept terms"
 *   description="You must accept the terms to continue"
 *   error={errors.terms}
 * />
 * ```
 */
const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(
  (
    {
      className,
      label,
      description,
      error,
      size = "md",
      indeterminate = false,
      id,
      disabled,
      ...props
    },
    ref,
  ) => {
    const uniqueId = React.useId();
    const checkboxId = id || uniqueId;
    const hasContent = label || description || error;

    const checkbox = (
      <CheckboxPrimitive.Root
        ref={ref}
        id={checkboxId}
        disabled={disabled}
        className={cn(
          "peer shrink-0 rounded-sm border-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          sizeClasses[size],
          error
            ? "border-red"
            : "border-border data-[state=checked]:bg-orange data-[state=checked]:border-orange data-[state=indeterminate]:bg-orange data-[state=indeterminate]:border-orange hover:border-orange",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          className={cn("flex items-center justify-center text-white")}
        >
          {indeterminate ? (
            <Minus className={iconSizeClasses[size]} strokeWidth={3} />
          ) : (
            <Check className={iconSizeClasses[size]} strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );

    if (!hasContent) {
      return checkbox;
    }

    return (
      <div className="flex items-start gap-3">
        <div className="flex items-center">{checkbox}</div>
        <div className="flex-1">
          {label && (
            <label
              htmlFor={checkboxId}
              className={cn(
                "block text-sm font-medium text-text-primary",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-text-secondary mt-0.5">{description}</p>
          )}
          {error && (
            <p className="text-xs text-red mt-1" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
