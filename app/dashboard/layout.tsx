/**
 * @file app/dashboard/layout.tsx
 * @description Dashboard layout - simple wrapper that passes children through.
 * Authentication is handled by middleware or individual page components.
 *
 * @module app/dashboard/layout
 */

import type React from "react";

/**
 * Dashboard layout - minimal wrapper.
 * The actual dashboard chrome (sidebar, status bar) is in the page components.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
