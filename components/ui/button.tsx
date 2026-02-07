/**
 * @file components/ui/button.tsx
 * @description Button component with variant, size, icon, and loading support.
 * Uses class-variance-authority for variant styling.
 *
 * @module components/ui/button
 */

"use client";

import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-orange text-white hover:bg-orange/90 shadow-sm",
        secondary:
          "bg-bg-secondary text-text-primary border border-border hover:bg-bg-tertiary",
        ghost:
          "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
        destructive: "bg-red text-white hover:bg-red/90 shadow-sm",
        outline:
          "border border-border bg-transparent text-text-primary hover:bg-bg-secondary",
        link: "text-orange underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 py-2",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof buttonVariants> {
  /** Button content */
  children?: React.ReactNode;
  /** Render as child element (Radix Slot) */
  asChild?: boolean;
  /** Show loading spinner and disable interaction */
  loading?: boolean;
  /** Icon rendered before children */
  icon?: React.ReactNode;
  /** Icon rendered after children */
  iconAfter?: React.ReactNode;
}

/**
 * Button component with variant, size, icon, and loading support.
 *
 * @example
 * ```tsx
 * <Button variant="primary" icon={<Plus />}>Create</Button>
 * <Button variant="ghost" size="icon" aria-label="Delete"><Trash2 /></Button>
 * <Button loading>Saving...</Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      icon,
      iconAfter,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        type={type}
        {...props}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          icon
        )}
        {children}
        {!loading && iconAfter}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
