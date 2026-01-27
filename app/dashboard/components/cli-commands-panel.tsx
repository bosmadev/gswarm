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

      // Add pending output
      const pendingOutput: CommandOutput = {
        id: outputId,
        command: input ? `${command.id} ${input}` : command.id,
        output: "",
        timestamp: new Date(),
        status: "pending",
      };

      setOutputs((prev) => [...prev, pendingOutput]);
      setIsExecuting(command.id);

      try {
        if (onExecuteCommand) {
          const result = await onExecuteCommand(command.id, input);
          setOutputs((prev) =>
            prev.map((o) =>
              o.id === outputId
                ? { ...o, output: result.output, status: result.status }
                : o,
            ),
          );
        } else {
          // Demo mode - simulate command execution
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const demoOutput = `$ gswarm ${input ? `${command.id} ${input}` : command.id}\n\n[Demo Mode] Command executed successfully.\nThis is a simulated output for demonstration purposes.`;
          setOutputs((prev) =>
            prev.map((o) =>
              o.id === outputId
                ? { ...o, output: demoOutput, status: "success" }
                : o,
            ),
          );
        }
      } catch (error) {
        setOutputs((prev) =>
          prev.map((o) =>
            o.id === outputId
              ? {
                  ...o,
                  output: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  status: "error",
                }
              : o,
          ),
        );
      } finally {
        setIsExecuting(null);
      }
    },
    [onExecuteCommand],
  );

  const handleCommandClick = useCallback((command: CLICommand) => {
    if (command.opensExternal) {
      window.open(command.opensExternal, "_blank", "noopener,noreferrer");
      return;
    }

    if (command.requiresInput) {
      setCurrentCommand(command);
      setInputValue("");
      setInputDialogOpen(true);
    } else {
      setCurrentCommand(command);
    }
  }, []);

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
              >
                {copiedId === "all" ? (
                  <Check className="w-4 h-4 text-green" />
                ) : (
                  <ClipboardCopy className="w-4 h-4" />
                )}
              </Button>
            </Tooltip>
            <Tooltip content="Clear history">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setClearDialogOpen(true)}
                disabled={outputs.length === 0}
              >
                <Trash2 className="w-4 h-4" />
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
            <div className="p-4 font-mono text-sm">
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
              >
                <ArrowDown className="w-4 h-4" />
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInputDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInputSubmit} disabled={!inputValue.trim()}>
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
