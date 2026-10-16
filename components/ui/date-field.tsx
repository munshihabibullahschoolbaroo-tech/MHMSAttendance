"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePickerPanel } from "@/components/ui/date-picker-panel";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar } from "@/lib/date/bs-calendar";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { cn } from "@/lib/utils";

export type DateFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Renders inside the card so title + value share one full-width tap target. */
  label?: string;
  /** IANA zone for the calendar “Today” / grid (defaults to app default zone). */
  timeZone?: string;
};

/**
 * Custom calendar field with desktop popover and mobile bottom sheet drawer.
 */
export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  (
    {
      className,
      value,
      onChange,
      id,
      disabled,
      label,
      timeZone,
      "aria-label": ariaLabel,
      ...rest
    },
    ref
  ) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const labelTextId = label ? `${inputId}-title` : undefined;
    const tz = normalizeTimeZoneId(timeZone);
    const { mode } = useCalendarMode();

    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);

    React.useEffect(() => {
      setMounted(true);
      const checkMobile = () => {
        setIsMobile(typeof window !== "undefined" && window.innerWidth < 640);
      };
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Lock body scroll on mobile when sheet is open
    React.useEffect(() => {
      if (!open || !isMobile || typeof document === "undefined") return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }, [open, isMobile]);

    const triggerButton = (
      <button
        type="button"
        disabled={disabled}
        id={inputId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby={label ? labelTextId : undefined}
        aria-label={label ? undefined : ariaLabel}
        onClick={isMobile ? () => !disabled && setOpen((prev) => !prev) : undefined}
        className={cn(
          "group relative block w-full min-w-0 max-w-full cursor-pointer overflow-hidden rounded-2xl text-left",
          "border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/90",
          "shadow-sm shadow-zinc-900/[0.04] ring-1 ring-inset ring-white/60",
          "transition-[box-shadow,border-color,transform] duration-200",
          "hover:border-cyan-500/35 hover:shadow-md hover:shadow-zinc-900/[0.06]",
          "active:scale-[0.995]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
          "dark:border-white/12 dark:from-zinc-950 dark:to-zinc-900/85 dark:shadow-black/20 dark:ring-white/[0.04]",
          "dark:hover:border-cyan-400/30 dark:focus-visible:ring-cyan-400/25 dark:focus-visible:ring-offset-zinc-950",
          open &&
            "border-cyan-600/70 shadow-md shadow-cyan-900/[0.08] ring-2 ring-cyan-500/35 dark:border-cyan-400/55 dark:ring-cyan-400/25",
          disabled && "pointer-events-none opacity-60",
          className
        )}
      >
        <div
          className={cn(
            "relative z-0 flex min-h-[3.25rem] w-full min-w-0 flex-col justify-center",
            label ? "gap-0.5 px-4 pb-3 pt-3" : "gap-0 px-4 py-3"
          )}
        >
          {label ? (
            <>
              <span
                id={labelTextId}
                className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400"
              >
                {label}
              </span>
              <div className="flex min-h-[1.5rem] items-center gap-3">
                <CalendarDays
                  className="size-5 shrink-0 text-cyan-600 dark:text-cyan-400"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {formatIsoForCalendar(value, mode, tz)}
                </span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-zinc-400 transition-transform duration-200",
                    "group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-400",
                    open && "rotate-180 text-cyan-600 dark:text-cyan-400"
                  )}
                  aria-hidden
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <CalendarDays
                className="size-5 shrink-0 text-cyan-600 dark:text-cyan-400"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {formatIsoForCalendar(value, mode, tz)}
              </span>
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-zinc-400 transition-transform duration-200",
                  "group-hover:text-cyan-600 dark:text-zinc-500 dark:group-hover:text-cyan-400",
                  open && "rotate-180 text-cyan-600 dark:text-cyan-400"
                )}
                aria-hidden
              />
            </div>
          )}
        </div>
      </button>
    );

    return (
      <>
        {/* DESKTOP POPOVER (screen width >= 640px) */}
        {!isMobile ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              className={cn(
                "z-[100100] w-[min(calc(100vw-1rem),20rem)] max-w-[min(calc(100vw-1rem),20rem)] border-0 bg-transparent p-0 shadow-none",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
              )}
            >
              <DatePickerPanel
                selectedIso={value}
                timeZone={tz}
                onSelect={(iso) => {
                  onChange(iso);
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        ) : (
          /* On mobile, direct trigger button without Popover */
          triggerButton
        )}

        {/* MOBILE BOTTOM SHEET DRAWER (screen width < 640px) */}
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
                          {label || "Select Date"}
                        </h3>
                        <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                          Selected: {formatIsoForCalendar(value, mode, tz)}
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

                    {/* Calendar Content */}
                    <div className="flex-1 overflow-y-auto pt-4 flex justify-center">
                      <div className="w-full max-w-sm">
                        <DatePickerPanel
                          selectedIso={value}
                          timeZone={tz}
                          onSelect={(iso) => {
                            onChange(iso);
                            setOpen(false);
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body
          )}

        <input
          ref={ref}
          type="hidden"
          value={value}
          readOnly
          tabIndex={-1}
          aria-hidden
          {...rest}
        />
      </>
    );
  }
);
DateField.displayName = "DateField";
