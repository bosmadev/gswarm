/**
 * @file app/dashboard/components/dashboard-shell.tsx
 * @description Dashboard shell component with sidebar navigation.
 * Client component that provides the dashboard layout structure.
 *
 * @module app/dashboard/components/dashboard-shell
 */

"use client";

import {
  AlertCircle,
  Cog,
  FolderKanban,
  Home,
  Key,
  Terminal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type React from "react";
import { Suspense } from "react";
import { DashboardStatusBar } from "./dashboard-status-bar";

/**
 * Navigation items for the dashboard sidebar
 */
const navItems = [
  { id: "overview", label: "Overview", icon: Home, href: "/dashboard" },
  {
    id: "accounts",
    label: "Accounts",
    icon: Users,
    href: "/dashboard?tab=accounts",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    href: "/dashboard?tab=projects",
  },
  {
    id: "errors",
    label: "Error Log",
    icon: AlertCircle,
    href: "/dashboard?tab=errors",
  },
  { id: "cli", label: "CLI", icon: Terminal, href: "/dashboard?tab=cli" },
  {
    id: "api-keys",
    label: "API Keys",
    icon: Key,
    href: "/dashboard?tab=api-keys",
  },
  {
    id: "config",
    label: "Configuration",
    icon: Cog,
    href: "/dashboard?tab=config",
  },
];

interface SidebarProps {
  activeTab: string;
}

function Sidebar({ activeTab }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-bg-elevated/50 backdrop-blur-sm">
      <div className="flex flex-col h-full">
        {/* Logo Section */}
        <div className="flex items-center gap-2 p-4 border-b border-border/50">
          <div className="w-8 h-8 rounded-lg bg-orange/20 flex items-center justify-center">
            <span className="text-orange font-bold text-sm">G</span>
          </div>
          <span className="font-bold text-base text-text-primary">GSwarm</span>
        </div>

        {/* Navigation Items */}
        <nav
          className="flex-1 p-2 space-y-1 overflow-y-auto"
          aria-label="Dashboard navigation"
        >
          {navItems.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all border ${
                  isActive
                    ? "bg-orange/20 border-orange/50 text-orange"
                    : "bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary hover:border-border/50"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Version Badge */}
        <div className="p-3 border-t border-border/50 flex justify-center">
          <span className="text-xs font-medium text-text-tertiary/70">
            v1.0.0
          </span>
        </div>
      </div>
    </aside>
  );
}

function DashboardShellContent({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam || "overview";

  return (
    <div className="min-h-screen flex bg-bg-primary">
      <Sidebar activeTab={activeTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Status Bar */}
        <DashboardStatusBar />

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * DashboardShell component - Provides the dashboard layout with sidebar and status bar.
 * Wraps children in proper layout structure.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex bg-bg-primary">
          <div className="w-56 shrink-0 border-r border-border bg-bg-elevated/50" />
          <div className="flex-1 flex flex-col">
            <div className="h-14 border-b border-border bg-bg-elevated" />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      }
    >
      <DashboardShellContent>{children}</DashboardShellContent>
    </Suspense>
  );
}
