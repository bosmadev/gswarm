/**
 * @file components/ui/theme-toggle.tsx
 * @description Dark/light mode toggle button using the custom ThemeProvider context.
 * Shows a Sun icon in dark mode (click to switch to light) and Moon icon in light mode.
 *
 * @module components/ui/theme-toggle
 */

"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Theme toggle button that switches between dark and light modes.
 * Handles hydration mismatch by deferring icon render until mounted.
 *
 * @example
 * ```tsx
 * <ThemeToggle />
 * ```
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = theme === "dark" || theme === "system";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  // Render a placeholder with matching dimensions before hydration
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <span className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={label}
      >
        {isDark ? (
          <Sun className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </Tooltip>
  );
}
