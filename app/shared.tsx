"use client";

/**
 * @fileoverview Shared layout component for the application's main UI.
 * This component provides a consistent layout structure including a status bar
 * and a collapsible sidebar navigation.
 *
 * @module SharedLayout
 */

import { FileText, Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers";
import { StatusBar } from "@/components/topbar";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Defines the available tab types for navigation.
 */
type TabType = "home" | "readme" | "settings";

/**
 * Props for the SidebarButton component.
 */
interface SidebarButtonProps {
  tab: TabType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  activeTab: TabType;
  href: string;
  collapsed: boolean;
}

/**
 * A button component representing a navigation item in the sidebar.
 */
const SidebarButton = ({
  tab,
  icon: Icon,
  label,
  activeTab,
  href,
  collapsed,
}: SidebarButtonProps): React.ReactElement => {
  const isActive = activeTab === tab;

  const linkContent = (
    <Link
      href={href}
      prefetch
      scroll={false}
      className={`
        flex items-center gap-3 w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all
        ${collapsed ? "justify-center" : "justify-start"}
        ${
          isActive
            ? "bg-brand/20 border border-brand/50 text-brand shadow-lg shadow-brand/10"
            : "bg-transparent border border-transparent text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary hover:border-border/50"
        }
      `}
    >
      <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-brand" : ""}`} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip content={label} side="right">
        {linkContent}
      </Tooltip>
    );
  }

  return linkContent;
};

/**
 * Determines the active tab based on the current pathname.
 */
const getTabFromPath = (path: string): TabType => {
  const pathParts = path.split("/").filter(Boolean);
  const firstPart = pathParts[0];

  switch (firstPart) {
    case "readme":
      return "readme";
    case "settings":
      return "settings";
    default:
      return "home";
  }
};

/**
 * Navigation items configuration
 */
const navItems: {
  tab: TabType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { tab: "home", icon: Home, label: "Home" },
  { tab: "readme", icon: FileText, label: "README" },
  { tab: "settings", icon: Settings, label: "Settings" },
];

/**
 * SharedLayout component that wraps the main content of the application.
 * It includes the StatusBar and a collapsible sidebar navigation.
 */
export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const activeTab = getTabFromPath(pathname);

  // Load sidebar state from localStorage
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("app-sidebar-collapsed");
    if (stored === "true") {
      setSidebarCollapsed(true);
    }
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("app-sidebar-collapsed", String(sidebarCollapsed));
    }
  }, [sidebarCollapsed, mounted]);

  const isDark = theme === "dark" || theme === "system";

  return (
    <div
      className="min-h-screen relative overflow-hidden flex"
      style={{
        background: isDark
          ? "linear-gradient(135deg, #0b0e11 0%, #0d1116 50%, #0f1318 100%)"
          : "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%)",
      }}
    >
      {/* Animated background gradient effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {isDark ? (
          <>
            <div
              className="absolute -top-32 -left-32 w-225 h-225 rounded-full blur-[100px] animate-pulse"
              style={{
                animationDuration: "8s",
                background:
                  "radial-gradient(circle, rgba(100, 116, 139, 0.2) 0%, rgba(100, 116, 139, 0.08) 50%, transparent 70%)",
              }}
            />
            <div
              className="absolute -bottom-32 -right-32 w-200 h-200 rounded-full blur-[100px] animate-pulse"
              style={{
                animationDuration: "10s",
                animationDelay: "2s",
                background:
                  "radial-gradient(circle, rgba(56, 97, 251, 0.15) 0%, rgba(147, 51, 234, 0.08) 50%, transparent 70%)",
              }}
            />
            <div
              className="absolute top-1/2 -left-32 w-150 h-150 rounded-full blur-[80px] animate-pulse"
              style={{
                animationDuration: "12s",
                animationDelay: "4s",
                background:
                  "radial-gradient(circle, rgba(14, 203, 129, 0.1) 0%, transparent 60%)",
              }}
            />
            {/* Subtle dot pattern overlay */}
            <div
              className="absolute inset-0 opacity-[0.02]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(100, 116, 139, 0.3) 1px, transparent 0)",
                backgroundSize: "32px 32px",
              }}
            />
          </>
        ) : (
          <>
            <div
              className="absolute -top-32 -left-32 w-225 h-225 rounded-full blur-[120px] animate-pulse"
              style={{
                animationDuration: "8s",
                background:
                  "radial-gradient(circle, rgba(100, 116, 139, 0.1) 0%, rgba(100, 116, 139, 0.04) 50%, transparent 70%)",
              }}
            />
            <div
              className="absolute -bottom-32 -right-32 w-200 h-200 rounded-full blur-[120px] animate-pulse"
              style={{
                animationDuration: "10s",
                animationDelay: "2s",
                background:
                  "radial-gradient(circle, rgba(56, 97, 251, 0.08) 0%, rgba(147, 51, 234, 0.04) 50%, transparent 70%)",
              }}
            />
            {/* Subtle dot pattern overlay */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.15) 1px, transparent 0)",
                backgroundSize: "32px 32px",
              }}
            />
          </>
        )}
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed left-0 top-0 h-full z-90 flex flex-col transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "w-16" : "w-56"
        }`}
        style={{
          background: isDark
            ? "rgba(24, 26, 32, 0.95)"
            : "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          borderRight: `1px solid ${isDark ? "rgba(43, 49, 57, 0.5)" : "rgba(209, 213, 219, 0.5)"}`,
        }}
      >
        {/* Logo Section - Clickable to toggle sidebar */}
        <Tooltip
          content={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          side="right"
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-start gap-2"} p-3 border-b border-border/50 w-full hover:bg-bg-tertiary/30 transition-colors`}
          >
            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center shrink-0">
              <span className="text-brand font-bold text-sm">N</span>
            </div>
            {!sidebarCollapsed && (
              <span className="font-bold text-base text-text-primary">
                Next.js
              </span>
            )}
          </button>
        </Tooltip>

        {/* Navigation Items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <SidebarButton
              key={item.tab}
              tab={item.tab}
              icon={item.icon}
              label={item.label}
              activeTab={activeTab}
              href={item.tab === "home" ? "/" : `/${item.tab}`}
              collapsed={sidebarCollapsed}
            />
          ))}
        </nav>

        {/* Version Badge */}
        <div
          className={`p-3 border-t border-border/50 flex ${sidebarCollapsed ? "justify-center" : "justify-center"}`}
        >
          <span
            className="text-xs font-medium text-text-tertiary/70 hover:text-text-secondary transition-colors"
            title="App version"
          >
            v1.0.0
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "ml-16" : "ml-56"
        }`}
      >
        <StatusBar />

        <main className="flex-1 p-6 relative z-10">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Content - Smooth Page Transition */}
            <div className="animate-in slide-in-from-top-2 duration-300">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
