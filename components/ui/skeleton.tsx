/**
 * @file components/ui/skeleton.tsx
 * @description Skeleton loading component for displaying loading states.
 * A simple animated placeholder that mimics content structure while loading.
 *
 * @module components/ui/skeleton
 */

import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Skeleton component for loading states.
 * Shows a pulsing animation to indicate content is loading.
 *
 * @example
 * ```tsx
 * <Skeleton className="h-12 w-12 rounded-full" />
 * <Skeleton className="h-4 w-[250px]" />
 * ```
 */
function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/**
 * Card skeleton for loading card-like content.
 */
function CardSkeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg-elevated p-6 space-y-4",
        className,
      )}
      {...props}
    >
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

// Pre-computed IDs for table row skeleton columns
const TABLE_COLUMN_IDS = ["col-a", "col-b", "col-c", "col-d", "col-e", "col-f"];

/**
 * Table row skeleton for loading table data.
 */
function TableRowSkeleton({
  columns = 4,
  className,
  ...props
}: SkeletonProps & { columns?: number }) {
  const columnIds = TABLE_COLUMN_IDS.slice(0, columns);

  return (
    <div
      className={cn("flex items-center gap-4 py-3 px-4", className)}
      {...props}
    >
      {columnIds.map((id) => (
        <Skeleton key={id} className="h-4 flex-1" />
      ))}
    </div>
  );
}

/**
 * List item skeleton for loading list content.
 */
function ListItemSkeleton({ className, ...props }: SkeletonProps) {
  return (
    <div className={cn("flex items-center gap-4 p-4", className)} {...props}>
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

// Static heights and IDs for chart bars (pre-computed to avoid random on each render)
const CHART_BARS = [
  { id: "bar-1", height: 65 },
  { id: "bar-2", height: 40 },
  { id: "bar-3", height: 85 },
  { id: "bar-4", height: 55 },
  { id: "bar-5", height: 75 },
  { id: "bar-6", height: 30 },
  { id: "bar-7", height: 90 },
  { id: "bar-8", height: 45 },
  { id: "bar-9", height: 70 },
  { id: "bar-10", height: 60 },
  { id: "bar-11", height: 80 },
  { id: "bar-12", height: 50 },
];

/**
 * Chart skeleton for loading chart components.
 */
function ChartSkeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg-elevated p-6",
        className,
      )}
      {...props}
    >
      <Skeleton className="h-6 w-1/4 mb-4" />
      <div className="flex items-end gap-2 h-48">
        {CHART_BARS.map((bar) => (
          <Skeleton
            key={bar.id}
            className="flex-1 rounded-t"
            style={{ height: `${bar.height}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export {
  Skeleton,
  CardSkeleton,
  TableRowSkeleton,
  ListItemSkeleton,
  ChartSkeleton,
};
