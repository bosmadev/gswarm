/**
 * @file app/dashboard/layout.tsx
 * @description Dashboard layout with Error Boundary protection.
 * Authentication is handled by middleware or individual page components.
 *
 * @module app/dashboard/layout
 */

"use client";

import type React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

/**
 * Dashboard layout wrapping children with an Error Boundary
 * to prevent runtime errors from crashing the entire dashboard.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
