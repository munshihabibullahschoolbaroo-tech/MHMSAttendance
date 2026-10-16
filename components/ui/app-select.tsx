"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
}

export interface AppSelectProps {
  value?: string;
  onChange: (val: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  title?: string;
  drawerTitle?: string;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  align?: "left" | "right";
  id?: string;
}

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  searchable = false,
  searchPlaceholder = "Search options...",
  title,
  drawerTitle,
  disabled = false,
  className,
  icon,
  align = "left",
  id,
}: AppSelectProps) {
  const resolvedTitle = drawerTitle || title || "Select Option";
  const [mounted, setMounted] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const [popoverCoords, setPopoverCoords] = React.useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ left: 0, width: 240, maxHeight: 250 });

  // Normalize options to SelectOption objects
  const normalizedOptions: SelectOption[] = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  const selectedOption = normalizedOptions.find((o) => o.value === value);
  const isAutoSearchable = searchable || normalizedOptions.length > 12;

  React.useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const updatePosition = React.useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - rect.bottom - 16;
    const spaceAbove = rect.top - 16;

    // Static bounded max height for dropdown card (comfortable size on desktop/tablets, ~6-7 items visible)
    const preferredMaxHeight = isAutoSearchable ? 290 : 250;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;

    const width = rect.width;
    const left =
      align === "right"
        ? Math.max(8, Math.min(rect.right - width, vw - width - 8))
        : Math.max(8, Math.min(rect.left, vw - width - 8));

    if (openUpward) {
      setPopoverCoords({
        bottom: vh - rect.top + 6,
        left,
        width,
        maxHeight: Math.min(spaceAbove, preferredMaxHeight),
      });
    } else {
      setPopoverCoords({
        top: rect.bottom + 6,
        left,
        width,
        maxHeight: Math.min(spaceBelow, preferredMaxHeight),
      });
    }
  }, [isAutoSearchable]);

  React.useEffect(() => {
    if (!isOpen || isMobile) return;
    updatePosition();
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, isMobile, updatePosition]);

  // Filtered options based on search query
  const filteredOptions = React.useMemo(() => {
    if (!query.trim()) return normalizedOptions;
    const q = query.trim().toLowerCase();
    return normalizedOptions.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q);
      const matchValue = opt.value.toLowerCase().includes(q);
      const matchSub = opt.sublabel?.toLowerCase().includes(q);
      const matchBadge = opt.badge?.toLowerCase().includes(q);
      return matchLabel || matchValue || matchSub || matchBadge;
    });
  }, [normalizedOptions, query]);

  // Reset query on close; focus search on desktop/tablets
  React.useEffect(() => {
    if (!isOpen) {
      setQuery("");
    } else if (!isMobile) {
      setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 50);
    }
  }, [isOpen, isMobile]);

  // Auto-scroll to selected option when opened
  React.useEffect(() => {
    if (isOpen && !isMobile) {
      const timer = setTimeout(() => {
        const selectedEl = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: "nearest" });
        }
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMobile]);

  // Mobile list ref & safe inner-list auto-scroll (never scrolls window)
  const mobileListRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (isOpen && isMobile && mobileListRef.current) {
      const timer = setTimeout(() => {
        const list = mobileListRef.current;
        if (!list) return;
        const selectedEl = list.querySelector<HTMLElement>('[data-selected="true"]');
        if (selectedEl) {
          const top = selectedEl.offsetTop - list.offsetTop;
          list.scrollTo({ top: Math.max(0, top - 20), behavior: "smooth" });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMobile]);

  // Lock body scroll when mobile drawer is open to prevent page bounce/rubber-banding
  React.useEffect(() => {
    if (!isOpen || !isMobile) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isMobile]);

  // Close desktop/tablet dropdown on click or tap outside
  React.useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, isMobile]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      {/* Trigger Button */}
      <button
        id={id}
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
        <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
          {icon && <span className="shrink-0 text-zinc-400">{icon}</span>}
          {selectedOption ? (
            <span className="truncate">{selectedOption.label}</span>
          ) : (
            <span className="text-zinc-400 truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-zinc-400 transition-transform duration-200",
            isOpen && "rotate-180 text-blue-500"
          )}
        />
      </button>

      {/* DESKTOP POPOVER (screen width >= 640px) portaled to document.body */}
      {!isMobile &&
        isOpen &&
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
              zIndex: 100100,
            }}
            className={cn(
              "z-[100100] rounded-2xl border border-zinc-200/90 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            )}
          >
            {/* Search bar inside desktop popover if searchable */}
            {isAutoSearchable && (
              <div className="p-1 pb-1.5 border-b border-zinc-100 dark:border-white/10 mb-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full h-8 pl-8 pr-7 text-xs rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List: bounded height and smoothly scrollable for desktop & tablets */}
            <div
              ref={listRef}
              style={{
                maxHeight: `${Math.max(120, popoverCoords.maxHeight - (isAutoSearchable ? 52 : 12))}px`,
              }}
              className="space-y-0.5 p-0.5 overflow-y-auto overscroll-contain custom-scrollbar"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-400">No matching options</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-selected={isSelected ? "true" : undefined}
                      disabled={opt.disabled}
                      onClick={() => handleSelect(opt.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-left transition-colors cursor-pointer",
                        opt.disabled && "opacity-40 cursor-not-allowed",
                        isSelected
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div
                            className={cn(
                              "text-[10px] font-normal truncate mt-0.5",
                              isSelected ? "text-blue-100" : "text-zinc-400"
                            )}
                          >
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                      {opt.badge && (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
                          )}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check className="size-3.5 shrink-0 ml-1 text-white" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}

      {/* MOBILE BOTTOM SHEET DRAWER (screen width < 768px) */}
      {isMobile &&
        mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div className="fixed inset-0 z-[100500] flex flex-col justify-end overflow-hidden overscroll-none">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 bg-black/70 backdrop-blur-xs"
                />

                {/* Bottom Sheet Card */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 280 }}
                  className="relative z-10 w-full rounded-t-[28px] border-t border-zinc-200 bg-white p-5 pb-8 shadow-2xl dark:border-white/10 dark:bg-zinc-950 max-h-[85dvh] flex flex-col overflow-hidden"
                >
                  {/* Drag Handle */}
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />

                  {/* Header */}
                  <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-white/10 shrink-0">
                    <h3 className="font-extrabold text-base text-zinc-900 dark:text-zinc-100">{resolvedTitle}</h3>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20 cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Mobile Search Bar if searchable */}
                  {isAutoSearchable && (
                    <div className="mb-3 shrink-0">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={searchPlaceholder}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          className="w-full h-10 pl-9 pr-8 text-xs rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {query && (
                          <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Options List: strictly scrollable list */}
                  <div
                    ref={mobileListRef}
                    style={{ WebkitOverflowScrolling: "touch" }}
                    className="overflow-y-auto overscroll-contain space-y-1 flex-1 min-h-0 py-1 custom-scrollbar"
                  >
                    {filteredOptions.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-400">No matching options</div>
                    ) : (
                      filteredOptions.map((opt) => {
                        const isSelected = opt.value === value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            data-selected={isSelected ? "true" : undefined}
                            disabled={opt.disabled}
                            onClick={() => handleSelect(opt.value)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-xs font-semibold text-left transition-colors cursor-pointer active:scale-[0.99]",
                              opt.disabled && "opacity-40 cursor-not-allowed",
                              isSelected
                                ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20"
                                : "text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-100 dark:border-white/5"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold truncate">{opt.label}</div>
                              {opt.sublabel && (
                                <div
                                  className={cn(
                                    "text-[11px] font-normal truncate mt-0.5",
                                    isSelected ? "text-blue-100" : "text-zinc-500 dark:text-zinc-400"
                                  )}
                                >
                                  {opt.sublabel}
                                </div>
                              )}
                            </div>
                            {opt.badge && (
                              <span
                                className={cn(
                                  "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                                  isSelected ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
                                )}
                              >
                                {opt.badge}
                              </span>
                            )}
                            {isSelected && <Check className="size-4 shrink-0 text-white" />}
                          </button>
                        );
                      })
                    )}
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
