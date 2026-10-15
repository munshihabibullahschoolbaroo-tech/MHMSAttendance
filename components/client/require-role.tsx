"use client";

import { onAuthStateChanged } from "firebase/auth";
import * as React from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { PageLoadingSkeleton } from "@/components/client/dashboard-skeletons";

import { getSuperAdminEmail } from "@/lib/constants";

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
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const role = (snap.data()?.role as string | undefined) || "employee";
        const superEmail = getSuperAdminEmail();
        const superRole = superEmail && u.email?.trim().toLowerCase() === superEmail ? "super_admin" : null;
        const effectiveRole = superRole ?? role;
        if (cancelled) return;
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

