/**
 * @file components/ui/sortable.tsx
 * @description Drag and Drop sortable components using @dnd-kit.
 * Provides sortable lists and grids with smooth animations.
 *
 * @module components/ui/sortable
 */

"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as React from "react";
import { cn } from "@/lib/utils";

// ==========================================
// Types
// ==========================================

interface SortableItem {
  id: string | number;
}

interface SortableListProps<T extends SortableItem> {
  /** Array of items to render. Each item must have a unique `id` property. */
  items: T[];
  /** Callback when items are reordered */
  onReorder: (items: T[]) => void;
  /** Render function for each item */
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode;
  /** Render function for the drag overlay */
  renderOverlay?: (item: T) => React.ReactNode;
  /** Direction of the list */
  direction?: "vertical" | "horizontal" | "grid";
  /** Additional class names for the container */
  className?: string;
  /** Whether items can be dragged */
  disabled?: boolean;
}

interface SortableItemComponentProps {
  /** Unique identifier for the item */
  id: string | number;
  /** Whether the item is disabled for dragging */
  disabled?: boolean;
  /** Child content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

// ==========================================
// Sortable List Component
// ==========================================

function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  renderOverlay,
  direction = "vertical",
  className,
  disabled = false,
}: SortableListProps<T>) {
  const [activeId, setActiveId] = React.useState<string | number | null>(null);
  const activeItem = items.find((item) => item.id === activeId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const strategy =
    direction === "vertical"
      ? verticalListSortingStrategy
      : direction === "horizontal"
        ? horizontalListSortingStrategy
        : rectSortingStrategy;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }

    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={strategy}
        disabled={disabled}
      >
        <div
          className={cn(
            direction === "vertical" && "flex flex-col gap-2",
            direction === "horizontal" && "flex flex-row gap-2",
            direction === "grid" && "grid gap-2",
            className,
          )}
        >
          {items.map((item, index) => (
            <SortableItemWrapper key={item.id} id={item.id} disabled={disabled}>
              {renderItem(item, index, item.id === activeId)}
            </SortableItemWrapper>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem && renderOverlay
          ? renderOverlay(activeItem)
          : activeItem &&
            renderItem(
              activeItem,
              items.findIndex((i) => i.id === activeItem.id),
              true,
            )}
      </DragOverlay>
    </DndContext>
  );
}

// ==========================================
// Sortable Item Wrapper
// ==========================================

function SortableItemWrapper({
  id,
  disabled = false,
  children,
  className,
}: SortableItemComponentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("touch-none", isDragging && "z-50", className)}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// ==========================================
// Sortable Handle Component
// ==========================================

interface SortableHandleProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * A drag handle component that can be placed inside a sortable item.
 * Only this element will initiate dragging.
 */
function SortableHandle({ children, className }: SortableHandleProps) {
  return (
    <div className={cn("cursor-grab active:cursor-grabbing", className)}>
      {children}
    </div>
  );
}

// ==========================================
// Exports
// ==========================================

export {
  SortableList,
  SortableItemWrapper as SortableItem,
  SortableHandle,
  arrayMove,
};
export type {
  SortableListProps,
  SortableItemComponentProps,
  SortableItem as SortableItemType,
};
