/**
 * @file app/dashboard/components/error-log.tsx
 * @description Error log component for the dashboard.
 * Displays a virtualized, filterable list of errors with expandable details.
 *
 * @module app/dashboard/components/error-log
 */

"use client";

import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ServerCrash,
  Trash2,
  XCircle,
} from "lucide-react";
import * as React from "react";
import useSWR from "swr";
import { useConfirmation } from "@/components/providers/confirmation-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";

// =============================================================================
// TYPES
// =============================================================================

type ErrorType = "rate_limit" | "auth" | "api" | "network" | "unknown";

interface ErrorLogEntry {
  id: string;
  timestamp: string;
  type: ErrorType;
  projectId: string | null;
  projectName: string | null;
  accountId: string | null;
  accountEmail: string | null;
  message: string;
  details: string | null;
  stackTrace: string | null;
}

interface ErrorsResponse {
  errors: ErrorLogEntry[];
  total: number;
}

interface AccountOption {
  value: string;
  label: string;
}

// =============================================================================
// FETCHER
// =============================================================================

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch data");
  }
  return response.json();
}

// =============================================================================
// HELPER FUNCTIONS & CONSTANTS
// =============================================================================

const ERROR_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "rate_limit", label: "Rate Limit" },
  { value: "auth", label: "Authentication" },
  { value: "api", label: "API Error" },
  { value: "network", label: "Network" },
  { value: "unknown", label: "Unknown" },
];

function getErrorTypeBadgeVariant(
  type: ErrorType,
): "red" | "yellow" | "blue" | "orange" | "gray" {
  switch (type) {
    case "rate_limit":
      return "yellow";
    case "auth":
      return "red";
    case "api":
      return "orange";
    case "network":
      return "blue";
    case "unknown":
      return "gray";
    default:
      return "gray";
  }
}

