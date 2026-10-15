"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ensureEmployeeUserDoc } from "@/lib/firebase/ensure-employee-user-doc";
import { MhmsMark } from "@/components/mhms-mark";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [redirecting, setRedirecting] = React.useState(false);

  // If already authenticated, directly navigate to dashboard
  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setRedirecting(true);
        window.location.href = "/dashboard";
      }
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(auth, provider);

      const u = cred.user;
      if (!u?.uid || !u.email) throw new Error("Google sign-in failed.");
      setRedirecting(true);
      await u.reload();
      await u.getIdToken(true);
      const name = u.displayName ?? u.email.split("@")[0] ?? "Teacher";
      await ensureEmployeeUserDoc(u, name);

      window.location.href = "/dashboard";
    } catch (e) {
      setRedirecting(false);
      setBusy(false);
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code ?? "")
          : "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setError("Sign-in popup was closed before completion. Please try again.");
      } else {
        const msg = e instanceof Error ? e.message : "Google sign-in failed.";
        setError(msg);
      }
    }
  };

  if (redirecting) {
    return (
      <Card className="w-full max-w-md border-zinc-200/80 bg-white/90 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/80 p-8 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <MhmsMark className="h-16 w-16 animate-pulse" />
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Welcome to MHMS
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Taking you to your attendance dashboard…
            </p>
          </div>
          <Loader2 className="size-6 animate-spin text-blue-600 dark:text-blue-400 mt-2" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-zinc-200/80 bg-white/90 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/80">
      <CardHeader className="flex flex-col items-center text-center pb-4">
        <div className="mb-2">
          <MhmsMark className="h-16 w-16 md:h-20 md:w-20" />
        </div>
        <CardTitle className="text-xl font-semibold tracking-tight md:text-2xl">
          Sign in to MHMS
        </CardTitle>
        <CardDescription className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
          Munshi Habibullah Mission School, Kargil
          <br />
          Attendance & Staff Portal
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-2">
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="relative h-12 w-full gap-3 border-zinc-300 bg-white font-medium text-zinc-800 shadow-sm transition-all hover:bg-zinc-50 hover:border-zinc-400 active:scale-[0.99] dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/90"
          onClick={() => void signInWithGoogle()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin text-zinc-600 dark:text-zinc-300" />
          ) : (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
          )}
          <span>{busy ? "Signing in…" : "Continue with Google"}</span>
        </Button>

        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-center text-xs md:text-sm font-medium text-red-700 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400 pt-1">
          <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Sign in with your verified school Google account</span>
        </div>
      </CardContent>
    </Card>
  );
}
