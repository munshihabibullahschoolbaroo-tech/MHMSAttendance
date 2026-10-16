"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppTimePickerProps {
  value: string; // e.g. "09:00" or "09:00 AM" or "16:30"
  onChange: (val24: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
}

const PRESET_TIMES = [
  { label: "08:00 AM", h: 8, m: 0, p: "AM" },
  { label: "08:30 AM", h: 8, m: 30, p: "AM" },
  { label: "09:00 AM", h: 9, m: 0, p: "AM" },
  { label: "09:30 AM", h: 9, m: 30, p: "AM" },
  { label: "10:00 AM", h: 10, m: 0, p: "AM" },
  { label: "01:00 PM", h: 1, m: 0, p: "PM" },
  { label: "02:00 PM", h: 2, m: 0, p: "PM" },
  { label: "03:30 PM", h: 3, m: 30, p: "PM" },
  { label: "04:00 PM", h: 4, m: 0, p: "PM" },
  { label: "05:00 PM", h: 5, m: 0, p: "PM" },
] as const;

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** Converts 24h string "HH:mm" to 12h parts */
function parseTo12h(val: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  if (!val) return { hour12: 9, minute: 0, period: "AM" };
  const trimmed = val.trim();

  // If already 12h: e.g. "09:00 AM"
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    const p = m12[3].toUpperCase() as "AM" | "PM";
    if (h > 12) h = 12;
    if (h === 0) h = 12;
    return { hour12: h, minute: m, period: p };
  }

  // 24h: e.g. "09:00" or "16:30"
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h24 = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const hour12 = h24 % 12 || 12;
    return { hour12, minute: m, period };
  }

  return { hour12: 9, minute: 0, period: "AM" };
}

