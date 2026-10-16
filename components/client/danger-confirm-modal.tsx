"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DangerConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  subtitle?: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmPhrase?: string; // If provided, user must type this exact text to enable confirm button
  loading?: boolean;
  variant?: "danger" | "warning";
};

export function DangerConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Danger zone",
  subtitle,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmPhrase,
  loading = false,
  variant = "danger",
}: DangerConfirmModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [typedPhrase, setTypedPhrase] = React.useState("");

  React.useEffect(() => {
    setMounted(true);
    if (!open) {
      setTypedPhrase("");
    }
  }, [open]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  if (!mounted) return null;

  const phraseMatches = !confirmPhrase || typedPhrase.trim() === confirmPhrase.trim();
  const isDanger = variant === "danger";

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100150] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              if (!loading) onClose();
            }}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", damping: 25, stiffness: 320 }}
            className={cn(
              "relative z-10 w-full max-w-lg rounded-3xl border bg-zinc-950 p-6 text-zinc-100 shadow-2xl space-y-4",
              isDanger
                ? "border-red-500/30 ring-1 ring-red-500/20"
                : "border-amber-500/30 ring-1 ring-amber-500/20"
            )}
          >
            {/* Top Right Close Button */}
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer shadow-xs transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            {/* Header with Icon */}
            <div className="flex items-start gap-3 pr-8">
              <span
                className={cn(
                  "p-2.5 rounded-2xl border shrink-0 mt-0.5",
                  isDanger
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                )}
              >
                <AlertTriangle className="size-5" />
              </span>
              <div className="space-y-1">
                <h3 className={cn("text-lg font-bold tracking-tight", isDanger ? "text-red-400" : "text-amber-400")}>
                  {title}
                </h3>
                {subtitle && <p className="text-xs font-medium text-zinc-400">{subtitle}</p>}
              </div>
            </div>

            {/* Description Body */}
            <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed space-y-2">
              {typeof description === "string" ? <p>{description}</p> : description}
            </div>

            {/* Optional Typed Phrase Confirmation */}
            {confirmPhrase && (
              <label className="block text-xs sm:text-sm pt-1 space-y-1.5">
                <span className="mb-1 block text-zinc-400">
                  Type <strong className="text-zinc-100 font-mono">{confirmPhrase}</strong> to confirm
                </span>
                <input
                  value={typedPhrase}
                  onChange={(e) => setTypedPhrase(e.target.value)}
                  disabled={loading}
                  placeholder={confirmPhrase}
                  className="w-full rounded-xl border border-red-500/30 bg-zinc-900 px-3 py-2 font-mono text-xs sm:text-sm text-zinc-100 outline-none focus:border-red-500"
                />
              </label>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={onClose}
                className="rounded-xl border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs font-semibold h-10 px-4 cursor-pointer"
              >
                {cancelText}
              </Button>
              <Button
                type="button"
                disabled={loading || !phraseMatches}
                onClick={() => void onConfirm()}
                className={cn(
                  "rounded-xl text-white text-xs font-bold h-10 px-5 gap-1.5 cursor-pointer shadow-md",
                  isDanger
                    ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                    : "bg-amber-600 hover:bg-amber-700 active:bg-amber-800"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Processing...
                  </>
                ) : (
                  confirmText
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
