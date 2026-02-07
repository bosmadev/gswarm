/**
 * @file components/providers/command-palette-provider.tsx
 * @description Command palette provider with keyboard shortcuts,
 * fuzzy search, and recent commands history for GSwarm navigation.
 *
 * @module components/providers/command-palette-provider
 */

"use client";

import {
  AlertCircle,
  Check,
  Clock,
  Cog,
  FolderKanban,
  Hand,
  Home,
  Key,
  LayoutDashboard,
  Search,
  Terminal,
  Type,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useFont } from "./font-provider";
import { useReactGrab } from "./react-grab-provider";

// =============================================================================
// CONTEXT
// =============================================================================

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  recentCommands: string[];
  addRecentCommand: (commandId: string) => void;
}

const CommandPaletteContext =
  React.createContext<CommandPaletteContextValue | null>(null);

/**
 * Hook to access command palette functionality.
 * Must be used within CommandPaletteProvider.
 */
export function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider",
    );
  }
  return context;
}

// =============================================================================
// TYPES
// =============================================================================

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  shortcut: string;
  keywords?: string[];
}

// =============================================================================
// NAVIGATION ITEMS (matches sidebar in shared.tsx)
// =============================================================================

const navigationItems: NavigationItem[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    href: "/",
    shortcut: "G H",
    keywords: ["readme", "documentation", "start"],
  },
  {
    id: "overview",
    label: "Dashboard Overview",
    icon: LayoutDashboard,
    href: "/dashboard",
    shortcut: "G D",
    keywords: ["dashboard", "admin", "main"],
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: Users,
    href: "/dashboard?tab=accounts",
    shortcut: "G A",
    keywords: ["users", "oauth", "google", "tokens"],
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    href: "/dashboard?tab=projects",
    shortcut: "G P",
    keywords: ["gemini", "rotation", "api keys"],
  },
  {
    id: "errors",
    label: "Error Log",
    icon: AlertCircle,
    href: "/dashboard?tab=errors",
    shortcut: "G E",
    keywords: ["logs", "failures", "issues", "debug"],
  },
  {
    id: "cli",
    label: "CLI",
    icon: Terminal,
    href: "/dashboard?tab=cli",
    shortcut: "G C",
    keywords: ["terminal", "command", "shell"],
  },
  {
    id: "api-keys",
    label: "API Keys",
    icon: Key,
    href: "/dashboard?tab=api-keys",
    shortcut: "G K",
    keywords: ["keys", "authentication", "access"],
  },
  {
    id: "config",
    label: "Configuration",
    icon: Cog,
    href: "/dashboard?tab=config",
    shortcut: "G S",
    keywords: ["settings", "model", "temperature", "gswarm"],
  },
];

// =============================================================================
// FUZZY SEARCH
// =============================================================================

/**
 * Simple fuzzy search implementation
 */
function fuzzySearch(query: string, text: string): boolean {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Direct substring match
  if (textLower.includes(queryLower)) return true;

  // Fuzzy match - all characters in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === queryLower.length;
}

function searchItems<T extends { label: string; keywords?: string[] }>(
  items: T[],
  query: string,
): T[] {
  if (!query) return items;

  return items.filter((item) => {
    if (fuzzySearch(query, item.label)) return true;
    if (item.keywords?.some((keyword) => fuzzySearch(query, keyword)))
      return true;
    return false;
  });
}

// =============================================================================
// LOCAL STORAGE
// =============================================================================

const RECENT_COMMANDS_KEY = `${process.env.GLOBAL_APP_NAME}-recent-commands`;
const MAX_RECENT_COMMANDS = 5;

function loadRecentCommands(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentCommands(commands: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(commands));
  } catch {
    // Ignore localStorage errors
  }
}

// =============================================================================
// COMMAND PALETTE COMPONENT
// =============================================================================

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recentCommands: string[];
  onCommandExecute: (commandId: string) => void;
}

