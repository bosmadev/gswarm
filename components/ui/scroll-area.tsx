import type { ReactNode, RefObject, UIEventHandler } from "react";

export interface ScrollAreaProps {
  children?: ReactNode;
  className?: string;
  ref?: RefObject<HTMLDivElement | null>;
  onScrollCapture?: UIEventHandler<HTMLDivElement>;
}

export const ScrollArea = ({
  children,
  className,
  onScrollCapture,
}: ScrollAreaProps) => (
  <div className={className} onScrollCapture={onScrollCapture}>
    {children}
  </div>
);
