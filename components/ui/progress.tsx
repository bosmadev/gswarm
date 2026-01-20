/**
 * @file components/ui/progress.tsx
 * @description Progress bar components for displaying completion status.
 * Includes both linear Progress and CircularProgress variants.
 *
 * @module components/ui/progress
 */

"use client";

import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// LINEAR PROGRESS
// ============================================================================

const progressVariants = cva(
  "w-full bg-bg-secondary rounded-full overflow-hidden border border-border",
  {
    variants: {
      size: {
        sm: "h-1",
        md: "h-2",
        lg: "h-3",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

const progressBarVariants = cva(
  "h-full rounded-full transition-all duration-300 ease-out",
  {
    variants: {
      variant: {
        default: "bg-orange",
        success: "bg-green",
        warning: "bg-orange",
        danger: "bg-red",
        info: "bg-blue",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants>,
    VariantProps<typeof progressBarVariants> {
  /** Current value of the progress (0-100) */
  value: number;
  /** Maximum value of the progress */
  max?: number;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Custom label text */
  label?: string;
  /** Whether the progress bar should be animated */
  animated?: boolean;
  /** Whether the progress bar should be striped */
  striped?: boolean;
}

/**
 * Progress bar component for displaying completion status.
 *
 * @component
 * @example
 * ```tsx
 * <Progress
 *   value={50}
 *   max={100}
 *   variant="success"
 *   showLabel={true}
 *   animated={true}
 * />
 * ```
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value,
      max = 100,
      size,
      variant,
      showLabel = false,
      label,
      animated = false,
      striped = false,
      ...props
    },
    ref,
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div className="w-full" ref={ref} {...props}>
        {(showLabel || label) && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-primary">
              {label || "Progress"}
            </span>
            <span className="text-sm font-mono text-text-secondary">
              {percentage.toFixed(0)}%
            </span>
          </div>
        )}

        <div className={cn(progressVariants({ size }), className)}>
          <div
            className={cn(
              progressBarVariants({ variant }),
              animated && "animate-pulse",
              striped &&
                "bg-linear-to-r from-transparent via-white/10 to-transparent bg-size-[200%_100%] animate-[shimmer_2s_infinite]",
            )}
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
          />
        </div>
      </div>
    );
  },
);
Progress.displayName = "Progress";

// ============================================================================
// CIRCULAR PROGRESS
// ============================================================================

export interface CircularProgressProps {
  /** Current value of the progress (0-100) */
  value: number;
  /** Maximum value of the progress */
  max?: number;
  /** Diameter of the circular progress in pixels */
  size?: number;
  /** Stroke width of the circular progress */
  strokeWidth?: number;
  /** Color variant of the circular progress */
  variant?: "default" | "success" | "warning" | "danger" | "info";
  /** Whether to show the label */
  showLabel?: boolean;
  /** Custom label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

const variantColors: Record<
  "default" | "success" | "warning" | "danger" | "info",
  string
> = {
  default: "#F0B90B",
  success: "#0ECB81",
  warning: "#F0B90B",
  danger: "#F6465D",
  info: "#3861FB",
};

/**
 * Circular progress component for displaying completion status in a circle.
 *
 * @component
 * @example
 * ```tsx
 * <CircularProgress
 *   value={75}
 *   size={120}
 *   variant="success"
 *   showLabel={true}
 *   strokeWidth={10}
 * />
 * ```
 */
const CircularProgress = React.forwardRef<SVGSVGElement, CircularProgressProps>(
  (
    {
      value,
      max = 100,
      size = 120,
      strokeWidth = 8,
      variant = "default",
      showLabel = true,
      label,
      className,
    },
    ref,
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center",
          className,
        )}
      >
        <svg
          ref={ref}
          width={size}
          height={size}
          className="transform -rotate-90"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          <title>Circular Progress</title>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className="text-bg-secondary"
          />

          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={variantColors[variant]}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center label */}
        {showLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-text-primary">
              {percentage.toFixed(0)}%
            </span>
            {label && (
              <span className="text-xs text-text-secondary mt-1">{label}</span>
            )}
          </div>
        )}
      </div>
    );
  },
);
CircularProgress.displayName = "CircularProgress";

export { Progress, CircularProgress, progressVariants, progressBarVariants };
