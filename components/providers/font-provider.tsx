/**
 * @file components/providers/font-provider.tsx
 * @description Font provider for system-wide font switching.
 * Allows users to choose between Nunito and Space Mono fonts.
 */

"use client";

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

export type FontFamily = "nunito" | "space-mono";

interface FontContextValue {
  font: FontFamily;
  setFont: (font: FontFamily) => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const FontContext = React.createContext<FontContextValue | null>(null);

const FONT_STORAGE_KEY = `${process.env.GLOBAL_APP_NAME}-font`;

// =============================================================================
// HOOK
// =============================================================================

export function useFont() {
  const context = React.useContext(FontContext);
  if (!context) {
    throw new Error("useFont must be used within FontProvider");
  }
  return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = React.useState<FontFamily>("nunito");
  const [mounted, setMounted] = React.useState(false);

  // Load font preference from localStorage on mount
  React.useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(FONT_STORAGE_KEY);
    if (stored === "nunito" || stored === "space-mono") {
      setFontState(stored);
    }
  }, []);

  // Apply font to body
  React.useEffect(() => {
    if (!mounted) return;

    const fontFamily =
      font === "space-mono"
        ? "var(--font-space-mono), monospace"
        : "var(--font-nunito), sans-serif";

    document.body.style.fontFamily = fontFamily;

    // Also update all elements that need the font
    document.documentElement.style.setProperty("--font-active", fontFamily);
  }, [font, mounted]);

  const setFont = React.useCallback((newFont: FontFamily) => {
    setFontState(newFont);
    localStorage.setItem(FONT_STORAGE_KEY, newFont);
  }, []);

  const value = React.useMemo(() => ({ font, setFont }), [font, setFont]);

  return <FontContext value={value}>{children}</FontContext>;
}
