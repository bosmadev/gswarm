import type { ReactNode } from "react";

export interface TooltipProps {
  children?: ReactNode;
  content?: string | ReactNode;
  side?: string;
}

export interface TooltipTriggerProps {
  children?: ReactNode;
}

export interface TooltipContentProps {
  children?: ReactNode;
  content?: string | ReactNode;
  side?: string;
}

export interface TooltipProviderProps {
  children?: ReactNode;
  delayDuration?: number;
}

export const Tooltip = ({ children }: TooltipProps) => <>{children}</>;
export const TooltipTrigger = ({ children }: TooltipTriggerProps) => (
  <>{children}</>
);
export const TooltipContent = ({ children }: TooltipContentProps) => (
  <>{children}</>
);
export const TooltipProvider = ({ children }: TooltipProviderProps) => (
  <>{children}</>
);
