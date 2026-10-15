import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number;
  priority?: boolean;
};

/**
 * MHMS (Munshi Habibullah Mission School, Kargil) Official School Logo.
 * Displays the authentic school seal ("We Learn To Serve — Munshi Habibullah Mission School — Since 2004").
 */
export function MhmsMark({ className, size = 120, priority = false }: Props) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center select-none overflow-hidden rounded-full drop-shadow-md",
        className
      )}
    >
      <Image
        src="/branding/mhms-logo.png"
        alt="Munshi Habibullah Mission School Emblem"
        width={size}
        height={size}
        priority={priority}
        loading="eager"
        className="h-full w-full object-contain rounded-full transition-transform hover:scale-105"
      />
    </span>
  );
}
