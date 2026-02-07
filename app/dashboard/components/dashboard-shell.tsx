/**
 * @file app/dashboard/components/dashboard-shell.tsx
 * @description Dashboard shell component - content wrapper.
 * Sidebar navigation is handled by SharedLayout.
 *
 * @module app/dashboard/components/dashboard-shell
 */

"use client";

import { type ReactNode, memo } from "react";
import { DashboardStatusBar } from "./dashboard-status-bar";

/**
 * DashboardShell component - Provides the dashboard content area with status bar.
 * Navigation is handled by the unified SharedLayout sidebar.
 *
 * Wrapped with React.memo to avoid re-renders when the parent re-renders
 * but children have not changed.
 */
export const DashboardShell = memo(function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      {/* Compact Status Bar */}
      <DashboardStatusBar />

      {/* Page Content */}
      {children}
    </div>
  );
});
