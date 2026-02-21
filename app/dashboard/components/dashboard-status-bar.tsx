/**
 * @file app/dashboard/components/dashboard-status-bar.tsx
 * @description Top status bar showing GSwarm quota and health information.
 * Auto-refreshes every 30 seconds with manual refresh capability.
 *
 * @module app/dashboard/components/dashboard-status-bar
 */

"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface DashboardStats {
  quotaUsed: number;
  quotaTotal: number;
  usageRatePerHour: number;
  exhaustionTime: string | null;
  healthyProjects: number;
  failedProjects: number;
  lastUpdated: Date;
}

interface ApiResponse {
  success: boolean;
  status: {
    healthy: boolean;
    backend: string;
    model: string;
    projectCount: number;
  };
  quota: {
    used: number;
    capacity: number;
    remaining: number;
    usageRatePerHour: number;
    exhaustsAt: number | null;
    exhaustsIn: string | null;
  };
  metrics: {
    requests: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
  };
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds
const COUNTDOWN_INTERVAL_MS = 1_000; // 1 second

// ============================================================================
// UTILITIES
// ============================================================================

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function formatPercentage(value: number, total: number): string {
  if (total === 0) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

function getQuotaVariant(
  percentage: number,
): "success" | "warning" | "danger" | "default" {
  if (percentage >= 90) return "danger";
  if (percentage >= 75) return "warning";
  if (percentage >= 50) return "default";
  return "success";
}

function formatCurrentTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ============================================================================
// API DATA FETCHER
// ============================================================================

async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await fetch("/api/gswarm/metrics", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // Include cookies for session authentication
    cache: "no-store",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `API request failed with status ${response.status}`,
    );
  }

  const data: ApiResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || "API returned unsuccessful response");
  }

  // Calculate healthy and failed projects based on success rate
  const totalProjects = data.status.projectCount;
  const successRate = data.metrics.requests.successRate;
  const healthyProjects = Math.round((successRate / 100) * totalProjects);
  const failedProjects = totalProjects - healthyProjects;

  return {
    quotaUsed: data.quota.used,
    quotaTotal: data.quota.capacity,
    usageRatePerHour: data.quota.usageRatePerHour,
    exhaustionTime: data.quota.exhaustsIn,
    healthyProjects,
    failedProjects,
    lastUpdated: new Date(),
  };
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatusBarSkeleton() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-elevated px-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex items-center gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-4 w-16" />
      </div>
    </header>
  );
}

interface QuotaDisplayProps {
  used: number;
  total: number;
}

function QuotaDisplay({ used, total }: QuotaDisplayProps) {
  const percentage = total > 0 ? (used / total) * 100 : 0;
  const variant = getQuotaVariant(percentage);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-text-secondary">Quota:</span>
      <div className="flex items-center gap-2">
        <div className="w-32">
          <Progress value={used} max={total} size="sm" variant={variant} />
        </div>
        <span className="text-sm font-mono text-text-primary">
          {formatNumber(used)}/{formatNumber(total)}
        </span>
        <Badge
          variant={
            variant === "success"
              ? "green"
              : variant === "warning"
                ? "yellow"
                : variant === "danger"
                  ? "red"
                  : "orange"
          }
          size="sm"
        >
          {formatPercentage(used, total)}%
        </Badge>
      </div>
    </div>
  );
}

interface UsageRateDisplayProps {
  rate: number;
}

function UsageRateDisplay({ rate }: UsageRateDisplayProps) {
  return (
    <div className="flex items-center gap-2">
      <Zap className="h-4 w-4 text-orange" aria-hidden="true" />
      <span className="text-sm text-text-secondary">Rate:</span>
      <span className="text-sm font-mono text-text-primary">
        {formatNumber(rate)}/hr
      </span>
    </div>
  );
}

interface ExhaustionDisplayProps {
  exhaustionTime: string | null;
  usageRate: number;
  quotaRemaining: number;
}

function ExhaustionDisplay({
  exhaustionTime,
  usageRate,
  quotaRemaining,
}: ExhaustionDisplayProps) {
  const tooltipContent = exhaustionTime ? (
    <div className="space-y-1 text-xs">
      <p>
        <strong>Calculation:</strong>
      </p>
      <p>Remaining: {formatNumber(quotaRemaining)} tokens</p>
      <p>Rate: {formatNumber(usageRate)}/hour</p>
      <p>
        Time: {quotaRemaining} / {usageRate} ={" "}
        {usageRate > 0 ? (quotaRemaining / usageRate).toFixed(2) : "N/A"} hours
      </p>
    </div>
  ) : (
    "Usage rate too low to predict exhaustion"
  );

  return (
    <Tooltip content={tooltipContent} side="bottom">
      <div className="flex cursor-help items-center gap-2">
        <Clock className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        {exhaustionTime ? (
          <>
            <span className="text-sm text-text-secondary">Exhausts in</span>
            <Badge variant="yellow" size="sm">
              {exhaustionTime}
            </Badge>
          </>
        ) : (
          <span className="text-sm text-green">No exhaustion predicted</span>
        )}
      </div>
    </Tooltip>
  );
}

