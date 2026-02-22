/**
 * @file components/providers/confirmation-provider.tsx
 * @description Confirmation dialog provider for showing confirmation modals.
 * Uses the AlertDialog component from Radix UI.
 *
 * @module components/providers/confirmation-provider
 */

"use client";

import { AlertTriangle, Info, XCircle } from "lucide-react";
import * as React from "react";
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

interface ConfirmationOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "warning" | "danger" | "info";
}

interface ConfirmationContextType {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
}

const ConfirmationContext = React.createContext<
  ConfirmationContextType | undefined
>(undefined);

export function useConfirmation() {
  const context = React.useContext(ConfirmationContext);
  if (!context) {
    throw new Error("useConfirmation must be used within ConfirmationProvider");
  }
  return context;
}

interface ConfirmationProviderProps {
  children: React.ReactNode;
}

export function ConfirmationProvider({ children }: ConfirmationProviderProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmationOptions | null>(
    null,
  );
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmationOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  };

  const handleConfirm = () => {
    if (resolverRef.current) resolverRef.current(true);
    resolverRef.current = null;
    setIsOpen(false);
    setOptions(null);
  };

  const handleCancel = () => {
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = null;
    setIsOpen(false);
    setOptions(null);
  };

  const getButtonVariant = (type?: "warning" | "danger" | "info") => {
    switch (type) {
      case "danger":
        return "bg-red-500 hover:bg-red-500/90 text-white";
      case "warning":
        return "bg-orange hover:bg-orange/90 text-white";
      case "info":
        return "bg-blue hover:bg-blue/90 text-white";
      default:
        return "bg-primary hover:bg-primary/90 text-white";
    }
  };

  const getIcon = (type?: "warning" | "danger" | "info") => {
    switch (type) {
      case "danger":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-orange" />;
      case "info":
        return <Info className="w-5 h-5 text-blue" />;
      default:
        return <Info className="w-5 h-5 text-blue" />;
    }
  };

  const getIconBg = (type?: "warning" | "danger" | "info") => {
    switch (type) {
      case "danger":
        return "bg-red-500/10";
      case "warning":
        return "bg-orange/10";
      case "info":
        return "bg-blue/10";
      default:
        return "bg-blue/10";
    }
  };

  return (
    <ConfirmationContext value={{ confirm }}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-3">
              {options && (
                <div className={`p-2 rounded-full ${getIconBg(options.type)}`}>
                  {getIcon(options.type)}
                </div>
              )}
              {options?.title || "Confirm Action"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary whitespace-pre-line">
              {options?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options?.cancelText || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={getButtonVariant(options?.type)}
            >
              {options?.confirmText || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationContext>
  );
}
