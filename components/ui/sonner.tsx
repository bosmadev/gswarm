/**
 * @file components/ui/sonner.tsx
 * @description Toast notification component using Sonner.
 * Provides beautiful, accessible toast notifications.
 *
 * @module components/ui/sonner
 */

"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/providers";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toaster component that wraps Sonner with Pulsona theme styling.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "dark" } = useTheme();

  // Use inline styles to ensure dark theme styling works
  const darkStyles =
    theme === "dark"
      ? {
          background: "#1e2329", // --primary-bg-secondary
          border: "1px solid #2b3139", // --primary-border
          color: "#eaecef", // --primary-text-primary
        }
      : {};

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-left"
      richColors={false}
      toastOptions={{
        style: darkStyles,
        classNames: {
          toast: "group toast shadow-2xl",
          description:
            theme === "dark"
              ? "text-primary-text-secondary"
              : "text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-orange group-[.toast]:text-bg-primary",
          cancelButton:
            "group-[.toast]:bg-bg-tertiary group-[.toast]:text-text-secondary",
          success: "[&>svg]:text-primary-green!",
          error: "[&>svg]:text-primary-red!",
          warning: "[&>svg]:text-primary-orange!",
          info: "[&>svg]:text-primary-blue!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
