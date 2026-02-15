"use client";

/**
 * @fileoverview Shared layout component for the application's main UI.
 * Provides a consistent layout structure with a collapsible sidebar
 * navigation with dashboard sub-items.
 *
 * @module SharedLayout
 */

import {
  AlertCircle,
  Cog,
  Command,
  FolderKanban,
  Home,
  Key,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
  Terminal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type React from "react";
import { Suspense, useEffect, useState } from "react";
import { useCommandPalette, useTheme } from "@/components/providers";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Navigation item configuration
 */
interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  section?: string;
}

/**
 * All navigation items including dashboard sub-items
 */
const navItems: NavItem[] = [
  { id: "home", icon: Home, label: "Home", href: "/" },
  {
    id: "overview",
    icon: LayoutDashboard,
    label: "Overview",
    href: "/dashboard",
    section: "Dashboard",
  },
  {
    id: "accounts",
    icon: Users,
    label: "Accounts",
    href: "/dashboard?tab=accounts",
    section: "Dashboard",
  },
  {
    id: "projects",
    icon: FolderKanban,
    label: "Projects",
    href: "/dashboard?tab=projects",
    section: "Dashboard",
  },
  {
    id: "errors",
    icon: AlertCircle,
    label: "Error Log",
    href: "/dashboard?tab=errors",
    section: "Dashboard",
  },
  {
    id: "cli",
    icon: Terminal,
    label: "CLI",
    href: "/dashboard?tab=cli",
    section: "Dashboard",
  },
  {
    id: "api-keys",
    icon: Key,
    label: "API Keys",
    href: "/dashboard?tab=api-keys",
    section: "Dashboard",
  },
  {
    id: "config",
    icon: Cog,
    label: "Configuration",
    href: "/dashboard?tab=config",
    section: "Dashboard",
  },
];

/**
 * Determine active nav item from path and search params
 */
function getActiveId(pathname: string, tabParam: string | null): string {
  if (pathname === "/" || pathname === "/readme") return "home";
  if (pathname.startsWith("/dashboard")) {
    if (tabParam) return tabParam;
    return "overview";
  }
  return "home";
}

/**
 * Shared sidebar content used by desktop aside and mobile sheet
 */
function SidebarContent({
  activeId,
  collapsed,
  onNavClick,
  onToggleCollapse,
}: {
  activeId: string;
  collapsed: boolean;
  onNavClick?: () => void;
  onToggleCollapse?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const { openCommandPalette } = useCommandPalette();
  let currentSection = "";

  return (
    <div className="flex flex-col h-full">
      {/* Logo Section - Click to toggle collapse */}
      <Tooltip
        content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        side="right"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`flex items-center ${collapsed ? "justify-center" : "justify-start gap-2"} p-3 border-b border-border/50 w-full hover:bg-bg-tertiary/30 transition-colors`}
        >
          <div className="w-8 h-8 rounded-lg bg-orange/20 flex items-center justify-center shrink-0">
            <span className="text-orange font-bold text-sm">G</span>
          </div>
          {!collapsed && (
            <span className="font-bold text-base text-text-primary">
              {process.env.GLOBAL_APP_DISPLAY_NAME}
            </span>
          )}
        </button>
      </Tooltip>

      {/* Navigation Items */}
      <nav
        className="flex-1 p-2 space-y-0.5 overflow-y-auto"
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const isActive = item.id === activeId;

          // Render section header for dashboard items
          let sectionHeader: React.ReactNode = null;
          if (item.section && item.section !== currentSection && !collapsed) {
            currentSection = item.section;
            sectionHeader = (
              <div
                key={`section-${item.section}`}
                className="px-3 pt-4 pb-1.5 text-right"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary/70">
                  {item.section}
                </span>
              </div>
            );
          }

          const linkContent = (
            <Link
              key={item.id}
              href={item.href}
              onClick={onNavClick}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg font-medium text-sm transition-all border ${
                collapsed ? "justify-center" : "justify-start"
              } ${
                isActive
                  ? "bg-orange/20 border-orange/50 text-orange"
                  : "bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary hover:border-border/50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon
                className={`w-4.5 h-4.5 shrink-0 ${item.section ? "w-4 h-4" : ""}`}
                aria-hidden="true"
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );

          const wrappedLink =
            collapsed && !isActive ? (
              <Tooltip key={item.id} content={item.label} side="right">
                {linkContent}
              </Tooltip>
            ) : (
              linkContent
            );

          if (sectionHeader) {
            return (
              <div key={item.id}>
                {sectionHeader}
                {wrappedLink}
              </div>
            );
          }

          return wrappedLink;
        })}
      </nav>

      {/* Controls & Version Badge */}
      <div className="p-3 border-t border-border/50 flex flex-col items-center gap-2">
        <div
          className={cn("flex items-center gap-1", collapsed ? "flex-col" : "")}
        >
          <button
            type="button"
            onClick={openCommandPalette}
            className="p-1.5 rounded-md hover:bg-bg-secondary/70 transition-colors"
            aria-label="Open command palette"
          >
            <Command className="w-4 h-4 text-text-secondary" />
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-1.5 rounded-md hover:bg-bg-secondary/70 transition-colors"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-text-secondary" />
            ) : (
              <Moon className="w-4 h-4 text-text-secondary" />
            )}
          </button>
        </div>
        <span
          className="text-xs font-semibold text-orange/80 hover:text-orange transition-colors animate-text-glow"
          title="App version"
        >
          v{process.env.GLOBAL_APP_VERSION}
        </span>
      </div>
    </div>
  );
}

