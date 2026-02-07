/**
 * @file app/dashboard/components/accounts-section.tsx
 * @description Accounts management section for the dashboard.
 * Displays a table of accounts with status badges and action buttons.
 *
 * @module app/dashboard/components/accounts-section
 */

"use client";

import { LogIn, LogOut, RefreshCw } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
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

interface Account {
  id: string;
  email: string;
  status: "healthy" | "frozen" | "error";
  projectsCount: number;
  failedCount: number;
  frozenUntil: string | null;
  createdAt: string;
}

interface AccountsResponse {
  accounts: Account[];
  total: number;
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
  status: Account["status"],
): "green" | "red" | "yellow" {
  switch (status) {
    case "healthy":
      return "green";
    case "frozen":
      return "red";
    case "error":
      return "yellow";
    default:
      return "gray" as "green";
  }
}

function formatFrozenUntil(frozenUntil: string | null): string {
  if (!frozenUntil) return "-";
  const date = new Date(frozenUntil);
  return date.toLocaleString();
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function AccountsTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={`account-skeleton-${i.toString()}`}
          className="flex items-center gap-4 py-3 px-4"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// ACCOUNT ROW COMPONENT
// =============================================================================

interface AccountRowProps {
  account: Account;
  onLogout: (accountId: string, email: string) => Promise<void>;
  isLoggingOut: boolean;
}

function AccountRow({ account, onLogout, isLoggingOut }: AccountRowProps) {
  const handleLogout = () => {
    onLogout(account.id, account.email);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{account.email}</TableCell>
      <TableCell>
        <Badge variant={getStatusBadgeVariant(account.status)} size="sm">
          {account.status}
        </Badge>
      </TableCell>
      <TableCell className="text-center">{account.projectsCount}</TableCell>
      <TableCell className="text-center">
        {account.failedCount > 0 ? (
          <span className="text-red-500">{account.failedCount}</span>
        ) : (
          account.failedCount
        )}
      </TableCell>
      <TableCell>{formatFrozenUntil(account.frozenUntil)}</TableCell>
      <TableCell className="text-right">
        <Tooltip content="Logout this account">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLogout}
            disabled={isLoggingOut}
            loading={isLoggingOut}
            icon={<LogOut className="h-4 w-4" />}
          >
            Logout
          </Button>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-bg-secondary p-4 mb-4">
        <LogIn className="h-8 w-8 text-text-tertiary" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        No accounts connected
      </h3>
      <p className="text-sm text-text-secondary mb-4 max-w-sm">
        Connect your first Google account to start managing projects and API
        keys.
      </p>
      <Button variant="primary" onClick={onLogin} icon={<LogIn />}>
        Login New Account
      </Button>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AccountsSection() {
  const { confirm } = useConfirmation();
  const [loggingOutId, setLoggingOutId] = React.useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<AccountsResponse>(
    "/api/accounts",
    fetcher,
    {
      refreshInterval: 60000, // Refresh every 60 seconds
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Listen for OAuth popup completion and refresh accounts list
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.success) {
        mutate(); // Refresh accounts list
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [mutate]);

  const handleLogin = () => {
    window.open(
      "/api/auth/google",
      "google-oauth",
      "width=500,height=600,popup=true",
    );
  };

  const handleLogout = async (accountId: string, email: string) => {
    const confirmed = await confirm({
      title: "Logout Account",
      message: `Are you sure you want to logout ${email}? This will revoke access to all associated projects.`,
      confirmText: "Logout",
      cancelText: "Cancel",
      type: "danger",
    });

    if (!confirmed) return;

    setLoggingOutId(accountId);
    try {
      const response = await fetch(`/api/accounts/${accountId}/logout`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to logout account");
      }

      // Refresh the accounts list
      await mutate();
    } catch (_err) {
      // Error handling - could integrate with notification system
    } finally {
      setLoggingOutId(null);
    }
  };

  const handleRefresh = () => {
    mutate();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-xl">Connected Accounts</CardTitle>
          <CardDescription>
            Manage your Google Cloud accounts and their status
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Refresh accounts">
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
          <Button
            variant="primary"
            onClick={handleLogin}
            icon={<LogIn className="h-4 w-4" />}
          >
            Login New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-red-500 mb-4">
              Failed to load accounts. Please try again.
            </p>
            <Button variant="secondary" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <AccountsTableSkeleton />
        ) : !data?.accounts?.length ? (
          <EmptyState onLogin={handleLogin} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Projects</TableHead>
                <TableHead className="text-center">Failed</TableHead>
                <TableHead>Frozen Until</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onLogout={handleLogout}
                  isLoggingOut={loggingOutId === account.id}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
