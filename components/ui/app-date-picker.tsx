"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AppDatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  drawerTitle?: string;
  showClear?: boolean;
  align?: "left" | "right";
  required?: boolean;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIso(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      iso: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    };
  }
  const [y, m, d] = iso.split("-").map(Number);
  return {
    year: y!,
    month: m! - 1,
    day: d!,
    iso,
  };
}

function formatDisplayDate(iso?: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return iso;
}

export function AppDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  min,
  max,
  disabled = false,
  className,
  title,
  drawerTitle,
  showClear = true,
  align = "left",
}: AppDatePickerProps) {
  const resolvedTitle = drawerTitle || title || "Select Date";
  const [mounted, setMounted] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Month & Year currently being browsed in calendar view
  const currentParsed = React.useMemo(() => parseIso(value), [value]);
  const [viewYear, setViewYear] = React.useState<number>(currentParsed.year);
  const [viewMonth, setViewMonth] = React.useState<number>(currentParsed.month);

  const todayIso = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  React.useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Update view month when value changes or calendar opens
  React.useEffect(() => {
    if (value) {
      const p = parseIso(value);
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [value, isOpen]);

  // Close desktop popover when clicking outside
  React.useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (iso: string) => {
    onChange(iso);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    onChange(todayIso);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setIsOpen(false);
  };

  // Build grid days
  const calendarCells = React.useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      iso: string;
      inCurrentMonth: boolean;
      isDisabled: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const iso = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        iso,
        inCurrentMonth: false,
        isDisabled: Boolean((min && iso < min) || (max && iso > max)),
        isToday: iso === todayIso,
        isSelected: iso === value,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        iso,
        inCurrentMonth: true,
        isDisabled: Boolean((min && iso < min) || (max && iso > max)),
        isToday: iso === todayIso,
        isSelected: iso === value,
      });
    }

    // Next month padding
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const iso = `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        iso,
        inCurrentMonth: false,
        isDisabled: Boolean((min && iso < min) || (max && iso > max)),
        isToday: iso === todayIso,
        isSelected: iso === value,
      });
    }

    return cells;
  }, [viewYear, viewMonth, min, max, todayIso, value]);

  // Calendar Content Render (used in both popover and bottom sheet)
  const renderCalendarBody = () => (
    <div className="space-y-3.5 select-none">
      {/* Month & Year Navigation */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700/80 cursor-pointer transition-colors"
          title="Previous Month"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="text-center font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
          <span>{MONTH_NAMES[viewMonth]}</span>
          <span className="text-zinc-400 dark:text-zinc-500 font-semibold">{viewYear}</span>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700/80 cursor-pointer transition-colors"
          title="Next Month"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
        {WEEKDAYS.map((w, idx) => (
          <div key={idx} className="py-0.5">
            {w}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((cell) => {
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={cell.isDisabled}
              onClick={() => handleSelectDate(cell.iso)}
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer relative",
                cell.isDisabled && "opacity-25 pointer-events-none",
                !cell.inCurrentMonth && "text-zinc-400/60 dark:text-zinc-600",
                cell.inCurrentMonth && !cell.isSelected && "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10",
                cell.isToday && !cell.isSelected && "border border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/5",
                cell.isSelected && "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600 dark:ring-blue-500 font-extrabold"
              )}
            >
              {cell.day}
              {cell.isToday && !cell.isSelected && (
                <span className="absolute bottom-1 size-1 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Shortcuts: Clear & Today */}
      <div className={cn("flex items-center border-t border-zinc-100 dark:border-white/10 pt-2.5 px-0.5", showClear ? "justify-between" : "justify-end")}>
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer transition-colors"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={handleSelectToday}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer transition-colors"
        >
          <Sparkles className="size-3" />
          Today ({formatDisplayDate(todayIso)})
        </button>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 shadow-2xs transition-all dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 cursor-pointer hover:border-zinc-400 dark:hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          isOpen && "ring-2 ring-blue-500 border-blue-500 dark:border-blue-500",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <span className="truncate">
          {value ? formatDisplayDate(value) : <span className="text-zinc-400">{placeholder}</span>}
        </span>
        <CalendarIcon className="size-4 shrink-0 text-zinc-400" />
      </button>

      {/* DESKTOP POPOVER (screen width >= 640px) */}
      {!isMobile && isOpen && (
        <div
          className={cn(
            "absolute z-[100] mt-1.5 w-72 rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {renderCalendarBody()}
        </div>
      )}

      {/* MOBILE BOTTOM SHEET DRAWER (screen width < 640px) */}
      {isMobile &&
        mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div className="fixed inset-0 z-[10050] flex flex-col justify-end">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 bg-black/70 backdrop-blur-xs"
                />

                {/* Bottom Sheet Drawer */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 320 }}
                  className="relative z-10 w-full rounded-t-3xl border-t border-zinc-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 max-h-[90vh] overflow-y-auto"
                >
                  {/* Drag Handle */}
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />

                  {/* Header */}
                  <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <CalendarIcon className="size-4" />
                      </span>
                      <h3 className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100">{resolvedTitle}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Calendar view */}
                  {renderCalendarBody()}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
