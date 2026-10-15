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
  const searchInputRef = React.useRef<HTMLInputElement>(null);

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

  React.useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // Reset query on close
  React.useEffect(() => {
    if (!isOpen) {
      setQuery("");
    } else {
      // Focus search if opened
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Close desktop dropdown on click outside
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

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const isAutoSearchable = searchable || normalizedOptions.length > 7;

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

      {/* DESKTOP POPOVER (screen width >= 640px) */}
      {!isMobile && isOpen && (
        <div
          className={cn(
            "absolute z-[100] mt-1.5 w-full min-w-[200px] max-w-sm rounded-2xl border border-zinc-200/90 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md",
            align === "right" ? "right-0" : "left-0"
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

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto space-y-0.5 p-0.5 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400">No matching options</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
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
                          isSelected ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
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

                {/* Bottom Sheet Card */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 320 }}
                  className="relative z-10 w-full rounded-t-3xl border-t border-zinc-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 max-h-[85vh] flex flex-col"
                >
                  {/* Drag Handle */}
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />

                  {/* Header */}
                  <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-white/10">
                    <h3 className="font-extrabold text-base text-zinc-900 dark:text-zinc-100">{resolvedTitle}</h3>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Mobile Search Bar if searchable */}
                  {isAutoSearchable && (
                    <div className="mb-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={searchPlaceholder}
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

                  {/* Options List */}
                  <div className="overflow-y-auto space-y-1 flex-1 py-1 custom-scrollbar">
                    {filteredOptions.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-400">No matching options</div>
                    ) : (
                      filteredOptions.map((opt) => {
                        const isSelected = opt.value === value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
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
