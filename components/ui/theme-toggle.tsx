/**
 * @file components/ui/theme-toggle.tsx
 * @description Theme toggle button for switching between dark and light modes.
 *
 * @module components/ui/theme-toggle
 */

"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

/**
 * ThemeToggle component for switching between dark and light themes.
 * Displays a sun icon in dark mode and moon icon in light mode.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-orange focus:ring-offset-2 focus:ring-offset-bg-primary",
        className,
      )}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

/**
 * ThemeToggleWithLabel component - theme toggle with visible label.
 */
export function ThemeToggleWithLabel({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="text-sm text-text-secondary">Theme</span>
      <div className="flex rounded-lg border border-border bg-bg-secondary p-1">
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            theme === "light"
              ? "bg-orange text-bg-primary"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Sun className="h-3.5 w-3.5" />
          Light
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            theme === "dark"
              ? "bg-orange text-bg-primary"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Moon className="h-3.5 w-3.5" />
          Dark
        </button>
      </div>
    </div>
  );
}
