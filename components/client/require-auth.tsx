"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { PageLoadingSkeleton } from "@/components/client/dashboard-skeletons";
import {
  AuthSignOutOverlay,
  AUTH_SIGNOUT_EVENT,
} from "@/components/client/auth-sign-out-overlay";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const handleSignOutEvent = () => {
      setIsSigningOut(true);
    };
    window.addEventListener(AUTH_SIGNOUT_EVENT, handleSignOutEvent);
    return () => window.removeEventListener(AUTH_SIGNOUT_EVENT, handleSignOutEvent);
  }, []);

  React.useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch {
      setReady(true);
      setSignedIn(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u);
      setReady(true);
      if (!u) {
        // Fast redirect to login page
        try {
          router.replace("/login");
        } catch {}
        if (typeof window !== "undefined") {
          window.location.replace("/login");
        }
      }
    });
    return () => unsub();
  }, [router]);

  if (isSigningOut) {
    return <AuthSignOutOverlay mode="signing-out" />;
  }

  if (!ready) {
    return <PageLoadingSkeleton label="Loading session" />;
  }

  if (!signedIn) {
    return <AuthSignOutOverlay mode="redirecting" />;
  }

  return <>{children}</>;
}

