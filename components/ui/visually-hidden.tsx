/**
 * @file components/ui/visually-hidden.tsx
 * @description VisuallyHidden component that hides content visually but keeps it
 * accessible to screen readers. Useful for accessibility labels.
 *
 * @module components/ui/visually-hidden
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {
  asChild?: boolean;
}

/**
 * VisuallyHidden component hides content from visual users but keeps it
 * accessible to screen readers. Uses CSS clip-path technique for hiding.
 */
const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0",
        "[clip:rect(0,0,0,0)]",
        className,
      )}
      {...props}
    />
  ),
);
VisuallyHidden.displayName = "VisuallyHidden";

export { VisuallyHidden };