/** Converts 12h parts to 24h string "HH:mm" */
function to24h(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12;
  if (period === "AM" && hour12 === 12) h24 = 0;
  if (period === "PM" && hour12 < 12) h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Formats 12h parts for display string e.g. "09:00 AM" */
function toDisplay(hour12: number, minute: number, period: "AM" | "PM"): string {
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

export function AppTimePicker({
  value,
  onChange,
  label,
  id,
  disabled = false,
  className,
  align = "left",
}: AppTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const [popoverCoords, setPopoverCoords] = React.useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ left: 0, width: 320 });

  const parsed = React.useMemo(() => parseTo12h(value), [value]);
  const [hour12, setHour12] = React.useState(parsed.hour12);
  const [minute, setMinute] = React.useState(parsed.minute);
  const [period, setPeriod] = React.useState<"AM" | "PM">(parsed.period);

  React.useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  React.useEffect(() => {
    const p = parseTo12h(value);
    setHour12(p.hour12);
    setMinute(p.minute);
    setPeriod(p.period);
  }, [value]);

  const updatePosition = React.useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const popoverWidth = Math.max(300, Math.min(320, rect.width));
    const popoverHeight = 330;

    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

    let left = align === "right" ? rect.right - popoverWidth : rect.left;
    if (left + popoverWidth > vw - 12) {
      left = vw - popoverWidth - 12;
    }
    if (left < 12) left = 12;

    if (openUpward) {
      setPopoverCoords({
        bottom: vh - rect.top + 6,
        left,
        width: popoverWidth,
      });
    } else {
      setPopoverCoords({
        top: rect.bottom + 6,
        left,
        width: popoverWidth,
      });
    }
  }, [align]);

  React.useEffect(() => {
    if (!open || isMobile) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, isMobile, updatePosition]);

  // Click outside to close (desktop only)
  React.useEffect(() => {
    if (!open || isMobile) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open, isMobile]);

  // Lock body scroll on mobile when sheet is open
  React.useEffect(() => {
    if (!open || !isMobile || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const commitTime = (h: number, m: number, p: "AM" | "PM") => {
    setHour12(h);
    setMinute(m);
    setPeriod(p);
    const val24 = to24h(h, m, p);
    onChange(val24);
  };

  const displayStr = toDisplay(hour12, minute, period);

  return (
    <div className={cn("relative flex flex-col gap-1.5", className)} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-zinc-300 bg-white px-3.5 text-sm font-semibold text-zinc-900 transition-colors dark:border-white/15 dark:bg-zinc-900 dark:text-white cursor-pointer",
          open && "ring-2 ring-blue-500 border-blue-500",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="flex items-center gap-2">
          <Clock className="size-4 text-zinc-400 dark:text-zinc-500" />
          <span className="tracking-wide font-mono">{displayStr}</span>
        </span>
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>

      {/* DESKTOP POPOVER (screen width >= 768px) portaled to document.body */}
      {!isMobile &&
        open &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverCoords.top !== undefined ? `${popoverCoords.top}px` : undefined,
              bottom: popoverCoords.bottom !== undefined ? `${popoverCoords.bottom}px` : undefined,
              left: `${popoverCoords.left}px`,
              width: `${popoverCoords.width}px`,
              zIndex: 100500,
            }}
            className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 sm:w-80"
          >
            {/* Presets Row */}
            <div className="mb-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Quick Presets
              </span>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto no-scrollbar">
                {PRESET_TIMES.map((preset) => {
                  const isActive =
                    hour12 === preset.h &&
                    Math.abs(minute - preset.m) < 3 &&
                    period === preset.p;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        commitTime(preset.h, preset.m, preset.p);
                      }}
                      className={cn(
                        "rounded-lg px-2 py-1 text-[11px] font-semibold border transition-all cursor-pointer",
                        isActive
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-white/10"
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
              {/* Hours Column */}
              <div className="flex flex-col gap-1">
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Hour
                </span>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
                  {HOURS.map((h) => {
                    const isSel = hour12 === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => commitTime(h, minute, period)}
                        className={cn(
                          "h-8 rounded-lg text-xs font-bold transition-colors flex items-center justify-center cursor-pointer",
                          isSel
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-zinc-50 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10"
                        )}
                      >
                        {String(h).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Minutes Column */}
              <div className="flex flex-col gap-1">
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Min
                </span>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
                  {MINUTES.map((m) => {
                    const isSel = minute === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => commitTime(hour12, m, period)}
                        className={cn(
                          "h-8 rounded-lg text-xs font-bold transition-colors flex items-center justify-center cursor-pointer",
                          isSel
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-zinc-50 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10"
                        )}
                      >
                        {String(m).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Period (AM/PM) Column */}
              <div className="flex flex-col gap-1">
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Period
                </span>
                <div className="flex flex-col gap-1.5">
                  {(["AM", "PM"] as const).map((p) => {
                    const isSel = period === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => commitTime(hour12, minute, p)}
                        className={cn(
                          "h-10 rounded-xl text-xs font-black transition-all border flex items-center justify-center gap-1 cursor-pointer",
                          isSel
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-zinc-50 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10"
                        )}
                      >
                        {isSel && <Check className="size-3.5" />}
                        <span>{p}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Done Button */}
            <div className="mt-3 border-t border-zinc-100 pt-2.5 dark:border-white/10">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-xl bg-zinc-900 py-1.5 text-center text-xs font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* MOBILE BOTTOM SHEET DRAWER (screen width < 768px) */}
      {isMobile &&
        mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[100500] flex flex-col justify-end overflow-hidden overscroll-none">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setOpen(false)}
                  onTouchMove={(e) => e.preventDefault()}
                  className="fixed inset-0 bg-black/70 backdrop-blur-xs"
                />

                {/* Bottom Sheet Card */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 320 }}
                  className="relative z-10 w-full rounded-t-[28px] border-t border-zinc-200 bg-white p-5 pb-8 shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e] text-zinc-900 dark:text-white max-h-[85dvh] flex flex-col overflow-hidden"
                >
                  {/* Drag Handle */}
                  <div
                    onTouchMove={(e) => e.preventDefault()}
                    className="mx-auto mb-2.5 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0"
                  />

                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-white/10 shrink-0">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {label || "Select Time"}
                      </h3>
                      <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                        Selected: {displayStr}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 cursor-pointer"
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Scrollable Presets and Column Selectors */}
                  <div className="flex-1 overflow-y-auto pt-3 space-y-4">
                    {/* Quick Presets */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                        Quick Presets
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_TIMES.map((preset) => {
                          const isActive =
                            hour12 === preset.h &&
                            Math.abs(minute - preset.m) < 3 &&
                            period === preset.p;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                commitTime(preset.h, preset.m, preset.p);
                              }}
                              className={cn(
                                "rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all cursor-pointer",
                                isActive
                                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                  : "bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-white/10"
                              )}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Columns: Hour, Minute, Period */}
                    <div className="grid grid-cols-3 gap-2.5 pt-1">
                      {/* Hours Column */}
                      <div className="flex flex-col gap-1">
                        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Hour
                        </span>
                        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
                          {HOURS.map((h) => {
                            const isSel = hour12 === h;
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => commitTime(h, minute, period)}
                                className={cn(
                                  "h-9 rounded-xl text-xs font-bold transition-colors flex items-center justify-center cursor-pointer",
                                  isSel
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "bg-zinc-50 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10"
                                )}
                              >
                                {String(h).padStart(2, "0")}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Minutes Column */}
                      <div className="flex flex-col gap-1">
                        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Minute
                        </span>
                        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
                          {MINUTES.map((m) => {
                            const isSel = minute === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => commitTime(hour12, m, period)}
                                className={cn(
                                  "h-9 rounded-xl text-xs font-bold transition-colors flex items-center justify-center cursor-pointer",
                                  isSel
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "bg-zinc-50 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10"
                                )}
                              >
                                {String(m).padStart(2, "0")}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Period Column */}
                      <div className="flex flex-col gap-1">
                        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          AM / PM
                        </span>
                        <div className="flex flex-col gap-2">
                          {(["AM", "PM"] as const).map((p) => {
                            const isSel = period === p;
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => commitTime(hour12, minute, p)}
                                className={cn(
                                  "h-12 rounded-xl text-sm font-black transition-all border flex items-center justify-center gap-1 cursor-pointer",
                                  isSel
                                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                    : "bg-zinc-50 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10"
                                )}
                              >
                                {isSel && <Check className="size-4" />}
                                <span>{p}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Done Button */}
                  <div className="pt-3 border-t border-zinc-100 dark:border-white/10 mt-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-center text-sm font-bold text-white transition-colors cursor-pointer shadow-sm active:scale-[0.99]"
                    >
                      Set Time ({displayStr})
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
