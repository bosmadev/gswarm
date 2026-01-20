/**
 * @file components/ui/button.tsx
 * @description Button component using Radix UI Slot for composition.
 * Provides accessible buttons with various styles, sizes, loading states, and icon support.
 *
 * @module components/ui/button
 */

"use client";

import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-(--primary-orange)/85 backdrop-blur-sm text-(--primary-bg-primary) border border-(--primary-orange)/60 hover:bg-(--primary-orange)/95 hover:border-(--primary-orange)/80 hover:shadow-lg hover:shadow-(--primary-orange-glow)",
        primary:
          "bg-(--primary-orange)/85 backdrop-blur-sm text-(--primary-bg-primary) border border-(--primary-orange)/60 hover:bg-(--primary-orange)/95 hover:border-(--primary-orange)/80 hover:shadow-lg hover:shadow-(--primary-orange-glow)",
        secondary:
          "bg-(--primary-bg-tertiary)/60 backdrop-blur-sm text-orange border border-(--primary-orange)/30 hover:bg-(--primary-bg-tertiary)/80 hover:border-(--primary-orange)/50 hover:shadow-md",
        success:
          "bg-(--primary-green)/15 backdrop-blur-sm text-green border border-(--primary-green)/30 hover:bg-(--primary-green)/25 hover:border-(--primary-green)/50 hover:shadow-md",
        destructive:
          "bg-(--primary-red)/15 backdrop-blur-sm text-red border border-(--primary-red)/30 hover:bg-(--primary-red)/25 hover:border-(--primary-red)/50 hover:shadow-md",
        danger:
          "bg-(--primary-red)/15 backdrop-blur-sm text-red border border-(--primary-red)/30 hover:bg-(--primary-red)/25 hover:border-(--primary-red)/50 hover:shadow-md",
        warning:
          "bg-(--primary-orange-light)/15 backdrop-blur-sm text-(--primary-orange-light) border border-(--primary-orange-light)/30 hover:bg-(--primary-orange-light)/25 hover:border-(--primary-orange-light)/50 hover:shadow-md",
        info: "bg-(--primary-blue)/15 backdrop-blur-sm text-blue border border-(--primary-blue)/30 hover:bg-(--primary-blue)/25 hover:border-(--primary-blue)/50 hover:shadow-md",
        outline:
          "bg-transparent text-orange border border-(--primary-orange)/40 hover:bg-(--primary-orange)/10 hover:border-(--primary-orange)/60 hover:shadow-md",
        ghost:
          "bg-transparent text-text-secondary border border-transparent hover:bg-(--primary-bg-tertiary)/50 hover:text-orange hover:border-(--primary-border)/50",
        link: "text-primary underline-offset-4 hover:underline border-none",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-9 rounded-md px-3 text-sm",
        md: "h-10 px-6 py-3 text-base",
        lg: "h-11 rounded-md px-8 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Use Radix Slot for composition with child elements */
  asChild?: boolean;
  /** Whether the button is in a loading state */
  loading?: boolean;
  /** Icon to display in the button (before children) */
  icon?: React.ReactNode;
  /** Icon to display after the children */
  iconAfter?: React.ReactNode;
}

/**
 * Button component with multiple variants, sizes, and states.
 * Supports loading state, icons, and Radix Slot composition.
 *
 * @component
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Click me
 * </Button>
 * <Button variant="outline" loading={isLoading}>
 *   Saving...
 * </Button>
 * <Button variant="ghost" icon={<PlusIcon />}>
 *   Add Item
 * </Button>
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
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : icon ? (
          icon
        ) : null}
        {children}
        {iconAfter && !loading && iconAfter}
      </Comp>
    );
  },
);
Button.displayName = "Button";

// Alias for backward compatibility
const ShadcnButton = Button;

export { Button, ShadcnButton, buttonVariants };
