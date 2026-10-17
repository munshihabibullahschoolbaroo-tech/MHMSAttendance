"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ensureEmployeeUserDoc } from "@/lib/firebase/ensure-employee-user-doc";
import { MhmsMark } from "@/components/mhms-mark";
import { cn } from "@/lib/utils";

export type RecentAccount = {
  email: string;
  name: string;
  photoURL?: string;
  lastUsed: number;
};

const RECENT_ACCOUNTS_KEY = "mhms_recent_accounts";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [redirecting, setRedirecting] = React.useState(false);

  // Recent accounts state
  const [recentAccounts, setRecentAccounts] = React.useState<RecentAccount[]>([]);
  const [showAccountSheet, setShowAccountSheet] = React.useState(false);

  const [processingEmail, setProcessingEmail] = React.useState<string | null>(null);

  // Load recent accounts on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_ACCOUNTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentAccounts(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveAccountToRecent = React.useCallback(
    (u: { email: string | null; displayName: string | null; photoURL: string | null }) => {
      if (!u.email) return;
      try {
        const nextAccount: RecentAccount = {
          email: u.email,
          name: u.displayName || u.email.split("@")[0] || "Staff Member",
          photoURL: u.photoURL || undefined,
          lastUsed: Date.now(),
        };

        setRecentAccounts((prev) => {
          const filtered = prev.filter((a) => a.email.toLowerCase() !== u.email!.toLowerCase());
          const updated = [nextAccount, ...filtered].slice(0, 5);
          localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(updated));
          return updated;
        });
      } catch {
        /* ignore */
      }
    },
    []
  );

  // If already authenticated, directly navigate to dashboard
  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        saveAccountToRecent(u);
        setRedirecting(true);
        try {
          const name = u.displayName ?? u.email?.split("@")[0] ?? "Teacher";
          await ensureEmployeeUserDoc(u, name);
        } catch {
          /* ignore */
        }
        window.location.href = "/dashboard";
      }
    });
    return () => unsub();
  }, [saveAccountToRecent]);

  const signInWithGoogle = async (loginHint?: string, forcePrompt = false) => {
    setError(null);
    setBusy(true);
    setProcessingEmail(loginHint ?? null);

    try {
      const auth = getFirebaseAuth();

      // Fast-path: if already authenticated with this exact user, transition directly
      if (
        loginHint &&
        auth.currentUser &&
        auth.currentUser.email?.toLowerCase() === loginHint.toLowerCase()
      ) {
        saveAccountToRecent(auth.currentUser);
        setRedirecting(true);
        await auth.currentUser.getIdToken(true);
        const name =
          auth.currentUser.displayName ??
          auth.currentUser.email.split("@")[0] ??
          "Teacher";
        await ensureEmployeeUserDoc(auth.currentUser, name);
        window.location.href = "/dashboard";
        return;
      }

      const provider = new GoogleAuthProvider();
      if (forcePrompt || !loginHint) {
        // "Use another account" or fresh sign-in: prompt account selection
        provider.setCustomParameters({ prompt: "select_account" });
      } else {
        // Specific account selected: provide login_hint WITHOUT prompt: select_account
        // This avoids redirecting to the external Google account chooser page
        provider.setCustomParameters({ login_hint: loginHint });
      }

      const cred = await signInWithPopup(auth, provider);
      const u = cred.user;
      if (!u?.uid || !u.email) throw new Error("Google sign-in failed.");

      saveAccountToRecent(u);
      setRedirecting(true);
      await u.reload();
      await u.getIdToken(true);
      const name = u.displayName ?? u.email.split("@")[0] ?? "Teacher";
      await ensureEmployeeUserDoc(u, name);

      window.location.href = "/dashboard";
    } catch (e) {
      setRedirecting(false);
      setBusy(false);
      setProcessingEmail(null);
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code ?? "")
          : "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setError("Sign-in cancelled. Please tap your account again to sign in.");
      } else {
        const msg = e instanceof Error ? e.message : "Google sign-in failed.";
        setError(msg);
      }
    }
  };

  const primaryAccount = recentAccounts[0];

  if (redirecting) {
    return (
      <div className="w-full max-w-md mx-auto p-6 md:p-8 text-center flex flex-col items-center justify-center space-y-5 animate-in fade-in duration-300">
        <MhmsMark className="h-20 w-20 md:h-24 md:w-24 animate-pulse drop-shadow-2xl" size={130} />
        <div className="space-y-1.5">
          <h3 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Welcome to MHMS
          </h3>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
            Taking you to your attendance dashboard…
          </p>
        </div>
        <Loader2 className="size-6 animate-spin text-blue-600 dark:text-blue-400 mt-2" />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-sm md:max-w-md mx-auto flex flex-col justify-between min-h-[calc(100dvh-6rem)] md:min-h-0 md:justify-center transition-all duration-300">
      {/* ── Brand & Logo (Centered, Larger Logo as requested) ── */}
      <div className="flex flex-col items-center justify-center text-center my-auto md:my-0 md:mb-8 pt-6 md:pt-0">
        <div className="relative mb-5 transition-transform hover:scale-105 drop-shadow-2xl">
          <MhmsMark className="h-24 w-24 md:h-28 md:w-28" size={140} priority />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Sign in to MHMS
        </h1>
        <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs leading-relaxed">
          Munshi Habibullah Mission School, Kargil
          <span className="block text-[11px] md:text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Attendance & Staff Portal
          </span>
        </p>
      </div>

      {/* ── Action Buttons Container (ChatGPT mobile style, cardless on desktop) ── */}
      <div className="w-full flex flex-col gap-3 pb-6 md:pb-0">
        {/* "Continue with this account" white pill button (Image 2 style) */}
        {primaryAccount && (
          <button
            type="button"
            onClick={() => {
              setShowAccountSheet(true);
              void signInWithGoogle(primaryAccount.email, false);
            }}
            disabled={busy}
            className="group relative flex items-center w-full rounded-full bg-white text-zinc-900 px-4 py-3.5 shadow-lg hover:bg-zinc-100 transition-all active:scale-[0.99] gap-3 text-left font-medium border border-zinc-200 dark:border-white/10 cursor-pointer"
          >
            <div className="relative shrink-0">
              {primaryAccount.photoURL ? (
                <img
                  src={primaryAccount.photoURL}
                  alt=""
                  className="size-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                />
              ) : (
                <div className="size-9 rounded-full bg-zinc-800 text-white flex items-center justify-center font-bold text-xs uppercase shadow-inner">
                  {primaryAccount.name ? primaryAccount.name.slice(0, 2) : "MH"}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-white p-0.5 shadow-sm flex items-center justify-center border border-zinc-100">
                <GoogleIcon className="size-3" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-zinc-900 leading-tight">
                Continue with this account
              </p>
              <p className="text-[11px] sm:text-xs text-zinc-600 truncate mt-0.5 font-normal">
                {primaryAccount.email}
              </p>
            </div>
            {busy && processingEmail === primaryAccount.email && (
              <Loader2 className="size-4 animate-spin text-zinc-700 shrink-0" />
            )}
          </button>
        )}

        {/* "Continue with Google" Button */}
        <button
          type="button"
          onClick={() => {
            if (recentAccounts.length > 0) {
              setShowAccountSheet(true);
            } else {
              void signInWithGoogle(undefined, true);
            }
          }}
          disabled={busy}
          className={cn(
            "relative flex items-center justify-center w-full rounded-full px-5 py-3.5 transition-all active:scale-[0.99] font-medium text-xs sm:text-sm gap-2.5 cursor-pointer shadow-sm",
            primaryAccount
              ? "border border-zinc-300 bg-white/80 hover:bg-zinc-100 text-zinc-800 dark:border-white/15 dark:bg-black/60 dark:hover:bg-zinc-900 dark:text-white"
              : "bg-white text-zinc-900 hover:bg-zinc-100 shadow-md border border-zinc-200 dark:border-white/20 dark:bg-white dark:text-zinc-950 font-semibold"
          )}
        >
          {busy && !processingEmail ? (
            <Loader2 className="size-4 animate-spin text-zinc-700 dark:text-zinc-300" />
          ) : (
            <GoogleIcon className="size-4 shrink-0" />
          )}
          <span>{busy && !processingEmail ? "Signing in…" : "Continue with Google"}</span>
        </button>


        {error && !showAccountSheet ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-600 dark:text-red-400 mt-1">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-1.5 text-center text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 pt-2">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Sign in with your verified school Google account</span>
        </div>
      </div>

      {/* ── Slide-up Google Account Chooser Bottom Sheet (Image 3) ── */}
      {showAccountSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer"
            onClick={() => {
              if (!busy) setShowAccountSheet(false);
            }}
          />

          {/* Bottom Sheet Card */}
          <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#1c1c1e] text-white p-5 shadow-2xl border-t sm:border border-white/10 animate-in slide-in-from-bottom duration-300">
            {/* Top Bar with MHMS Logo & Close Button */}
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <MhmsMark className="size-7" />
                <span className="font-semibold text-white text-sm">MHMS</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!busy) setShowAccountSheet(false);
                }}
                disabled={busy}
                className="size-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Sheet Heading */}
            <h2 className="text-xl font-bold tracking-tight text-white mt-3 mb-4">
              Choose an account for MHMS
            </h2>

            {/* Account List Box */}
            <div className="rounded-2xl bg-[#2c2c2e]/80 border border-white/5 divide-y divide-white/5 overflow-hidden">
              {recentAccounts.map((acc, idx) => {
                const colors = [
                  "from-amber-600 to-amber-800",
                  "from-blue-600 to-blue-800",
                  "from-emerald-600 to-emerald-800",
                  "from-purple-600 to-purple-800",
                ];
                const grad = colors[idx % colors.length];
                const isThisProcessing = busy && processingEmail === acc.email;

                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      // Stay inside the bottom card and process right here!
                      void signInWithGoogle(acc.email, false);
                    }}
                    disabled={busy}
                    className={cn(
                      "w-full flex items-center gap-3.5 p-3.5 text-left transition-colors cursor-pointer",
                      isThisProcessing
                        ? "bg-blue-600/15"
                        : "hover:bg-white/5",
                      busy && !isThisProcessing && "opacity-40 pointer-events-none"
                    )}
                  >
                    {acc.photoURL ? (
                      <img
                        src={acc.photoURL}
                        alt=""
                        className="size-9 rounded-full object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div
                        className={cn(
                          "size-9 rounded-full bg-gradient-to-br text-white font-bold text-xs flex items-center justify-center uppercase shadow-sm shrink-0",
                          grad
                        )}
                      >
                        {acc.name ? acc.name.slice(0, 2) : acc.email.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate leading-tight">
                        {acc.name}
                      </p>
                      {isThisProcessing ? (
                        <p className="text-xs text-blue-400 font-medium truncate mt-0.5 flex items-center gap-1.5">
                          <span>Signing in…</span>
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-400 truncate mt-0.5 font-normal">
                          {acc.email}
                        </p>
                      )}
                    </div>
                    {isThisProcessing && (
                      <Loader2 className="size-4.5 animate-spin text-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}

              {/* Use another account option */}
              <button
                type="button"
                onClick={() => {
                  // As requested: "on use another accoiunt it show go to the next screen it is ovious"
                  setShowAccountSheet(false);
                  void signInWithGoogle(undefined, true);
                }}
                disabled={busy}
                className={cn(
                  "w-full flex items-center gap-3.5 p-3.5 text-left hover:bg-white/5 transition-colors cursor-pointer",
                  busy && "opacity-40 pointer-events-none"
                )}
              >
                <div className="size-9 rounded-full bg-zinc-800/90 text-zinc-300 flex items-center justify-center border border-white/10 shrink-0">
                  <GoogleIcon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">
                    Use another account
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Sign in with any verified Google account
                  </p>
                </div>
              </button>
            </div>

            {/* Error Message inside the sheet */}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400 mt-3 animate-in fade-in">
                {error}
              </div>
            )}

            {/* Footer link */}
            <p className="text-xs text-zinc-400 text-center mt-5 font-normal">
              Sign-in options
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


