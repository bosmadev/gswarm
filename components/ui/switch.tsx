/**
 * @file components/ui/switch.tsx
 * @description Switch/Toggle component built on Radix UI Switch primitive.
 * Provides accessible toggle switches for boolean settings with optional label support.
 *
 * @module components/ui/switch
 */

"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// SWITCH (Base Radix component)
// ============================================================================

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-orange data-[state=unchecked]:bg-bg-tertiary",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

// ============================================================================
// LABELED SWITCH (Switch with label/description support)
// ============================================================================

export interface LabeledSwitchProps {
  /** Whether the toggle is checked */
  checked: boolean;
  /** Callback when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Label text for the toggle */
  label?: string;
  /** Description text for the toggle */
  description?: string;
  /** Size of the toggle */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

const sizeConfig: Record<
  "sm" | "md" | "lg",
  { track: string; thumb: string; checkedTranslate: string }
> = {
  sm: {
    track: "h-5 w-9",
    thumb: "h-3 w-3",
    checkedTranslate: "data-[state=checked]:translate-x-5",
  },
  md: {
    track: "h-6 w-11",
    thumb: "h-5 w-5",
    checkedTranslate: "data-[state=checked]:translate-x-5",
  },
  lg: {
    track: "h-7 w-14",
    thumb: "h-5 w-5",
    checkedTranslate: "data-[state=checked]:translate-x-8",
  },
};

/**
 * LabeledSwitch component with label and description support.
 * A convenient wrapper around Switch with additional features.
 *
 * @component
 * @example
 * ```tsx
 * <LabeledSwitch
 *   checked={isEnabled}
 *   onChange={setIsEnabled}
 *   label="Enable feature"
 *   description="Turn this feature on or off"
 *   size="md"
 * />
 * ```
 */
const LabeledSwitch = React.forwardRef<HTMLButtonElement, LabeledSwitchProps>(
  (
    {
      checked,
      onChange,
      disabled = false,
      label,
      description,
      size = "md",
      className,
    },
    ref,
  ) => {
    const uniqueId = React.useId();
    const config = sizeConfig[size];

    const toggle = (
      <SwitchPrimitives.Root
        ref={ref}
        id={uniqueId}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={cn(
          "peer inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-orange data-[state=unchecked]:bg-bg-tertiary",
          config.track,
          className,
        )}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out data-[state=unchecked]:translate-x-1",
            config.thumb,
            config.checkedTranslate,
          )}
        />
      </SwitchPrimitives.Root>
    );

    if (!label && !description) {
      return toggle;
    }

    return (
      <div className="flex items-center gap-3">
        {toggle}
        <div className="flex-1">
          {label && (
            <label
              htmlFor={uniqueId}
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
        </div>
      </div>
    );
  },
);
LabeledSwitch.displayName = "LabeledSwitch";

export { LabeledSwitch, Switch };