function CommandPalette({
  open,
  onOpenChange,
  recentCommands,
  onCommandExecute,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const { font, setFont } = useFont();

  // React Grab integration (always safe — provider renders no-op in non-DEBUG mode)
  const reactGrab = useReactGrab();

  // Filter items based on search query
  const filteredNavigation = searchItems(navigationItems, query);

  // Get recent navigation items
  const recentNavItems = React.useMemo(() => {
    return recentCommands
      .map((id) => navigationItems.find((item) => item.id === id))
      .filter((item): item is NavigationItem => item !== undefined)
      .slice(0, MAX_RECENT_COMMANDS);
  }, [recentCommands]);

  const runCommand = React.useCallback(
    (command: () => void, commandId?: string) => {
      onOpenChange(false);
      setQuery("");
      if (commandId) {
        onCommandExecute(commandId);
      }
      command();
    },
    [onOpenChange, onCommandExecute],
  );

  // Handle keyboard shortcuts for navigation (G + key)
  React.useEffect(() => {
    if (open) return; // Don't handle shortcuts when palette is open

    let gKeyPressed = false;
    let gKeyTimeout: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey) {
        gKeyPressed = true;
        gKeyTimeout = setTimeout(() => {
          gKeyPressed = false;
        }, 1000);
        return;
      }

      if (gKeyPressed) {
        const key = e.key.toLowerCase();
        const item = navigationItems.find(
          (nav) => nav.shortcut.toLowerCase() === `g ${key}`,
        );

        if (item) {
          e.preventDefault();
          onCommandExecute(item.id);
          router.push(item.href);
          gKeyPressed = false;
          clearTimeout(gKeyTimeout);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(gKeyTimeout);
    };
  }, [open, router, onCommandExecute]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-6">
            <Search className="w-10 h-10 text-text-tertiary" />
            <p className="text-text-secondary">No results found.</p>
            <p className="text-xs text-text-tertiary">
              Try searching for pages or actions
            </p>
          </div>
        </CommandEmpty>

        {/* Recent Commands */}
        {!query && recentNavItems.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentNavItems.map((item) => (
                <CommandItem
                  key={`recent-${item.id}`}
                  value={`recent-${item.label}`}
                  onSelect={() =>
                    runCommand(() => router.push(item.href), item.id)
                  }
                >
                  <Clock className="mr-2 h-4 w-4 text-text-tertiary" />
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        {filteredNavigation.length > 0 && (
          <CommandGroup heading="Navigation">
            {filteredNavigation.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                onSelect={() =>
                  runCommand(() => router.push(item.href), item.id)
                }
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
                <CommandShortcut>{item.shortcut}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Appearance Settings */}
        <CommandGroup heading="Appearance">
          <CommandItem
            value="font-nunito"
            onSelect={() => runCommand(() => setFont("nunito"))}
          >
            <Type className="mr-2 h-4 w-4" />
            <span>Nunito Font</span>
            {font === "nunito" && (
              <Check className="ml-auto h-4 w-4 text-orange" />
            )}
          </CommandItem>
          <CommandItem
            value="font-space-mono"
            onSelect={() => runCommand(() => setFont("space-mono"))}
          >
            <Type className="mr-2 h-4 w-4" />
            <span>Space Mono Font</span>
            {font === "space-mono" && (
              <Check className="ml-auto h-4 w-4 text-orange" />
            )}
          </CommandItem>
        </CommandGroup>

        {/* Developer Tools (DEBUG mode only) */}
        {process.env.GLOBAL_DEBUG_MODE === "true" && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Developer Tools">
              <CommandItem
                value="toggle-react-grab"
                keywords={["grab", "select", "copy", "context", "ai", "dev"]}
                onSelect={() => runCommand(() => reactGrab.toggle())}
              >
                <Hand className="mr-2 h-4 w-4" />
                <span>Toggle React Grab</span>
                {reactGrab.isActive && (
                  <Check className="ml-auto h-4 w-4 text-orange" />
                )}
                <CommandShortcut>⌃⇧G</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* Help */}
        <CommandSeparator />
        <div className="px-4 py-3 text-xs text-text-tertiary border-t border-border">
          <div className="flex items-center justify-between">
            <span>
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded text-text-secondary">
                G
              </kbd>{" "}
              then a key for quick navigation
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded text-text-secondary">
                ESC
              </kbd>{" "}
              to close
            </span>
          </div>
        </div>
      </CommandList>
    </CommandDialog>
  );
}

// =============================================================================
// PROVIDER
// =============================================================================

/**
 * CommandPaletteProvider - Wrapper that provides command palette functionality.
 * Wraps the application and provides context for opening/closing the palette.
 */
export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [recentCommands, setRecentCommands] = React.useState<string[]>([]);

  // Load recent commands on mount
  React.useEffect(() => {
    setRecentCommands(loadRecentCommands());
  }, []);

  const openCommandPalette = React.useCallback(() => {
    setOpen(true);
  }, []);

  const closeCommandPalette = React.useCallback(() => {
    setOpen(false);
  }, []);

  const addRecentCommand = React.useCallback((commandId: string) => {
    setRecentCommands((prev) => {
      // Remove if already exists, add to front
      const filtered = prev.filter((id) => id !== commandId);
      const updated = [commandId, ...filtered].slice(0, MAX_RECENT_COMMANDS);
      saveRecentCommands(updated);
      return updated;
    });
  }, []);

  // Global keyboard shortcut to open palette
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const contextValue = React.useMemo(
    () => ({
      open,
      setOpen,
      openCommandPalette,
      closeCommandPalette,
      recentCommands,
      addRecentCommand,
    }),
    [
      open,
      openCommandPalette,
      closeCommandPalette,
      recentCommands,
      addRecentCommand,
    ],
  );

  return (
    <CommandPaletteContext value={contextValue}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        recentCommands={recentCommands}
        onCommandExecute={addRecentCommand}
      />
    </CommandPaletteContext>
  );
}
