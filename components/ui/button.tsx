import type { ReactNode } from "react";

export interface ButtonProps {
  children?: ReactNode;
  variant?: string;
  size?: string;
  className?: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  type?: "button" | "submit" | "reset";
}

export const Button = ({ children, onClick }: ButtonProps) => (
  <button type="button" onClick={onClick}>
    {children}
  </button>
);
