"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Z_OVERLAY = "z-[9999]";

function useBodyScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

function useEscapeDismiss(active: boolean, onDismiss: () => void) {
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onDismiss]);
}

export type ResultModalProps = {
  open: boolean;
  variant: "success" | "warning";
  title: string;
  description?: React.ReactNode;
  dismissLabel?: string;
  onDismiss: () => void;
  className?: string;
};

/** Full-screen overlay card — same interaction model as {@link OutOfSiteRadiusAlert}. */
export function ResultModal({
  open,
  variant,
  title,
  description,
  dismissLabel = "Got it",
  onDismiss,
  className,
}: ResultModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(open);
  useEscapeDismiss(open, onDismiss);

  if (!open || !mounted || typeof document === "undefined") return null;

  const isSuccess = variant === "success";

  const shell =
    variant === "success"
      ? {
          border: "border-2 border-emerald-500/50",
          bg: "bg-gradient-to-b from-zinc-900/98 to-emerald-950/95",
          ring: "ring-1 ring-emerald-400/25",
          shadow: "shadow-[0_0_60px_-12px_rgba(16,185,129,0.55)]",
          iconWrap:
            "bg-emerald-600 text-white shadow-[0_0_28px_-4px_rgba(16,185,129,0.95)] ring-4 ring-emerald-500/40",
          title: "text-emerald-50",
          body: "text-emerald-100/92",
        }
      : {
          border: "border-2 border-amber-500/50",
          bg: "bg-gradient-to-b from-zinc-900/98 to-amber-950/90",
          ring: "ring-1 ring-amber-400/25",
          shadow: "shadow-[0_0_60px_-12px_rgba(245,158,11,0.45)]",
          iconWrap:
            "bg-amber-600 text-white shadow-[0_0_28px_-4px_rgba(245,158,11,0.85)] ring-4 ring-amber-500/40",
          title: "text-amber-50",
          body: "text-amber-100/90",
        };

  const modal = (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4 sm:p-6",
        Z_OVERLAY,
        "bg-black/75 backdrop-blur-md",
        className
      )}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="feedback-result-title"
        aria-describedby={description ? "feedback-result-desc" : undefined}
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-2xl p-6",
          shell.border,
          shell.bg,
          shell.ring,
          shell.shadow
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-5">
          <div
            className={cn(
              "mb-4 flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-black leading-none sm:mb-0",
              shell.iconWrap
            )}
            aria-hidden
          >
            {isSuccess ? (
              <Check className="size-8 stroke-[3]" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <AlertTriangle className="size-8 stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="feedback-result-title"
              className={cn("text-xl font-semibold tracking-tight", shell.title)}
            >
              {title}
            </h2>
            {description ? (
              <div
                id="feedback-result-desc"
                className={cn("mt-4 space-y-2 text-sm leading-relaxed", shell.body)}
              >
                {typeof description === "string" ? <p>{description}</p> : description}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-center sm:justify-end">
          <Button
            type="button"
            className={cn(
              "min-w-[140px] text-white",
              isSuccess
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-amber-600 hover:bg-amber-500"
            )}
            onClick={onDismiss}
          >
            {dismissLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export type ConfirmActionModalProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
};

export function ConfirmActionModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "neutral",
  busy = false,
  onConfirm,
  onCancel,
  className,
}: ConfirmActionModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(open);
  useEscapeDismiss(open, onCancel);

  if (!open || !mounted || typeof document === "undefined") return null;

  const danger = tone === "danger";

  const modal = (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4 sm:p-6",
        Z_OVERLAY,
        "bg-black/75 backdrop-blur-md",
        className
      )}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        aria-describedby={description ? "confirm-action-desc" : undefined}
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-2xl border-2 p-6",
          danger
            ? "border-red-500/50 bg-gradient-to-b from-zinc-900/98 to-red-950/95 shadow-[0_0_60px_-12px_rgba(239,68,68,0.5)] ring-1 ring-red-400/25"
            : "border-zinc-500/40 bg-gradient-to-b from-zinc-900/98 to-zinc-950/95 shadow-[0_0_40px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-5">
          <div
            className={cn(
              "mb-4 flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-black leading-none text-white sm:mb-0",
              danger
                ? "bg-red-600 shadow-[0_0_28px_-4px_rgba(239,68,68,0.9)] ring-4 ring-red-500/40"
                : "bg-zinc-600 shadow-[0_0_20px_-4px_rgba(255,255,255,0.15)] ring-4 ring-zinc-500/30"
            )}
            aria-hidden
          >
            {danger ? "!" : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-action-title"
              className={cn(
                "text-xl font-semibold tracking-tight",
                danger ? "text-red-50" : "text-zinc-50"
              )}
            >
              {title}
            </h2>
            {description ? (
              <div
                id="confirm-action-desc"
                className={cn(
                  "mt-4 space-y-2 text-sm leading-relaxed",
                  danger ? "text-red-100/90" : "text-zinc-300"
                )}
              >
                {typeof description === "string" ? <p>{description}</p> : description}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-w-[120px] border-white/10 bg-white/5 hover:bg-white/10"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={cn(
              "min-w-[120px] text-white",
              danger ? "bg-red-600 hover:bg-red-500" : "bg-cyan-600 hover:bg-cyan-500"
            )}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
