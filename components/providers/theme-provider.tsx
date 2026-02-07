/**
 * @file components/providers/theme-provider.tsx
 * @description Theme provider component for dark/light mode switching.
 * Uses localStorage to persist theme preference.
 *
 * @module components/providers/theme-provider
 */

"use client";

import * as React from "react";

type Theme = "dark" | "light" | "system";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = `${process.env.GLOBAL_APP_NAME}-ui-theme`,
}: ThemeProviderProps) {
  const [theme, setTheme] = React.useState<Theme>(defaultTheme);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(storageKey) as Theme | null;
    if (stored) {
      setTheme(stored);
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (!mounted) return;

    const root = window.document.documentElement;
    const body = window.document.body;

    root.classList.remove("light", "dark");
    body.classList.remove("light", "dark");

    let resolvedTheme: "light" | "dark";
    if (theme === "system") {
      resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      resolvedTheme = theme;
    }

    root.classList.add(resolvedTheme);
    body.classList.add(resolvedTheme);

    // Also set data-theme attribute for CSS variable switching
    root.setAttribute("data-theme", resolvedTheme);
    body.setAttribute("data-theme", resolvedTheme);

    localStorage.setItem(storageKey, theme);
  }, [theme, mounted, storageKey]);

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme],
  );

  // Prevent hydration mismatch by rendering with default theme until mounted
  if (!mounted) {
    return (
      <ThemeProviderContext value={value}>{children}</ThemeProviderContext>
    );
  }

  return <ThemeProviderContext value={value}>{children}</ThemeProviderContext>;
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
