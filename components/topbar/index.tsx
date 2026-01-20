"use client";

import { Command, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useCommandPalette, useTheme } from "@/components/providers";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * StatusBar component - A simple topbar with theme toggle, command palette, and clock.
 * Generic version without application-specific service status indicators.
 */
export function StatusBar() {
  const { openCommandPalette } = useCommandPalette();
  const { theme, setTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState<string>("");

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-(--primary-bg-elevated)/90 backdrop-blur-md border-b border-(--primary-border)/60 px-4 py-2.5 relative z-100 shadow-sm">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left side - App title or breadcrumbs */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">
            Next.js Template
          </span>
        </div>

        {/* Right side - Controls */}
        <div className="flex items-center gap-3">
          {/* Command Palette */}
          <Tooltip content="Open command palette">
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--primary-bg-secondary)/50 border border-(--primary-border)/40 hover:bg-(--primary-bg-secondary)/70 hover:border-(--primary-border)/60 transition-colors text-text-secondary hover:text-text-primary"
            >
              <Command className="w-3 h-3" />
              <span className="text-xs font-mono">
                {typeof navigator !== "undefined" &&
                navigator.userAgent.includes("Mac")
                  ? "\u2318K"
                  : "Ctrl+K"}
              </span>
            </button>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip
            content={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 rounded-md bg-(--primary-bg-secondary)/50 border border-(--primary-border)/40 hover:bg-(--primary-bg-secondary)/70 hover:border-(--primary-border)/60 transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-text-secondary" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-text-secondary" />
              )}
            </button>
          </Tooltip>

          {/* Clock */}
          <div className="text-xs text-text-secondary font-mono">
            {currentTime}
          </div>
        </div>
      </div>
    </div>
  );
}
