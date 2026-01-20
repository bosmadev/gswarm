/**
 * @file components/ui/number-input.tsx
 * @description Number input component with custom increment/decrement buttons.
 * Replaces native spinner buttons with fully styleable custom buttons.
 *
 * @module components/ui/number-input
 */

"use client";

import { type VariantProps, cva } from "class-variance-authority";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const numberInputVariants = cva(
  "flex items-center rounded-lg border bg-bg-secondary text-text-primary transition-all focus-within:ring-2 focus-within:ring-orange focus-within:border-orange",
  {
    variants: {
      size: {
        sm: "h-8",
        md: "h-10",
        lg: "h-12",
      },
      variant: {
        default: "border-border",
        error: "border-red focus-within:ring-red focus-within:border-red",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  },
);

const inputSizeVariants = cva("", {
  variants: {
    size: {
      sm: "px-2 py-1 text-sm",
      md: "px-3 py-2 text-base",
      lg: "px-4 py-3 text-lg",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const buttonSizeVariants = cva(
  "flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        sm: "w-6 h-full",
        md: "w-8 h-full",
        lg: "w-10 h-full",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface NumberInputProps
  extends Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "size" | "type" | "onChange"
    >,
    VariantProps<typeof numberInputVariants> {
  /** Label text for the input */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text to display below the input */
  helperText?: string;
  /** Badge text to display next to the label */
  badge?: string;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step value for increment/decrement */
  step?: number;
  /** Value (controlled) */
  value?: number | string;
  /** Default value (uncontrolled) */
  defaultValue?: number | string;
  /** Change handler */
  onChange?: (value: number | undefined) => void;
  /** Use compact buttons (chevrons instead of plus/minus) */
  compact?: boolean;
}

/**
 * NumberInput component with custom increment/decrement buttons.
 *
 * @component
 * @example
 * ```tsx
 * <NumberInput
 *   label="Quantity"
 *   min={0}
 *   max={100}
 *   step={1}
 *   onChange={(value) => console.log(value)}
 * />
 * ```
 */
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      badge,
      size,
      variant,
      min,
      max,
      step = 1,
      value,
      defaultValue,
      onChange,
      disabled,
      compact = true,
      id,
      ...props
    },
    ref,
  ) => {
    const uniqueId = React.useId();
    const inputId = id || uniqueId;
    const hasError = !!error;

    const [internalValue, setInternalValue] = React.useState<string>(
      defaultValue?.toString() ?? "",
    );

    const currentValue = value !== undefined ? value.toString() : internalValue;
    const numericValue = currentValue
      ? Number.parseFloat(currentValue)
      : undefined;

    const canDecrement =
      numericValue !== undefined && (min === undefined || numericValue > min);
    const canIncrement =
      numericValue !== undefined && (max === undefined || numericValue < max);

    const updateValue = (newValue: number | undefined) => {
      if (newValue !== undefined) {
        // Clamp value to min/max
        let clamped = newValue;
        if (min !== undefined) clamped = Math.max(min, clamped);
        if (max !== undefined) clamped = Math.min(max, clamped);

        // Round to step precision
        const precision = step.toString().split(".")[1]?.length ?? 0;
        clamped = Number.parseFloat(clamped.toFixed(precision));

        if (value === undefined) {
          setInternalValue(clamped.toString());
        }
        onChange?.(clamped);
      } else {
        if (value === undefined) {
          setInternalValue("");
        }
        onChange?.(undefined);
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (newValue === "" || newValue === "-") {
        if (value === undefined) {
          setInternalValue(newValue);
        }
        onChange?.(undefined);
        return;
      }

      const parsed = Number.parseFloat(newValue);
      if (!Number.isNaN(parsed)) {
        updateValue(parsed);
      }
    };

    const handleIncrement = () => {
      if (disabled) return;
      const current = numericValue ?? min ?? 0;
      updateValue(current + step);
    };

    const handleDecrement = () => {
      if (disabled) return;
      const current = numericValue ?? max ?? 0;
      updateValue(current - step);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleIncrement();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleDecrement();
      }
    };

    const UpIcon = compact ? ChevronUp : Plus;
    const DownIcon = compact ? ChevronDown : Minus;
    const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;

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

        <div
          className={cn(
            numberInputVariants({
              size,
              variant: hasError ? "error" : variant,
            }),
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <input
            type="text"
            inputMode="decimal"
            id={inputId}
            ref={ref}
            value={currentValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              "flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:cursor-not-allowed min-w-0",
              inputSizeVariants({ size }),
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

          <div className="flex flex-col border-l border-border h-full">
            <button
              type="button"
              tabIndex={-1}
              onClick={handleIncrement}
              disabled={disabled || !canIncrement}
              className={cn(
                buttonSizeVariants({ size }),
                "rounded-tr-lg border-b border-border flex-1",
              )}
              aria-label="Increment"
            >
              <UpIcon size={iconSize} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={handleDecrement}
              disabled={disabled || !canDecrement}
              className={cn(
                buttonSizeVariants({ size }),
                "rounded-br-lg flex-1",
              )}
              aria-label="Decrement"
            >
              <DownIcon size={iconSize} />
            </button>
          </div>
        </div>

        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red" role="alert">
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
NumberInput.displayName = "NumberInput";

export { NumberInput, numberInputVariants };
