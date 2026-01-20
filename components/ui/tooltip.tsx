/**
 * @file components/ui/tooltip.tsx
 * @description Tooltip component built on Radix UI primitives.
 * Provides accessible, animated tooltips with proper positioning.
 *
 * @module components/ui/tooltip
 */

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// RADIX TOOLTIP PRIMITIVES (Compound Components)
// =============================================================================

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary shadow-2xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// =============================================================================
// SIMPLE TOOLTIP WRAPPER (Legacy API)
// =============================================================================

export interface TooltipProps {
  /** Content to display in the tooltip */
  content: React.ReactNode;
  /** Element that triggers the tooltip */
  children: React.ReactNode;
  /** Side of the trigger to show tooltip on */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment of tooltip relative to trigger */
  align?: "start" | "center" | "end";
  /** Delay before showing tooltip in ms */
  delayDuration?: number;
  /** Whether the tooltip is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Simple Tooltip wrapper with content prop for backward compatibility.
 *
 * @component
 * @example
 * ```tsx
 * <Tooltip content="This is helpful information">
 *   <Button>Hover me</Button>
 * </Tooltip>
 * ```
 */
function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 200,
  disabled = false,
  className,
}: TooltipProps) {
  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={className}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}

export {
  Tooltip,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
};
