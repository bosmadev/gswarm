/**
 * @file app/dashboard/components/metrics-charts.tsx
 * @description Dashboard metrics charts component displaying request and token usage over time.
 * Client component using recharts for visualization.
 *
 * @module app/dashboard/components/metrics-charts
 */

"use client";

import * as React from "react";
import {
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
} from "recharts";
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
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

/**
 * Loading skeleton for charts
 */
function ChartSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-64 w-full" />
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
      </CardContent>
    </Card>
  );
}

/**
 * MetricsCharts component - displays all usage tracking charts
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
          <p className="text-red">Failed to load metrics: {error}</p>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RequestsChart data={data} />
          <ErrorRateChart data={data} />
          <TokensChart data={data} />
          <ResponseTimeChart data={data} />
        </div>
      )}
    </div>
  );
}
