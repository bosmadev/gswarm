/**
 * @file components/ui/collapsible.tsx
 * @description Collapsible component using Radix UI.
 * Provides expandable/collapsible content sections with smooth animations.
 *
 * @module components/ui/collapsible
 */

"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

const CollapsibleContent = CollapsiblePrimitive.Content;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
