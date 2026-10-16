"use client";

import { onAuthStateChanged } from "firebase/auth";
import * as React from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { PageLoadingSkeleton } from "@/components/client/dashboard-skeletons";

import { getSuperAdminEmail } from "@/lib/constants";

// In-memory cache to make page transitions instant (0ms delay)
const roleMemoryCache = new Map<string, string>();

export function RequireRole({
  allowedRoles,
  fallbackTo,
  children,
}: {
  allowedRoles: string[];
  fallbackTo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Instant check from cache if available
  const [ready, setReady] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const cached = roleMemoryCache.get(currentUser.uid) || sessionStorage.getItem(`mhms_role_${currentUser.uid}`);
      if (cached && allowedRoles.includes(cached)) {
        return true;
      }
    }
    return false;
  });

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      // Check cache first for 0ms transition
      const cached = roleMemoryCache.get(u.uid) || (typeof window !== "undefined" ? sessionStorage.getItem(`mhms_role_${u.uid}`) : null);
      if (cached && allowedRoles.includes(cached)) {
        if (!cancelled) setReady(true);
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const role = (snap.data()?.role as string | undefined) || "employee";
        const superEmail = getSuperAdminEmail();
        const superRole = superEmail && u.email?.trim().toLowerCase() === superEmail ? "super_admin" : null;
        const effectiveRole = superRole ?? role;

        if (cancelled) return;
        roleMemoryCache.set(u.uid, effectiveRole);
        try {
          sessionStorage.setItem(`mhms_role_${u.uid}`, effectiveRole);
        } catch {}

        setReady(true);

        if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
          router.replace(fallbackTo);
        }
      } catch {
        if (!cancelled) {
          setReady(true);
          router.replace(fallbackTo);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [allowedRoles, fallbackTo, router]);

  if (!ready) {
    return <PageLoadingSkeleton label="Loading permissions" />;
  }

  return <>{children}</>;
}

