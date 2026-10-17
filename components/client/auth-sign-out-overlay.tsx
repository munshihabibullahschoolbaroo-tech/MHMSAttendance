"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { signOut } from "firebase/auth";
import { MhmsMark } from "@/components/mhms-mark";
import { getFirebaseAuth } from "@/lib/firebase/client";

export const AUTH_SIGNOUT_EVENT = "mhms:auth-signout-start";

/**
 * Triggers an immediate, animated sign-out flow with timeout safety.
 * Emits an event so UI overlays pop up instantly (0ms), wipes Firebase session,
 * and cleanly redirects to /login via hard replace.
 */
export async function performSignOut(options?: { redirectTo?: string; timeoutMs?: number }) {
  const target = options?.redirectTo ?? "/login";
  const timeoutMs = options?.timeoutMs ?? 850;

  // 1. Immediately notify any listeners that sign-out has started (0ms visual feedback)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_SIGNOUT_EVENT));
  }

  // 2. Prefetch login page for instant display
  try {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = target;
    document.head.appendChild(link);
  } catch {
    // Non-fatal if prefetch fails
  }

  // 3. Initiate Firebase signOut with race timeout so slow networks never freeze the UI
  try {
    const auth = getFirebaseAuth();
    const signOutPromise = signOut(auth);
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([signOutPromise, timeoutPromise]);
  } catch (err) {
    console.warn("Sign out completed with notice or fallback:", err);
  }

  // 4. Ensure window cleanly reloads to /login
  if (typeof window !== "undefined") {
    window.location.replace(target);
  }
}

type AuthSignOutOverlayProps = {
  mode?: "signing-out" | "redirecting";
  title?: string;
  subtitle?: string;
};

export function AuthSignOutOverlay({
  mode = "signing-out",
  title,
  subtitle,
}: AuthSignOutOverlayProps) {
  const isRedirecting = mode === "redirecting";
  const displayTitle = title ?? (isRedirecting ? "Redirecting to Login" : "Signing Out…");
  const displaySubtitle =
    subtitle ??
    (isRedirecting
      ? "Your session has ended. Redirecting you to sign in..."
      : "Safely closing your active session and redirecting...");

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-xl select-none"
    >
      {/* Soft ambient background glows */}
      <div className="pointer-events-none absolute size-72 rounded-full bg-amber-500/15 blur-3xl" />
      <div className="pointer-events-none absolute size-60 rounded-full bg-cyan-500/10 blur-3xl translate-y-16" />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative flex flex-col items-center w-full max-w-sm rounded-3xl border border-zinc-200/90 bg-white/95 p-7 text-center shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/95"
      >
        {/* Animated School Seal */}
        <div className="relative flex items-center justify-center size-24 mb-4">
          {/* Subtle pulse behind mark */}
          <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-md animate-pulse" />

          {/* Outer primary spinning ring */}
          <div className="absolute -inset-2 rounded-full border-2 border-transparent border-t-amber-500 border-r-amber-400/40 animate-spin [animation-duration:2.4s]" />

          {/* Outer secondary reverse ring */}
          <div className="absolute -inset-3.5 rounded-full border border-transparent border-b-cyan-500/50 border-l-cyan-300/30 animate-spin [animation-duration:3.8s] [animation-direction:reverse]" />

          {/* Authentic School Seal */}
          <MhmsMark className="size-20 drop-shadow-xl" size={160} priority />
        </div>

        {/* Text branding */}
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
          Munshi Habibullah Mission School
        </p>

        <h2 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {displayTitle}
        </h2>

        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xs">
          {displaySubtitle}
        </p>

        {/* Dynamic indeterminate loading bar */}
        <div className="mt-5 h-1.5 w-48 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden relative">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-cyan-400"
            initial={{ x: "-100%", width: "45%" }}
            animate={{ x: "260%" }}
            transition={{ repeat: Infinity, duration: 1.15, ease: "easeInOut" }}
          />
        </div>

        {/* Status chip */}
        <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <Loader2 className="size-3.5 animate-spin text-amber-500 shrink-0" />
          <span>Please wait a moment…</span>
        </div>
      </motion.div>
    </div>
  );
}
