/**
 * @file components/providers/notification-provider.tsx
 * @description Notification provider using Sonner for toast notifications.
 * Provides a consistent API for showing success, error, warning, and info toasts.
 *
 * @module components/providers/notification-provider
 */

"use client";

import * as React from "react";
import { toast } from "sonner";

interface NotificationContextType {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: Error) => string);
    },
  ) => Promise<T>;
  dismiss: (toastId?: string | number) => void;
  loading: (message: string) => string | number;
}

const NotificationContext = React.createContext<
  NotificationContextType | undefined
>(undefined);

/**
 * Hook to use the notification system
 *
 * @returns {NotificationContextType} The notification context methods
 * @throws {Error} If used outside of NotificationProvider
 *
 * @example
 * const { success, error, promise } = useNotifications();
 * success("Operation completed successfully");
 *
 * // Promise-based toast
 * promise(fetchData(), {
 *   loading: "Loading...",
 *   success: "Data loaded!",
 *   error: "Failed to load data"
 * });
 */
export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context)
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that wraps the application and provides notification methods
 *
 * @param {NotificationProviderProps} props - Component props
 * @returns {JSX.Element} The provider with children
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const contextValue = React.useMemo<NotificationContextType>(
    () => ({
      success: (message: string, duration?: number) => {
        toast.success(message, { duration: duration ?? 5000 });
      },
      error: (message: string, duration?: number) => {
        toast.error(message, { duration: duration ?? 8000 });
      },
      warning: (message: string, duration?: number) => {
        toast.warning(message, { duration: duration ?? 6000 });
      },
      info: (message: string, duration?: number) => {
        toast.info(message, { duration: duration ?? 5000 });
      },
      promise: <T,>(
        promise: Promise<T>,
        messages: {
          loading: string;
          success: string | ((data: T) => string);
          error: string | ((error: Error) => string);
        },
      ): Promise<T> => {
        toast.promise(promise, messages);
        return promise;
      },
      dismiss: (toastId?: string | number) => {
        toast.dismiss(toastId);
      },
      loading: (message: string) => {
        return toast.loading(message);
      },
    }),
    [],
  );

  return (
    <NotificationContext value={contextValue}>{children}</NotificationContext>
  );
}
