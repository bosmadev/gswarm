/**
 * @file components/providers/react-grab-provider.tsx
 * @description React Grab integration provider — DEBUG mode only.
 * Loads react-grab overlay, registers custom plugin with orange theme,
 * provides toggle context, and handles Ctrl+Shift+G keyboard shortcut.
 *
 * @module components/providers/react-grab-provider
 */

"use client";

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

interface ReactGrabContextValue {
  /** Whether react-grab overlay is currently active */
  isActive: boolean;
  /** Toggle overlay on/off */
  toggle: () => void;
  /** Activate overlay */
  activate: () => void;
  /** Deactivate overlay */
  deactivate: () => void;
}

/** Global __REACT_GRAB__ API shape (subset we use) */
interface ReactGrabGlobal {
  registerPlugin: (plugin: ReactGrabPlugin) => void;
  unregister?: (name: string) => void;
}

interface ReactGrabPlugin {
  name: string;
  theme?: {
    enabled?: boolean;
    hue?: number;
    selectionBox?: { enabled?: boolean };
    elementLabel?: { enabled?: boolean };
    crosshair?: { enabled?: boolean };
    toolbar?: { enabled?: boolean };
  };
  options?: {
    enabled?: boolean;
    activationMode?: "toggle" | "hold";
    maxContextLines?: number;
    freezeReactUpdates?: boolean;
  };
}

// Extend Window to include __REACT_GRAB__
declare global {
  interface Window {
    __REACT_GRAB__?: ReactGrabGlobal;
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const IS_DEBUG = process.env.GLOBAL_DEBUG_MODE === "true";
const STORAGE_KEY = `${process.env.GLOBAL_APP_NAME ?? "gswarm-api"}-react-grab-enabled`;
const PLUGIN_NAME = "gswarm-grab-plugin";
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 20; // 10 seconds max

/** Orange theme matching project design system */
const PLUGIN_CONFIG: ReactGrabPlugin = {
  name: PLUGIN_NAME,
  theme: {
    enabled: true,
    hue: 25, // orange-600 (#ea580c)
    selectionBox: { enabled: true },
    elementLabel: { enabled: true },
    crosshair: { enabled: true },
    toolbar: { enabled: true },
  },
  options: {
    enabled: true,
    activationMode: "toggle",
    maxContextLines: 20,
    freezeReactUpdates: true,
  },
};

// =============================================================================
// CONTEXT
// =============================================================================

const ReactGrabContext = React.createContext<ReactGrabContextValue | null>(
  null,
);

/** Default no-op context for when provider is not available (prerendering, non-DEBUG) */
const NOOP_CONTEXT: ReactGrabContextValue = {
  isActive: false,
  toggle: () => {},
  activate: () => {},
  deactivate: () => {},
};

/**
 * Hook to access react-grab toggle functionality.
 * Returns no-op values when called outside ReactGrabProvider (e.g. during SSR prerendering).
 */
export function useReactGrab(): ReactGrabContextValue {
  const context = React.useContext(ReactGrabContext);
  return context ?? NOOP_CONTEXT;
}

// =============================================================================
// PROVIDER
// =============================================================================

/**
 * ReactGrabProvider — DEBUG-only provider for react-grab overlay.
 * In non-DEBUG mode, renders children directly with no overhead.
 */
export function ReactGrabProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = React.useState(false);
  const [isRegistered, setIsRegistered] = React.useState(false);

  // Load persisted state from localStorage
  React.useEffect(() => {
    if (!IS_DEBUG) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setIsActive(true);
      }
    } catch {
      // Ignore localStorage errors (SSR, privacy mode, etc.)
    }
  }, []);

  // Persist state to localStorage
  React.useEffect(() => {
    if (!IS_DEBUG) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(isActive));
    } catch {
      // Ignore localStorage errors
    }
  }, [isActive]);

  // Poll for __REACT_GRAB__ global and register plugin
  React.useEffect(() => {
    if (!IS_DEBUG) return;

    let attempts = 0;
    let pollTimer: ReturnType<typeof setInterval>;

    const tryRegister = () => {
      if (window.__REACT_GRAB__) {
        clearInterval(pollTimer);
        try {
          window.__REACT_GRAB__.registerPlugin(PLUGIN_CONFIG);
          setIsRegistered(true);
        } catch {
          // Plugin registration failed — react-grab may not be fully loaded yet
        }
        return;
      }

      attempts++;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(pollTimer);
      }
    };

    // Try immediately, then poll
    tryRegister();
    pollTimer = setInterval(tryRegister, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollTimer);
      // Unregister plugin on unmount
      if (window.__REACT_GRAB__?.unregister) {
        try {
          window.__REACT_GRAB__.unregister(PLUGIN_NAME);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  // Keyboard shortcut: Ctrl+Shift+G to toggle
  React.useEffect(() => {
    if (!IS_DEBUG) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "G" &&
        e.shiftKey &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey
      ) {
        e.preventDefault();
        setIsActive((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync isActive state with react-grab options
  React.useEffect(() => {
    if (!IS_DEBUG || !isRegistered || !window.__REACT_GRAB__) return;

    // Re-register with updated enabled state
    try {
      window.__REACT_GRAB__.registerPlugin({
        ...PLUGIN_CONFIG,
        options: {
          ...PLUGIN_CONFIG.options,
          enabled: isActive,
        },
      });
    } catch {
      // Ignore errors during state sync
    }
  }, [isActive, isRegistered]);

  // Context value
  const contextValue = React.useMemo<ReactGrabContextValue>(
    () => ({
      isActive,
      toggle: () => setIsActive((prev) => !prev),
      activate: () => setIsActive(true),
      deactivate: () => setIsActive(false),
    }),
    [isActive],
  );

  // Always provide context so useReactGrab() never throws.
  // In non-DEBUG mode, the context provides no-op values.
  return <ReactGrabContext value={contextValue}>{children}</ReactGrabContext>;
}
