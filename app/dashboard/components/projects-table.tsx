/**
 * @file app/dashboard/components/projects-table.tsx
 * @description Projects table component for the dashboard.
 * Displays a sortable, filterable, paginated table of projects.
 *
 * @module app/dashboard/components/projects-table
 */

"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import * as React from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";

// =============================================================================
// TYPES
// =============================================================================

type ProjectStatus = "active" | "cooldown" | "disabled" | "error";

type SortField =
  | "id"
  | "name"
  | "owner"
  | "apiEnabled"
  | "status"
  | "successCount"
  | "errorCount"
  | "lastUsed";

type SortDirection = "asc" | "desc";

interface Project {
  id: string;
  name: string;
  owner: string;
  apiEnabled: boolean;
  status: ProjectStatus;
  successCount: number;
  errorCount: number;
  lastUsed: string | null;
}

interface ProjectsResponse {
  projects: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
// HELPER FUNCTIONS
// =============================================================================

function getStatusBadgeVariant(
  status: ProjectStatus,
): "green" | "yellow" | "gray" | "red" {
  switch (status) {
    case "active":
      return "green";
    case "cooldown":
      return "yellow";
    case "disabled":
      return "gray";
    case "error":
      return "red";
    default:
      return "gray";
  }
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hr ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function ProjectsTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={`project-skeleton-${i.toString()}`}
          className="flex items-center gap-4 py-3 px-4"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-24 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// SORTABLE HEADER
// =============================================================================

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDirection: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}

function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = currentSort === field;

  const handleClick = () => {
    onSort(field);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSort(field);
    }
  };

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {isActive ? (
          currentDirection === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

// =============================================================================
// PROJECT ROW
// =============================================================================

interface ProjectRowProps {
  project: Project;
  onTest: (projectId: string) => Promise<void>;
  onToggle: (projectId: string, enabled: boolean) => Promise<void>;
  isTestingId: string | null;
  isTogglingId: string | null;
}

function ProjectRow({
  project,
  onTest,
  onToggle,
  isTestingId,
  isTogglingId,
}: ProjectRowProps) {
  const isTesting = isTestingId === project.id;
  const isToggling = isTogglingId === project.id;

  const handleTest = () => {
    onTest(project.id);
  };

  const handleToggle = (checked: boolean) => {
    onToggle(project.id, checked);
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{project.id}</TableCell>
      <TableCell className="font-medium">{project.name}</TableCell>
      <TableCell className="text-text-secondary">{project.owner}</TableCell>
      <TableCell className="text-center">
        {project.apiEnabled ? (
          <Badge variant="green" size="sm">
            Yes
          </Badge>
        ) : (
          <Badge variant="gray" size="sm">
            No
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
          {project.status}
        </Badge>
      </TableCell>
      <TableCell className="text-center text-green">
        {project.successCount}
      </TableCell>
      <TableCell className="text-center">
        {project.errorCount > 0 ? (
          <span className="text-red">{project.errorCount}</span>
        ) : (
          project.errorCount
        )}
      </TableCell>
      <TableCell className="text-text-secondary">
        {formatRelativeTime(project.lastUsed)}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-3">
          <Tooltip content="Test project API">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || !project.apiEnabled}
              loading={isTesting}
              icon={<PlayCircle className="h-4 w-4" />}
            >
              Test
            </Button>
          </Tooltip>
          <Tooltip
            content={project.status === "disabled" ? "Enable" : "Disable"}
          >
            <Switch
              checked={project.status !== "disabled"}
              onCheckedChange={handleToggle}
              disabled={isToggling}
              aria-label={`Toggle project ${project.name}`}
            />
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// PAGINATION
// =============================================================================

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const handlePrevious = () => {
    onPageChange(page - 1);
  };

  const handleNext = () => {
    onPageChange(page + 1);
  };

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <p className="text-sm text-text-secondary">
        Showing {start} to {end} of {total} projects
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrevious}
          disabled={page <= 1}
          icon={<ChevronLeft className="h-4 w-4" />}
        >
          Previous
        </Button>
        <span className="text-sm text-text-secondary px-2">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNext}
          disabled={page >= totalPages}
          iconAfter={<ChevronRight className="h-4 w-4" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-bg-secondary p-4 mb-4">
        <Search className="h-8 w-8 text-text-tertiary" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        No projects found
      </h3>
      <p className="text-sm text-text-secondary max-w-sm">
        No projects match your current filters. Try adjusting your search or
        filter criteria.
      </p>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProjectsTable() {
  const [search, setSearch] = React.useState("");
  const [accountFilter, setAccountFilter] = React.useState("all");
  const [sortField, setSortField] = React.useState<SortField>("lastUsed");
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("desc");
  const [page, setPage] = React.useState(1);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  // Build query params
  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: "10",
    sortField,
    sortDirection,
  });
  if (search) queryParams.set("search", search);
  if (accountFilter !== "all") queryParams.set("accountId", accountFilter);

  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    `/api/projects?${queryParams.toString()}`,
    fetcher,
    {
      refreshInterval: 15000, // Refresh every 15 seconds
      revalidateOnFocus: true,
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

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleAccountFilterChange = (value: string) => {
    setAccountFilter(value);
    setPage(1);
  };

  const handleTest = async (projectId: string) => {
    setTestingId(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}/test`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Test failed");
      }
      await mutate();
    } catch (_err) {
      // Error handling - could integrate with notification system
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (projectId: string, enabled: boolean) => {
    setTogglingId(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        throw new Error("Toggle failed");
      }
      await mutate();
    } catch (_err) {
      // Error handling - could integrate with notification system
    } finally {
      setTogglingId(null);
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
            <CardTitle className="text-xl">Projects</CardTitle>
            <CardDescription>
              Manage your Google Cloud projects and API access
            </CardDescription>
          </div>
          <Tooltip content="Refresh projects">
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
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              placeholder="Search by name or ID..."
              value={search}
              onChange={handleSearchChange}
              className="pl-9"
              aria-label="Search projects"
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
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-red mb-4">
              Failed to load projects. Please try again.
            </p>
            <Button variant="secondary" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <ProjectsTableSkeleton />
        ) : !data?.projects?.length ? (
          <EmptyState />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader
                      label="ID"
                      field="id"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Name"
                      field="name"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Owner"
                      field="owner"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="API"
                      field="apiEnabled"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="text-center"
                    />
                    <SortableHeader
                      label="Status"
                      field="status"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Success"
                      field="successCount"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="text-center"
                    />
                    <SortableHeader
                      label="Errors"
                      field="errorCount"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="text-center"
                    />
                    <SortableHeader
                      label="Last Used"
                      field="lastUsed"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      onTest={handleTest}
                      onToggle={handleToggle}
                      isTestingId={testingId}
                      isTogglingId={togglingId}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
