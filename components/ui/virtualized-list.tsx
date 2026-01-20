/**
 * @file components/ui/virtualized-list.tsx
 * @description Virtualized List component using @tanstack/react-virtual.
 * Provides performant rendering of large lists by only rendering visible items.
 *
 * @module components/ui/virtualized-list
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import { cn } from "@/lib/utils";

interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the container in pixels */
  containerHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Additional class names for the container */
  className?: string;
  /** Overscan count - number of items to render above/below visible area */
  overscan?: number;
  /** Gap between items in pixels */
  gap?: number;
  /** Unique key extractor function */
  getItemKey?: (item: T, index: number) => string | number;
}

function VirtualizedList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  className,
  overscan = 5,
  gap = 0,
  getItemKey,
}: VirtualizedListProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight + gap,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto", className)}
      style={{ height: containerHeight }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${itemHeight}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface VirtualizedGridProps<T> {
  /** Array of items to render */
  items: T[];
  /** Width of each item in pixels */
  itemWidth: number;
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the container in pixels */
  containerHeight: number;
  /** Number of columns */
  columns: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Additional class names for the container */
  className?: string;
  /** Overscan count - number of rows to render above/below visible area */
  overscan?: number;
  /** Gap between items in pixels */
  gap?: number;
}

function VirtualizedGrid<T>({
  items,
  itemWidth,
  itemHeight,
  containerHeight,
  columns,
  renderItem,
  className,
  overscan = 2,
  gap = 0,
}: VirtualizedGridProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight + gap,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto", className)}
      style={{ height: containerHeight }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${itemHeight}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, colIndex) =>
                renderItem(item, startIndex + colIndex),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { VirtualizedGrid, VirtualizedList };
export type { VirtualizedGridProps, VirtualizedListProps };
