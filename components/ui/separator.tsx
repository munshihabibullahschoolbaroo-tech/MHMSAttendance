"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
  fade?: boolean;
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  (
    {
      className,
      orientation = "horizontal",
      decorative = true,
      fade = true,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        role={decorative ? "none" : "separator"}
        aria-orientation={orientation}
        className={cn(
          "shrink-0",
          orientation === "horizontal"
            ? cn(
                "h-px w-full",
                fade
                  ? "bg-gradient-to-r from-transparent via-zinc-300/80 to-transparent dark:via-white/15"
                  : "bg-zinc-200 dark:bg-white/10"
              )
            : cn(
                "h-full w-px",
                fade
                  ? "bg-gradient-to-b from-transparent via-zinc-300/80 to-transparent dark:via-white/15"
                  : "bg-zinc-200 dark:bg-white/10"
              ),
          className
        )}
        {...props}
      />
    );
  }
);
Separator.displayName = "Separator";
