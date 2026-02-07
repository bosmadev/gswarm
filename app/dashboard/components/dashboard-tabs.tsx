/**
 * @file app/dashboard/components/dashboard-tabs.tsx
 * @description Dashboard tabs component with tabbed interface for different sections.
 * Client component that handles tab navigation and content rendering.
 *
 * @module app/dashboard/components/dashboard-tabs
 */

"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";

const AccountsSection = React.lazy(() =>
  import("./accounts-section").then((m) => ({ default: m.AccountsSection })),
);
const APIKeysSection = React.lazy(() =>
  import("./api-keys-section").then((m) => ({ default: m.APIKeysSection })),
);
const CLICommandsPanel = React.lazy(() =>
  import("./cli-commands-panel").then((m) => ({ default: m.CLICommandsPanel })),
);
const ConfigurationPanel = React.lazy(() =>
  import("./configuration-panel").then((m) => ({
    default: m.ConfigurationPanel,
  })),
);
const ErrorLog = React.lazy(() =>
  import("./error-log").then((m) => ({ default: m.ErrorLog })),
);
const MetricsCharts = React.lazy(() =>
  import("./metrics-charts").then((m) => ({ default: m.MetricsCharts })),
);
const ProjectsTable = React.lazy(() =>
  import("./projects-table").then((m) => ({ default: m.ProjectsTable })),
);

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

const tabConfig = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "projects", label: "Projects" },
  { id: "errors", label: "Error Log" },
  { id: "cli", label: "CLI" },
  { id: "api-keys", label: "API Keys" },
  { id: "config", label: "Configuration" },
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
        <p className="text-sm text-red-500 mb-4">
          Failed to load dashboard stats
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-text-primary">
        Dashboard Overview
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
            <p className="text-2xl font-bold text-green-500">
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
  const activeTab: TabId =
    tabParam && tabConfig.some((t) => t.id === tabParam)
      ? (tabParam as TabId)
      : "overview";

  return (
    <div className="space-y-6">
      {(() => {
        const tab = tabConfig.find((t) => t.id === activeTab) ?? tabConfig[0];
        const TabComponent = tabComponents[tab.id];
        return (
          <ErrorBoundary
            fallbackRender={({ error, resetErrorBoundary }) => (
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive">
                    {tab.label} failed to load
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {error.message}
                  </p>
                  <button
                    type="button"
                    onClick={resetErrorBoundary}
                    className="text-sm text-orange hover:underline"
                  >
                    Try again
                  </button>
                </CardContent>
              </Card>
            )}
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <TabComponent />
            </Suspense>
          </ErrorBoundary>
        );
      })()}
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
