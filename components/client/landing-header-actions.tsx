"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { UserAvatar } from "@/components/client/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHeaderActions() {
  const [profile, setProfile] = React.useState<{ name: string; photoUrl: string | null } | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setProfile(null);
        setReady(true);
        return;
      }
      try {
        const db = getFirebaseDb();
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = snap.data();
        const name =
          (data?.name as string) ||
          u.displayName ||
          u.email?.split("@")[0] ||
          "User";
        const photoUrl =
          (typeof data?.photoUrl === "string" && data.photoUrl ? data.photoUrl : null) ||
          u.photoURL ||
          null;
        setProfile({ name, photoUrl });
      } catch {
        setProfile({
          name: u.displayName || u.email?.split("@")[0] || "User",
          photoUrl: u.photoURL || null,
        });
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) {
    return <div className="h-9 w-28 animate-pulse rounded-full bg-white/10" aria-hidden />;
  }

  if (profile) {
    return (
      <Link
        href="/dashboard/settings"
        className={cn(
          "flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3",
          "transition hover:bg-white/10"
        )}
      >
        <UserAvatar
          name={profile.name}
          photoUrl={profile.photoUrl}
          className="size-8.5 shrink-0"
          textClassName="text-xs"
        />
        <span className="max-w-[min(40vw,180px)] truncate text-sm font-medium text-foreground">
          {profile.name}
        </span>
      </Link>
    );
  }

  return (
    <Button variant="secondary" asChild>
      <Link href="/login">Sign in</Link>
    </Button>
  );
}
