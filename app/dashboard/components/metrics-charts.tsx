/**
 * @file app/dashboard/components/metrics-charts.tsx
 * @description Dashboard metrics charts component displaying request and token usage over time.
 * Client component using recharts for visualization.
 * Recharts is lazy-loaded to avoid bundling ~200-300 KB when the Overview tab isn't active.
 *
 * @module app/dashboard/components/metrics-charts
 */

"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Metrics data point from API */
interface MetricsDataPoint {
  date: string;
  requests: number;
  successful: number;
  failed: number;
  errorRate: number;
  avgDurationMs: number;
  tokensUsed: number;
}

/** API response structure */
interface MetricsResponse {
  data: MetricsDataPoint[];
  period: {
    start: string;
    end: string;
    days: number;
  };
}

// Chart colors matching the orange theme
const CHART_COLORS = {
  requests: "#ea580c", // orange-600
  successful: "#16a34a", // green-600
  failed: "#dc2626", // red-600
  tokens: "#8b5cf6", // violet-500
  duration: "#0ea5e9", // sky-500
};

/**
 * Format date for chart axis
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format large numbers
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

// ============================================================================
// LAZY-LOADED CHARTS (recharts is only imported when these render)
// ============================================================================

/**
 * Lazy-loaded chart grid that contains all recharts-dependent components.
 * Recharts is dynamically imported only when this component mounts.
 */
const LazyChartGrid = React.lazy(() =>
  import("recharts").then((recharts) => {
    const {
      Area,
      AreaChart,
      Bar,
      BarChart,
      CartesianGrid,
      Legend,
      ResponsiveContainer,
      Tooltip,
      XAxis,
      YAxis,
    } = recharts;

    /**
     * Custom tooltip component
     */
    function CustomTooltip({
      active,
      payload,
      label,
    }: {
      active?: boolean;
      payload?: { color: string; name: string; value: number }[];
      label?: string;
    }) {
      if (!active || !payload?.length) return null;

      return (
        <div className="bg-bg-primary border border-border rounded-lg p-3 shadow-lg">
          <p className="text-text-secondary text-sm mb-2">{label}</p>
          {payload.map((entry) => (
            <p
              key={entry.name}
              className="text-sm"
              style={{ color: entry.color }}
            >
              {entry.name}: {formatNumber(entry.value)}
            </p>
          ))}
        </div>
      );
    }

    /**
     * Requests chart showing successful vs failed requests
     */
    function RequestsChart({ data }: { data: MetricsDataPoint[] }) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">API Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              tabIndex={-1}
              aria-hidden="true"
              role="img"
              aria-label="Bar chart showing successful and failed API requests over time"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <YAxis
                    tickFormatter={formatNumber}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="successful"
                    name="Successful"
                    fill={CHART_COLORS.successful}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    name="Failed"
                    fill={CHART_COLORS.failed}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    /**
     * Error rate chart
     */
    function ErrorRateChart({ data }: { data: MetricsDataPoint[] }) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Error Rate (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              tabIndex={-1}
              aria-hidden="true"
              role="img"
              aria-label="Area chart showing API error rate percentage over time"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="errorRate"
                    name="Error Rate"
                    stroke={CHART_COLORS.failed}
                    fill={CHART_COLORS.failed}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    /**
     * Tokens used chart
     */
    function TokensChart({ data }: { data: MetricsDataPoint[] }) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tokens Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              tabIndex={-1}
              aria-hidden="true"
              role="img"
              aria-label="Area chart showing token usage over time"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <YAxis
                    tickFormatter={formatNumber}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tokensUsed"
                    name="Tokens"
                    stroke={CHART_COLORS.tokens}
                    fill={CHART_COLORS.tokens}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    /**
     * Average response time chart
     */
    function ResponseTimeChart({ data }: { data: MetricsDataPoint[] }) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Avg Response Time (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              tabIndex={-1}
              aria-hidden="true"
              role="img"
              aria-label="Area chart showing average API response time in milliseconds over time"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}ms`}
                    stroke="#71717a"
                    fontSize={12}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="avgDurationMs"
                    name="Avg Duration"
                    stroke={CHART_COLORS.duration}
                    fill={CHART_COLORS.duration}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    /**
     * Chart grid component that renders all four charts.
     * This is the default export consumed by React.lazy.
     */
    function ChartGrid({ data }: { data: MetricsDataPoint[] }) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RequestsChart data={data} />
          <ErrorRateChart data={data} />
          <TokensChart data={data} />
          <ResponseTimeChart data={data} />
        </div>
      );
    }

    return { default: ChartGrid };
  }),
);

// ============================================================================
// SKELETON / LOADING STATES
// ============================================================================

/**
 * Loading skeleton for the chart grid.
 * Used as Suspense fallback while recharts loads and as loading state during data fetch.
 */
function ChartGridSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {["requests", "errors", "tokens", "response-time"].map((name) => (
        <div key={name} className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for the entire MetricsCharts section.
 * Exported for use as a Suspense fallback when this module itself is lazy-loaded.
 */
// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * MetricsCharts component - displays all usage tracking charts.
 * Recharts is lazy-loaded on first render, keeping the initial bundle small.
 */
export function MetricsCharts() {
  const [data, setData] = React.useState<MetricsDataPoint[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState("7");

  React.useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/dashboard/metrics?days=${days}`);
        if (!response.ok) {
          throw new Error("Failed to fetch metrics");
        }
        const result: MetricsResponse = await response.json();
        setData(result.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [days]);

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-500">Failed to load metrics: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          Usage Analytics
        </h3>
        <Select
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "14", label: "Last 14 days" },
            { value: "30", label: "Last 30 days" },
          ]}
          value={days}
          onChange={setDays}
          placeholder="Select period"
          size="sm"
          className="w-[140px]"
        />
      </div>

      {isLoading ? (
        <ChartGridSkeleton />
      ) : (
        <React.Suspense fallback={<ChartGridSkeleton />}>
          <LazyChartGrid data={data} />
        </React.Suspense>
      )}
    </div>
  );
}
