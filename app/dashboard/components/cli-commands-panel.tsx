/**
 * @file app/dashboard/components/cli-commands-panel.tsx
 * @description CLI Commands Panel component for executing GSwarm CLI commands.
 * Provides a grid of command buttons with terminal-style output area,
 * command history, and auto-scroll functionality.
 *
 * @module app/dashboard/components/cli-commands-panel
 */

"use client";

import {
  ArrowDown,
  Check,
  ClipboardCopy,
  ExternalLink,
  Gauge,
  Key,
  List,
  Loader2,
  LogIn,
  LogOut,
  Network,
  Plus,
  TestTube,
  Trash2,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface CommandOutput {
  id: string;
  command: string;
  output: string;
  timestamp: Date;
  status: "success" | "error" | "pending";
}

interface CLICommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  requiresInput?: {
    type: "email" | "projectId";
    label: string;
    placeholder: string;
  };
  opensExternal?: string;
}

/** Project entry from GET /api/projects */
interface ProjectEntry {
  id: string;
  name: string;
  apiEnabled: boolean;
  status: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CLI_COMMANDS: CLICommand[] = [
  {
    id: "login",
    label: "Login",
    icon: <LogIn className="w-4 h-4" />,
    description: "Initiate OAuth login flow",
  },
  {
    id: "logout",
    label: "Logout",
    icon: <LogOut className="w-4 h-4" />,
    description: "Log out from the CLI",
    requiresInput: {
      type: "email",
      label: "Email Address",
      placeholder: "user@example.com",
    },
  },
  {
    id: "list-projects",
    label: "List Projects",
    icon: <List className="w-4 h-4" />,
    description: "List all available projects",
  },
  {
    id: "enable-api",
    label: "Enable API",
    icon: <Key className="w-4 h-4" />,
    description: "Enable API for a project",
    requiresInput: {
      type: "projectId",
      label: "Project ID",
      placeholder: "my-project-id",
    },
  },
  {
    id: "test",
    label: "Test",
    icon: <TestTube className="w-4 h-4" />,
    description: "Test project configuration",
    requiresInput: {
      type: "projectId",
      label: "Project ID",
      placeholder: "my-project-id",
    },
  },
  {
    id: "create-project",
    label: "Create Project",
    icon: <Plus className="w-4 h-4" />,
    description: "Open GCP Console to create a project",
    opensExternal: "https://console.cloud.google.com/projectcreate",
  },
  {
    id: "benchmark",
    label: "Benchmark",
    icon: <Gauge className="w-4 h-4" />,
    description: "Run performance benchmarks",
  },
  {
    id: "probe",
    label: "Probe",
    icon: <Network className="w-4 h-4" />,
    description: "Probe system connectivity",
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Call real GSwarm API endpoints based on command ID.
 */
async function callApi(
  commandId: string,
  input?: string,
): Promise<{ output: string; status: "success" | "error" }> {
  const fetchJson = async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  };

  switch (commandId) {
    case "login": {
      // Open OAuth popup — same flow as accounts tab
      window.open(
        "/api/auth/google",
        "google-oauth",
        "width=500,height=600,popup=true",
      );
      return {
        output:
          "OAuth login window opened.\nComplete the Google sign-in flow in the popup.",
        status: "success",
      };
    }

    case "logout": {
      if (!input)
        return { output: "Error: email address required", status: "error" };
      // Find account ID by email
      const accounts = await fetchJson("/api/accounts");
      const account = accounts.accounts?.find(
        (a: { email: string }) => a.email === input,
      );
      if (!account) {
        return { output: `Account not found: ${input}`, status: "error" };
      }
      await fetchJson(`/api/accounts/${account.id}/logout`, { method: "POST" });
      return { output: `Logged out: ${input}`, status: "success" };
    }

    case "list-projects": {
      const data = await fetchJson("/api/projects");
      if (!data.projects?.length) {
        // Also show accounts for context
        const accts = await fetchJson("/api/accounts");
        const acctList =
          accts.accounts
            ?.map(
              (a: { email: string; status: string; projectsCount: number }) =>
                `  ${a.email} (${a.status}, ${a.projectsCount} projects)`,
            )
            .join("\n") || "  (none)";
        return {
          output: `No projects found.\n\nAuthenticated accounts:\n${acctList}\n\nTip: Projects are discovered from your GCP accounts.\nRun "Enable API" on a project ID to activate it.`,
          status: "success",
        };
      }
      const lines = data.projects.map(
        (p: { id: string; name?: string; enabled: boolean; status?: string }) =>
          `  ${p.id} ${p.enabled ? "✓" : "✗"} ${p.status || ""} ${p.name || ""}`.trimEnd(),
      );
      return {
        output: `Projects (${data.total}):\n${lines.join("\n")}`,
        status: "success",
      };
    }

    case "enable-api": {
      if (!input)
        return { output: "Error: project ID required", status: "error" };
      const data = await fetchJson(
        `/api/projects/${encodeURIComponent(input)}/enable`,
        {
          method: "POST",
        },
      );
      const enabledStatus = data.enabled ? "enabled" : "disabled";
      return {
        output: data.message || `API ${enabledStatus} for project: ${input}`,
        status: "success",
      };
    }

    case "test": {
      if (!input)
        return { output: "Error: project ID required", status: "error" };
      const data = await fetchJson(
        `/api/projects/${encodeURIComponent(input)}/test`,
        {
          method: "POST",
        },
      );
      return {
        output: data.message || JSON.stringify(data, null, 2),
        status: data.success ? "success" : "error",
      };
    }

    case "benchmark": {
      const data = await fetchJson("/api/bench", { method: "POST" });
      if (!data.results?.length) {
        return {
          output: "No projects available for benchmarking.",
          status: "success",
        };
      }
      const lines = data.results.map(
        (r: {
          projectId: string;
          latencyMs?: number;
          success?: boolean;
          error?: string;
        }) =>
          `  ${r.projectId}: ${r.success ? `${r.latencyMs}ms` : `FAIL - ${r.error}`}`,
      );
      return {
        output: `Benchmark results:\n${lines.join("\n")}`,
        status: "success",
      };
    }

    case "probe": {
      const data = await fetchJson("/api/probe", { method: "POST" });
      if (!data.results?.length) {
        return {
          output: `Probe complete. No enabled projects to test.\nDisabled: ${data.disabledCount || 0}`,
          status: "success",
        };
      }
      const lines = data.results.map(
        (r: {
          projectId: string;
          reachable?: boolean;
          latencyMs?: number;
          error?: string;
        }) =>
          `  ${r.projectId}: ${r.reachable ? `OK (${r.latencyMs}ms)` : `UNREACHABLE - ${r.error}`}`,
      );
      return {
        output: `Probe results:\n${lines.join("\n")}`,
        status: "success",
      };
    }

    default:
      return { output: `Unknown command: ${commandId}`, status: "error" };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export interface CLICommandsPanelProps {
  /** Callback when a command is executed */
  onExecuteCommand?: (
    commandId: string,
    input?: string,
  ) => Promise<{ output: string; status: "success" | "error" }>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CLI Commands Panel component.
 * Provides a grid of command buttons with terminal-style output area.
 *
 * @component
 * @example
 * ```tsx
 * <CLICommandsPanel
 *   onExecuteCommand={async (cmd, input) => {
 *     const result = await executeCommand(cmd, input);
 *     return { output: result, status: 'success' };
 *   }}
 * />
 * ```
 */
export function CLICommandsPanel({
  onExecuteCommand,
  className,
}: CLICommandsPanelProps) {
  const [outputs, setOutputs] = useState<CommandOutput[]>([]);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [currentCommand, setCurrentCommand] = useState<CLICommand | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  // Project selection state for commands that require a project ID
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output is added
  const lastOutputId = outputs.at(-1)?.id;
  useEffect(() => {
    if (autoScroll && bottomRef.current && lastOutputId) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [autoScroll, lastOutputId]);

  // Detect if user scrolled up
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const isAtBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
      setAutoScroll(true);
    }
  }, []);

  const executeCommand = useCallback(
    async (command: CLICommand, input?: string) => {
      const outputId = generateId();
      const cmdStr = input ? `${command.id} ${input}` : command.id;

      // Add pending output
      setOutputs((prev) => [
        ...prev,
        {
          id: outputId,
          command: cmdStr,
          output: "",
          timestamp: new Date(),
          status: "pending",
        },
      ]);
      setIsExecuting(command.id);

      const updateOutput = (output: string, status: "success" | "error") => {
        setOutputs((prev) =>
          prev.map((o) => (o.id === outputId ? { ...o, output, status } : o)),
        );
      };

      try {
        // Use custom handler if provided, otherwise call real APIs
        if (onExecuteCommand) {
          const result = await onExecuteCommand(command.id, input);
          updateOutput(result.output, result.status);
        } else {
          const result = await callApi(command.id, input);
          updateOutput(result.output, result.status);
        }
      } catch (error) {
        updateOutput(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          "error",
        );
      } finally {
        setIsExecuting(null);
      }
    },
    [onExecuteCommand],
  );

  /** Fetch projects list from the API */
  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const res = await fetch("/api/projects", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      const fetched: ProjectEntry[] = data.projects ?? [];
      setProjects(fetched);
      // Auto-select if only one project
      if (fetched.length === 1) {
        setInputValue(fetched[0].id);
      }
    } catch (err) {
      setProjectsError(
        err instanceof Error ? err.message : "Failed to load projects",
      );
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const handleCommandClick = useCallback(
    (command: CLICommand) => {
      if (command.opensExternal) {
        window.open(command.opensExternal, "_blank", "noopener,noreferrer");
        return;
      }

      if (command.requiresInput) {
        setCurrentCommand(command);
        setInputValue("");
        setProjectsError(null);

        // Fetch projects for project ID selectors
        if (command.requiresInput.type === "projectId") {
          fetchProjects();
        }

        setInputDialogOpen(true);
      } else {
        setCurrentCommand(command);
      }
    },
    [fetchProjects],
  );

  // Execute command when currentCommand changes and no input is required
  useEffect(() => {
    if (currentCommand && !currentCommand.requiresInput && !inputDialogOpen) {
      executeCommand(currentCommand);
      setCurrentCommand(null);
    }
  }, [currentCommand, inputDialogOpen, executeCommand]);

  const handleInputSubmit = useCallback(() => {
    if (currentCommand && inputValue.trim()) {
      executeCommand(currentCommand, inputValue.trim());
      setInputDialogOpen(false);
      setCurrentCommand(null);
      setInputValue("");
    }
  }, [currentCommand, inputValue, executeCommand]);

  const copyAllOutput = useCallback(async () => {
    const allOutput = outputs
      .map(
        (o) =>
          `[${formatTimestamp(o.timestamp)}] $ gswarm ${o.command}\n${o.output}`,
      )
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(allOutput);
      setCopiedId("all");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [outputs]);

  const clearHistory = useCallback(() => {
    setOutputs([]);
    setClearDialogOpen(false);
  }, []);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">CLI Commands</CardTitle>
            <CardDescription>
              Execute GSwarm CLI commands directly from the dashboard
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Copy all output">
              <Button
                variant="ghost"
                size="icon"
                onClick={copyAllOutput}
                disabled={outputs.length === 0}
                aria-label={copiedId === "all" ? "Copied!" : "Copy all output"}
              >
                {copiedId === "all" ? (
                  <Check className="w-4 h-4 text-green" aria-hidden="true" />
                ) : (
                  <ClipboardCopy className="w-4 h-4" aria-hidden="true" />
                )}
              </Button>
            </Tooltip>
            <Tooltip content="Clear history">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setClearDialogOpen(true)}
                disabled={outputs.length === 0}
                aria-label="Clear command history"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Command Buttons Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CLI_COMMANDS.map((command) => (
            <Tooltip key={command.id} content={command.description}>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start gap-2 h-10"
                onClick={() => handleCommandClick(command)}
                disabled={isExecuting !== null}
                loading={isExecuting === command.id}
              >
                {command.opensExternal ? (
                  <ExternalLink className="w-4 h-4" />
                ) : (
                  command.icon
                )}
                <span className="truncate">{command.label}</span>
              </Button>
            </Tooltip>
          ))}
        </div>

        {/* Terminal Output Area */}
        <div className="relative flex-1 min-h-64 rounded-lg border border-border bg-[#0d1117] overflow-hidden">
          <ScrollArea
            ref={scrollAreaRef}
            className="h-full max-h-96"
            onScrollCapture={handleScroll}
          >
            <div
              className="p-4 font-mono text-sm"
              role="log"
              aria-live="polite"
              aria-label="Terminal output"
              aria-relevant="additions"
            >
              {outputs.length === 0 ? (
                <div className="text-gray-500 italic">
                  No commands executed yet. Click a command button above to get
                  started.
                </div>
              ) : (
                outputs.map((output) => (
                  <div key={output.id} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                      <span>{formatTimestamp(output.timestamp)}</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-medium",
                          output.status === "success" &&
                            "bg-green-500/20 text-green-400",
                          output.status === "error" &&
                            "bg-red-500/20 text-red-400",
                          output.status === "pending" &&
                            "bg-yellow-500/20 text-yellow-400",
                        )}
                      >
                        {output.status}
                      </span>
                    </div>
                    <div className="text-cyan-400">
                      $ gswarm {output.command}
                    </div>
                    {output.status === "pending" ? (
                      <div className="flex items-center gap-2 text-gray-400 mt-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Executing...</span>
                      </div>
                    ) : (
                      <pre
                        className={cn(
                          "whitespace-pre-wrap mt-1",
                          output.status === "success"
                            ? "text-gray-300"
                            : "text-red-400",
                        )}
                      >
                        {output.output}
                      </pre>
                    )}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Scroll to bottom button */}
          {!autoScroll && outputs.length > 0 && (
            <Tooltip content="Scroll to bottom">
              <Button
                variant="secondary"
                size="icon"
                className="absolute bottom-3 right-3 h-8 w-8 rounded-full shadow-lg"
                onClick={scrollToBottom}
                aria-label="Scroll to bottom of output"
              >
                <ArrowDown className="w-4 h-4" aria-hidden="true" />
              </Button>
            </Tooltip>
          )}
        </div>
      </CardContent>

      {/* Input Dialog */}
      <Dialog open={inputDialogOpen} onOpenChange={setInputDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentCommand?.icon}
              {currentCommand?.label}
            </DialogTitle>
            <DialogDescription>{currentCommand?.description}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {currentCommand?.requiresInput?.type === "projectId" ? (
              // Project ID selector: fetch and display projects as a dropdown
              projectsLoading ? (
                <div className="flex items-center gap-2 text-sm text-text-secondary py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading projects...</span>
                </div>
              ) : projectsError ? (
                <div className="space-y-2">
                  <p className="text-sm text-red-400">{projectsError}</p>
                  <Button variant="ghost" size="sm" onClick={fetchProjects}>
                    Retry
                  </Button>
                </div>
              ) : projects.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  No projects found. Log in with a Google account first, then
                  try again.
                </p>
              ) : (
                <Select
                  label={currentCommand.requiresInput.label}
                  placeholder="Select a project..."
                  options={projects.map((p) => ({
                    value: p.id,
                    label: `${p.name || p.id}${p.apiEnabled ? "" : " (disabled)"}`,
                  }))}
                  value={inputValue}
                  onChange={setInputValue}
                />
              )
            ) : (
              // Non-project input (e.g. email): show standard text input
              <Input
                label={currentCommand?.requiresInput?.label}
                placeholder={currentCommand?.requiresInput?.placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleInputSubmit();
                  }
                }}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInputDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInputSubmit}
              disabled={
                !inputValue.trim() || projectsLoading || !!projectsError
              }
            >
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Command History</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all command output? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearHistory}>
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
