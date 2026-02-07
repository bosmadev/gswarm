/**
 * @file components/ui/error-boundary.tsx
 * @description React Error Boundary component for catching and displaying
 * runtime errors in component trees. Prevents entire app crashes.
 *
 * @module components/ui/error-boundary
 */

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { PREFIX, consoleError } from "@/lib/console";

interface ErrorBoundaryProps {
  /** Child components to protect */
  children: ReactNode;
  /** Custom fallback UI to render on error */
  fallback?: ReactNode;
  /** Custom fallback render function with error details */
  fallbackRender?: (props: {
    error: Error;
    resetErrorBoundary: () => void;
  }) => ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in its child
 * component tree, logs them, and displays a fallback UI.
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   fallbackRender={({ error, resetErrorBoundary }) => (
 *     <div>
 *       <p>Error: {error.message}</p>
 *       <button onClick={resetErrorBoundary}>Retry</button>
 *     </div>
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    consoleError(
      PREFIX.ERROR,
      `[ErrorBoundary] Caught error: ${error.message}`,
      error,
      errorInfo,
    );
    this.props.onError?.(error, errorInfo);
  }

  resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Custom render function takes priority
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }

      // Static fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="text-red-500 text-lg font-medium mb-2">
            Something went wrong
          </div>
          <p className="text-text-secondary text-sm mb-4 max-w-md">
            {this.state.error.message || "An unexpected error occurred"}
          </p>
          <button
            type="button"
            onClick={this.resetErrorBoundary}
            className="px-4 py-2 text-sm font-medium rounded-md bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-border transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