interface ProjectHealthDisplayProps {
  healthy: number;
  failed: number;
}

function ProjectHealthDisplay({ healthy, failed }: ProjectHealthDisplayProps) {
  const hasFailures = failed > 0;

  return (
    <div className="flex items-center gap-2">
      <Activity className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      <span className="text-sm text-text-secondary">Projects:</span>
      <div className="flex items-center gap-1.5">
        <CheckCircle className="h-3.5 w-3.5 text-green" aria-hidden="true" />
        <span className="text-sm font-mono text-green">{healthy}</span>
        <span className="text-sm text-text-tertiary">healthy</span>
      </div>
      {hasFailures && (
        <>
          <span className="text-text-tertiary">/</span>
          <div className="flex items-center gap-1.5">
            <AlertTriangle
              className="h-3.5 w-3.5 text-red"
              aria-hidden="true"
            />
            <span className="text-sm font-mono text-red">{failed}</span>
            <span className="text-sm text-text-tertiary">failed</span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// COUNTDOWN TIMER — isolated so parent doesn't re-render on every tick
// ============================================================================

interface CountdownTimerProps {
  /** Total seconds between refreshes (resets when this prop changes) */
  totalSeconds: number;
  /** Called each time the countdown resets to 0 — parent triggers a refresh */
  onExpire?: () => void;
}

/**
 * Renders a live countdown and calls `onExpire` when it hits zero.
 * Owns its own interval so the parent component never re-renders on tick.
 */
function CountdownTimer({ totalSeconds, onExpire }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds);

  // Reset when totalSeconds changes (e.g. after a manual refresh)
  useEffect(() => {
    setRemaining(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onExpire?.();
          return totalSeconds;
        }
        return prev - 1;
      });
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [totalSeconds, onExpire]);

  return <>{remaining}</>;
}

// ============================================================================
// REFRESH BUTTON — receives a render-stable onRefresh ref
// ============================================================================

interface RefreshButtonProps {
  totalSeconds: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function RefreshButton({
  totalSeconds,
  isRefreshing,
  onRefresh,
}: RefreshButtonProps) {
  return (
    <Tooltip
      content={
        <>
          Auto-refresh in{" "}
          <CountdownTimer totalSeconds={totalSeconds} />s. Click to refresh now.
        </>
      }
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label={isRefreshing ? "Refreshing..." : "Refresh dashboard"}
      >
        <RefreshCw
          className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}

function ClockDisplay() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    // Set initial time
    setTime(formatCurrentTime());

    // Update every second
    const interval = setInterval(() => {
      setTime(formatCurrentTime());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!time) {
    return <Skeleton className="h-4 w-16" />;
  }

  return (
    // aria-live="off": clock is decorative, announcing every second floods screen readers
    <span className="font-mono text-sm text-text-secondary" aria-live="off">
      {time}
    </span>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DashboardStatusBar() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchDashboardStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh interval — CountdownTimer drives the visual countdown independently
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats(true);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleManualRefresh = useCallback(() => {
    fetchStats(true);
  }, [fetchStats]);

  if (isLoading) {
    return <StatusBarSkeleton />;
  }

  if (error) {
    return (
      <header className="flex h-14 items-center justify-between border-b border-border bg-bg-elevated px-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-orange">
            GSwarm Admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red" aria-hidden="true" />
          <span className="text-sm text-red">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")}
            />
            Retry
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ClockDisplay />
        </div>
      </header>
    );
  }

  if (!stats) {
    return <StatusBarSkeleton />;
  }

  const quotaRemaining = stats.quotaTotal - stats.quotaUsed;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-elevated px-4">
      {/* Logo / Title */}
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold text-orange">GSwarm Admin</span>
      </div>

      {/* Stats Section */}
      <div className="flex items-center gap-6">
        <QuotaDisplay used={stats.quotaUsed} total={stats.quotaTotal} />

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <UsageRateDisplay rate={stats.usageRatePerHour} />

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <ExhaustionDisplay
          exhaustionTime={stats.exhaustionTime}
          usageRate={stats.usageRatePerHour}
          quotaRemaining={quotaRemaining}
        />

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <ProjectHealthDisplay
          healthy={stats.healthyProjects}
          failed={stats.failedProjects}
        />
      </div>

      {/* Actions Section */}
      <div className="flex items-center gap-3">
        <RefreshButton
          totalSeconds={REFRESH_INTERVAL_MS / 1000}
          isRefreshing={isRefreshing}
          onRefresh={handleManualRefresh}
        />
        <ThemeToggle />
        <ClockDisplay />
      </div>
    </header>
  );
}
