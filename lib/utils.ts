/**
 * @file lib/utils.ts
 * @description Utility functions for the application.
 * Includes class name merging utilities for Tailwind CSS.
 *
 * @module lib/utils
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names using clsx and tailwind-merge.
 * This allows for conditional classes and proper Tailwind class deduplication.
 *
 * @example
 * ```tsx
 * cn("px-2 py-1", condition && "bg-red-500", "px-4")
 * // Returns: "py-1 px-4" (px-4 overrides px-2) or "py-1 bg-red-500 px-4" if condition is true
 * ```
 *
 * @param inputs - Class values to merge
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
