"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        disabled
        className={cn(
          "size-9 sm:size-10 rounded-full flex items-center justify-center bg-white/10 dark:bg-white/[0.08] backdrop-blur-xl border border-white/20 dark:border-white/15 text-zinc-800 dark:text-zinc-100 shadow-sm opacity-50",
          className
        )}
      >
        <Sun className="size-4 sm:size-4.5" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "group relative size-9 sm:size-10 rounded-full flex items-center justify-center bg-white/10 dark:bg-white/[0.08] backdrop-blur-xl border border-white/20 dark:border-white/15 text-zinc-800 dark:text-zinc-100 shadow-sm transition-all duration-300 hover:bg-white/20 dark:hover:bg-white/15 hover:scale-105 active:scale-95 cursor-pointer",
        className
      )}
    >
      {isDark ? (
        <Sun className="size-4 sm:size-4.5 text-amber-400 stroke-[2] transition-transform duration-300 group-hover:rotate-45" />
      ) : (
        <Moon className="size-4 sm:size-4.5 text-zinc-700 dark:text-zinc-200 stroke-[2] transition-transform duration-300 group-hover:-rotate-12" />
      )}
    </button>
  );
}

