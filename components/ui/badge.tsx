/**
 * @file components/ui/badge.tsx
 * @description Badge component for displaying status indicators, tags, or labels.
 * Supports various color variants and sizes to fit different contexts.
 *
 * @module components/ui/badge
 */

"use client";

import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center font-mono font-semibold rounded border transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary border-primary/30",
        orange: "bg-orange/10 text-orange border-orange/30",
        green: "bg-green/10 text-green border-green/30",
        red: "bg-red/10 text-red border-red/30",
        blue: "bg-blue/10 text-blue border-blue/30",
        yellow: "bg-orange-light/10 text-orange-light border-orange-light/30",
        gray: "bg-text-secondary/10 text-text-secondary border-text-secondary/30",
        secondary: "bg-bg-secondary text-text-secondary border-border",
        outline: "text-text-primary border-border bg-transparent",
        destructive: "bg-red/10 text-red border-red/30",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
        lg: "px-3 py-1.5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge component for displaying status indicators, tags, or labels.
 *
 * @component
 * @example
 * ```tsx
 * <Badge variant="green" size="md">Success</Badge>
 * <Badge variant="red" size="sm">Error</Badge>
 * ```
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
