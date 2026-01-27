/**
 * @file app/dashboard/components/api-keys-section.tsx
 * @description API Keys Section component for managing API keys.
 * Connected to backend API endpoints.
 */

"use client";

import { Check, ClipboardCopy, Key, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** API Key from backend */
export interface APIKey {
  key_hash: string;
  name: string;
  created_at: string;
  expires_at?: string;
  is_active: boolean;
  rate_limit?: number;
  allowed_endpoints?: string[];
  allowed_ips?: string[];
  metadata?: Record<string, unknown>;
}

/** Newly created API key with raw key */
interface CreatedAPIKey extends APIKey {
  raw_key: string;
  masked_key: string;
}

interface NewKeyData {
  name: string;
  ips: string;
  allowAllIPs: boolean;
}

function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  const prefix = key.slice(0, 8);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatIPs(ips: string[] | undefined): string {
  if (!ips || ips.length === 0) return "All IPs";
  if (ips.length === 1) return ips[0];
  return `${ips[0]} +${ips.length - 1} more`;
}

export interface APIKeysSectionProps {
  className?: string;
}

export function APIKeysSection({ className }: APIKeysSectionProps) {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showKeyDialogOpen, setShowKeyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<APIKey | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreatedAPIKey | null>(
    null,
  );
  const [copiedKeyHash, setCopiedKeyHash] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [newKeyData, setNewKeyData] = useState<NewKeyData>({
    name: "",
    ips: "",
    allowAllIPs: true,
  });

  useEffect(() => {
    const loadKeys = async () => {
      try {
        const response = await fetch("/api/api-keys");
        if (response.ok) {
          const data = await response.json();
          setKeys(data.keys || []);
        }
      } catch {
        // Failed to load API keys - error already handled by showing empty state
      } finally {
        setIsLoading(false);
      }
    };

    loadKeys();
  }, []);

  const handleCreateKey = useCallback(async () => {
    if (!newKeyData.name.trim()) return;

    setIsCreating(true);

    try {
      const allowedIps = newKeyData.allowAllIPs
        ? []
        : newKeyData.ips
            .split(",")
            .map((ip) => ip.trim())
            .filter(Boolean);

      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyData.name.trim(),
          allowed_ips: allowedIps,
        }),
      });

      if (!response.ok) {
        // API error - response not OK, silently return
        return;
      }

      const createdKey: CreatedAPIKey = await response.json();

      const { raw_key, masked_key, ...keyWithoutRaw } = createdKey;
      setKeys((prev) => [...prev, keyWithoutRaw]);
      setNewlyCreatedKey(createdKey);
      setCreateDialogOpen(false);
      setShowKeyDialogOpen(true);
      setNewKeyData({ name: "", ips: "", allowAllIPs: true });
    } catch {
      // Network error - silently fail, user can retry
    } finally {
      setIsCreating(false);
    }
  }, [newKeyData]);

  const handleDeleteKey = useCallback(async () => {
    if (!keyToDelete) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/api-keys/${keyToDelete.key_hash}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        // API error - response not OK, silently return
        return;
      }

      setKeys((prev) =>
        prev.filter((k) => k.key_hash !== keyToDelete.key_hash),
      );
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
    } catch {
      // Network error - silently fail, user can retry
    } finally {
      setIsDeleting(false);
    }
  }, [keyToDelete]);

  const copyKey = useCallback(async (key: string, keyHash: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKeyHash(keyHash);
      setTimeout(() => setCopiedKeyHash(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }, []);

  const openDeleteDialog = useCallback((key: APIKey) => {
    setKeyToDelete(key);
    setDeleteDialogOpen(true);
  }, []);

  if (isLoading) {
    return (
      <Card className={cn("flex flex-col", className)}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-text-secondary">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Manage your API keys for accessing the GSwarm API
            </CardDescription>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create New Key
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {keys.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No API keys yet</p>
            <p className="text-sm mb-4">
              Create your first API key to start using the GSwarm API
            </p>
            <Button
              variant="secondary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create New Key
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key Hash</TableHead>
                <TableHead>Allowed IPs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((apiKey) => (
                <TableRow key={apiKey.key_hash}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <code className="text-sm bg-bg-tertiary px-2 py-1 rounded font-mono">
                      {maskKey(apiKey.key_hash)}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Tooltip
                      content={
                        apiKey.allowed_ips && apiKey.allowed_ips.length > 0
                          ? apiKey.allowed_ips.join(", ")
                          : "All IPs allowed"
                      }
                    >
                      <span className="text-sm text-text-secondary cursor-help">
                        {formatIPs(apiKey.allowed_ips)}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-sm px-2 py-1 rounded",
                        apiKey.is_active
                          ? "bg-green/10 text-green"
                          : "bg-red/10 text-red",
                      )}
                    >
                      {apiKey.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {formatDate(apiKey.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip content="Delete key">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red hover:text-red hover:bg-red/10"
                          onClick={() => openDeleteDialog(apiKey)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Create a new API key to access the GSwarm API. You will only be
              able to see the full key once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Key Name"
              placeholder="My API Key"
              value={newKeyData.name}
              onChange={(e) =>
                setNewKeyData((prev) => ({ ...prev, name: e.target.value }))
              }
              helperText="A descriptive name to identify this key"
            />
            <div className="space-y-3">
              <Checkbox
                checked={newKeyData.allowAllIPs}
                onCheckedChange={(checked) =>
                  setNewKeyData((prev) => ({
                    ...prev,
                    allowAllIPs: checked === true,
                  }))
                }
                label="Allow all IP addresses"
                description="If unchecked, only specified IPs can use this key"
              />
              {!newKeyData.allowAllIPs && (
                <Input
                  label="Allowed IP Addresses"
                  placeholder="192.168.1.1, 10.0.0.1"
                  value={newKeyData.ips}
                  onChange={(e) =>
                    setNewKeyData((prev) => ({ ...prev, ips: e.target.value }))
                  }
                  helperText="Comma-separated list of IP addresses"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyData.name.trim()}
              loading={isCreating}
            >
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showKeyDialogOpen} onOpenChange={setShowKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green">
              <Check className="w-5 h-5" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Your new API key has been created. Make sure to copy it now - you
              will not be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <span className="block text-sm font-medium text-text-secondary">
                Your API Key
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-bg-tertiary px-3 py-2 rounded font-mono break-all border border-border">
                  {newlyCreatedKey?.raw_key}
                </code>
                <Tooltip content={copiedKeyHash ? "Copied!" : "Copy key"}>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => {
                      if (newlyCreatedKey) {
                        copyKey(
                          newlyCreatedKey.raw_key,
                          newlyCreatedKey.key_hash,
                        );
                      }
                    }}
                  >
                    {copiedKeyHash === newlyCreatedKey?.key_hash ? (
                      <Check className="w-4 h-4 text-green" />
                    ) : (
                      <ClipboardCopy className="w-4 h-4" />
                    )}
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKeyDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the API key{" "}
              <strong>{keyToDelete?.name}</strong>? This action cannot be undone
              and any applications using this key will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              className="bg-red hover:bg-red/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