function getErrorTypeIcon(type: ErrorType) {
  switch (type) {
    case "rate_limit":
      return <AlertTriangle className="h-4 w-4" />;
    case "auth":
      return <XCircle className="h-4 w-4" />;
    case "api":
      return <AlertCircle className="h-4 w-4" />;
    case "network":
      return <ServerCrash className="h-4 w-4" />;
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatErrorType(type: ErrorType): string {
  switch (type) {
    case "rate_limit":
      return "Rate Limit";
    case "auth":
      return "Auth";
    case "api":
      return "API";
    case "network":
      return "Network";
    default:
      return "Unknown";
  }
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function ErrorLogSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={`error-skeleton-${i.toString()}`}
          className="flex items-center gap-4 py-3 px-4 rounded-lg border border-border"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// ERROR LOG ITEM
// =============================================================================

interface ErrorLogItemProps {
  error: ErrorLogEntry;
}

function ErrorLogItem({ error }: ErrorLogItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const hasDetails = error.details || error.stackTrace;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-bg-secondary/30 hover:bg-bg-secondary/50 transition-colors">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-4 p-4 text-left"
            disabled={!hasDetails}
            aria-expanded={isOpen}
            aria-label={`Error: ${error.message}`}
          >
            {hasDetails ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-text-tertiary shrink-0" />
              )
            ) : (
              <div className="w-4 shrink-0" />
            )}

            <span className="text-sm text-text-secondary w-32 shrink-0">
              {formatTimestamp(error.timestamp)}
            </span>

            <Badge
              variant={getErrorTypeBadgeVariant(error.type)}
              size="sm"
              className="shrink-0 flex items-center gap-1"
            >
              {getErrorTypeIcon(error.type)}
              {formatErrorType(error.type)}
            </Badge>

            <span className="text-sm text-text-secondary truncate w-32 shrink-0">
              {error.projectName || "-"}
            </span>

            <span className="text-sm text-text-secondary truncate w-40 shrink-0">
              {error.accountEmail || "-"}
            </span>

            <span className="text-sm text-text-primary truncate flex-1">
              {error.message}
            </span>
          </button>
        </CollapsibleTrigger>

        {hasDetails && (
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 ml-8 border-t border-border/50 mt-2">
              {error.details && (
                <div className="mt-3">
                  <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
                    Details
                  </h4>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">
                    {error.details}
                  </p>
                </div>
              )}

              {error.stackTrace && (
                <div className="mt-3">
                  <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
                    Stack Trace
                  </h4>
                  <pre className="text-xs text-text-secondary bg-bg-primary p-3 rounded-md overflow-x-auto font-mono">
                    {error.stackTrace}
                  </pre>
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-green/10 p-4 mb-4">
        <AlertCircle className="h-8 w-8 text-green" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        No errors found
      </h3>
      <p className="text-sm text-text-secondary max-w-sm">
        Great! There are no errors matching your current filters.
      </p>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ErrorLog() {
  const { confirm } = useConfirmation();
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [accountFilter, setAccountFilter] = React.useState("all");
  const [isClearing, setIsClearing] = React.useState(false);

  // Build query params
  const queryParams = new URLSearchParams();
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (accountFilter !== "all") queryParams.set("accountId", accountFilter);

  const queryString = queryParams.toString();
  const apiUrl = queryString
    ? `/api/dashboard/errors?${queryString}`
    : "/api/dashboard/errors";

  const { data, error, isLoading, mutate } = useSWR<ErrorsResponse>(
    apiUrl,
    fetcher,
    {
      refreshInterval: 60000, // Refresh every 60 seconds
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Fetch accounts for filter dropdown
  const { data: accountsData } = useSWR<{
    accounts: { id: string; email: string }[];
  }>("/api/accounts", fetcher);

  const accountOptions: AccountOption[] = React.useMemo(() => {
    const options: AccountOption[] = [{ value: "all", label: "All Accounts" }];
    if (accountsData?.accounts) {
      for (const account of accountsData.accounts) {
        options.push({ value: account.id, label: account.email });
      }
    }
    return options;
  }, [accountsData]);

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
  };

  const handleAccountFilterChange = (value: string) => {
    setAccountFilter(value);
  };

  const handleClearErrors = async () => {
    const confirmed = await confirm({
      title: "Clear Error Log",
      message:
        "Are you sure you want to clear all errors? This action cannot be undone.",
      confirmText: "Clear All",
      cancelText: "Cancel",
      type: "danger",
    });

    if (!confirmed) return;

    setIsClearing(true);
    try {
      const response = await fetch("/api/dashboard/errors", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to clear errors");
      }

      await mutate();
    } catch (_err) {
      // Error handling - could integrate with notification system
    } finally {
      setIsClearing(false);
    }
  };

  const handleRefresh = () => {
    mutate();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Error Log</CardTitle>
            <CardDescription>
              Recent errors and issues from your projects
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Refresh errors">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </Tooltip>
            <Tooltip content="Clear all errors">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearErrors}
                disabled={isClearing || !data?.errors?.length}
                loading={isClearing}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Clear
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-4">
          <div className="w-full sm:w-40">
            <Select
              options={ERROR_TYPE_OPTIONS}
              value={typeFilter}
              onChange={handleTypeFilterChange}
              placeholder="Filter by type"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              options={accountOptions}
              value={accountFilter}
              onChange={handleAccountFilterChange}
              placeholder="Filter by account"
            />
          </div>
          {data?.total !== undefined && (
            <span className="text-sm text-text-secondary ml-auto">
              {data.total} error{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-6">
            <p className="text-sm text-red-500 mb-4">
              Failed to load errors. Please try again.
            </p>
            <Button variant="secondary" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <ErrorLogSkeleton />
        ) : !data?.errors?.length ? (
          <div className="px-6">
            <EmptyState />
          </div>
        ) : (
          <ScrollArea className="h-125">
            <div className="space-y-2 p-4">
              {data.errors.map((errorEntry) => (
                <ErrorLogItem key={errorEntry.id} error={errorEntry} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
