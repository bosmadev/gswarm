/**
 * @file components/ui/modal.tsx
 * @description Modal component for displaying content in an overlay.
 * Supports different sizes, custom footer, and keyboard interactions (ESC to close).
 *
 * @module components/ui/modal
 */

"use client";

import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should be closed */
  onClose: () => void;
  /** Title of the modal */
  title?: string;
  /** Description of the modal */
  description?: string;
  /** Content to display in the modal */
  children: React.ReactNode;
  /** Size of the modal */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Whether to close the modal when clicking the overlay */
  closeOnOverlayClick?: boolean;
  /** Content to display in the footer */
  footer?: React.ReactNode;
  /** Additional CSS classes for the modal container */
  className?: string;
}

const sizeClasses: Record<"sm" | "md" | "lg" | "xl" | "full", string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[95vw] max-h-[95vh]",
};

/**
 * Modal component for displaying content in an overlay.
 *
 * @component
 * @example
 * ```tsx
 * <Modal
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   title="Confirmation"
 *   description="Are you sure you want to proceed?"
 *   footer={<Button onClick={onClose}>Cancel</Button>}
 * >
 *   <p>This action cannot be undone.</p>
 * </Modal>
 * ```
 */
const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
  className,
}: ModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<Element | null>(null);
  const instanceId = React.useId();
  const titleId = `modal-title-${instanceId}`;
  const descId = `modal-desc-${instanceId}`;

  // Capture the triggering element before modal opens
  React.useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
    } else {
      // Restore focus to trigger when modal closes
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }
  }, [isOpen]);

  // Move focus into modal when it opens
  React.useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusable =
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        modalRef.current.focus();
      }
    }
  }, [isOpen]);

  // Handle ESC key press + focus trap via Tab/Shift+Tab
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modalRef.current) return;

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
        ).filter((el) => !el.closest('[tabindex="-1"]') && el.tabIndex >= 0);

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0] as HTMLElement | undefined;
        const last = focusable[focusable.length - 1] as HTMLElement | undefined;
        if (!first || !last) return;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
    >
      {/* Overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm border-none cursor-default"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-label="Close modal overlay"
        tabIndex={-1}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative w-full bg-bg-elevated border-2 border-border rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none",
          sizeClasses[size],
          className,
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-6 border-b border-border">
            <div className="flex-1">
              {title && (
                <h2
                  id={titleId}
                  className="text-xl font-bold text-text-primary"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="text-sm text-text-secondary mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="ml-4 text-text-secondary hover:text-text-primary transition-colors rounded-lg p-1 hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-orange focus:ring-offset-2 focus:ring-offset-bg-elevated"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
