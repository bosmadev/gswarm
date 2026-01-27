/**
 * @file app/dashboard/components/dashboard-tabs.tsx
 * @description Dashboard tabs component with tabbed interface for different sections.
 * Client component that handles tab navigation and content rendering.
 *
 * @module app/dashboard/components/dashboard-tabs
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
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsSection } from "./accounts-section";
import { APIKeysSection } from "./api-keys-section";
import { CLICommandsPanel } from "./cli-commands-panel";
import { ConfigurationPanel } from "./configuration-panel";
import { ErrorLog } from "./error-log";
import { MetricsCharts } from "./metrics-charts";
import { ProjectsTable } from "./projects-table";

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

const tabConfig = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "errors", label: "Error Log", icon: AlertCircle },
  { id: "cli", label: "CLI", icon: Terminal },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "config", label: "Configuration", icon: Cog },
] as const;

type TabId = (typeof tabConfig)[number]["id"];

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function OverviewTab() {
  const [stats, setStats] = React.useState<{
    totalAccounts: number;
    activeProjects: number;
    apiRequestsToday: number;
    errorRate: number;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/dashboard/stats");
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard stats");
        }
        const data = await response.json();
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return <TabContentSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-red mb-4">Failed to load dashboard stats</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-text-primary">
        Dashboard Overview
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-secondary">
              Total Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-text-primary">
              {stats?.totalAccounts ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-secondary">
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-text-primary">
              {stats?.activeProjects ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-secondary">
              API Requests Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-text-primary">
              {stats?.apiRequestsToday.toLocaleString() ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-text-secondary">
              Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green">
              {stats?.errorRate.toFixed(2) ?? 0}%
            </p>
          </CardContent>
        </Card>
      </div>
      <MetricsCharts />
    </div>
  );
}

function TabContentSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton key="skeleton-1" className="h-24" />
        <Skeleton key="skeleton-2" className="h-24" />
        <Skeleton key="skeleton-3" className="h-24" />
        <Skeleton key="skeleton-4" className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

// ============================================================================
// TAB CONTENT MAPPING
// ============================================================================

const tabComponents: Record<TabId, React.ComponentType> = {
  overview: OverviewTab,
  accounts: AccountsSection,
  projects: ProjectsTable,
  errors: ErrorLog,
  cli: CLICommandsPanel,
  "api-keys": APIKeysSection,
  config: ConfigurationPanel,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function DashboardTabsContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultTab: TabId =
    tabParam && tabConfig.some((t) => t.id === tabParam)
      ? (tabParam as TabId)
      : "overview";

  return (
    <div className="space-y-6">
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-bg-secondary/50 border border-border/50 rounded-lg">
          {tabConfig.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-orange/20 data-[state=active]:text-orange data-[state=active]:border-orange/50"
            >
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map((tab) => {
          const TabComponent = tabComponents[tab.id];
          return (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              <Suspense fallback={<TabContentSkeleton />}>
                <TabComponent />
              </Suspense>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

/**
 * DashboardTabs component with tabbed interface.
 * Wraps content in Suspense for search params access.
 */
export function DashboardTabs() {
  return (
    <Suspense fallback={<TabContentSkeleton />}>
      <DashboardTabsContent />
    </Suspense>
  );
}