/**
 * SharedLayout component that wraps the main content of the application.
 * It includes a collapsible sidebar navigation.
 */
function SharedLayoutContent({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const tabParam = searchParams.get("tab");
  const activeId = getActiveId(pathname, tabParam);

  // Load sidebar state from localStorage
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(
      `${process.env.GLOBAL_APP_NAME}-sidebar-collapsed`,
    );
    if (stored === "true") {
      setSidebarCollapsed(true);
    }
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        `${process.env.GLOBAL_APP_NAME}-sidebar-collapsed`,
        String(sidebarCollapsed),
      );
    }
  }, [sidebarCollapsed, mounted]);

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      {/* Static background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-br from-bg-primary via-bg-primary to-bg-secondary" />
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 h-full z-90 flex-col transition-[width] duration-200 ease-out border-r border-border/50 bg-bg-primary ${
          sidebarCollapsed ? "w-16" : "w-56"
        }`}
        style={{ backgroundColor: "var(--primary-bg-primary)" }}
      >
        <SidebarContent
          activeId={activeId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Mobile Sidebar Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-56 p-0 bg-bg-elevated/95 backdrop-blur-sm border-border"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            activeId={activeId}
            collapsed={false}
            onNavClick={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-56"
        }`}
      >
        {/* Mobile header with hamburger */}
        <div className="flex md:hidden items-center gap-2 px-4 py-3 border-b border-border bg-bg-elevated/50 relative z-10">
          <button
            type="button"
            className="p-2 rounded-lg border border-border hover:bg-bg-tertiary/50 transition-colors"
            aria-label="Open navigation menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5 text-text-secondary" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange/20 flex items-center justify-center">
              <span className="text-orange font-bold text-xs">G</span>
            </div>
            <span className="font-bold text-sm text-text-primary">
              {process.env.GLOBAL_APP_DISPLAY_NAME}
            </span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6 relative z-10">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex bg-bg-primary">
          <div className="hidden md:block w-56 shrink-0 border-r border-border bg-bg-elevated/50" />
          <div className="flex-1 flex flex-col">
            <div className="h-14 border-b border-border bg-bg-elevated" />
            <main className="flex-1 p-4 md:p-6" />
          </div>
        </div>
      }
    >
      <SharedLayoutContent>{children}</SharedLayoutContent>
    </Suspense>
  );
}
