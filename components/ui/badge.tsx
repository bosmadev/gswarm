import type { ReactNode } from "react";

export interface BadgeProps {
  children?: ReactNode;
  variant?: string;
  size?: string;
  className?: string;
}

export const Badge = ({ children }: BadgeProps) => <span>{children}</span>;
