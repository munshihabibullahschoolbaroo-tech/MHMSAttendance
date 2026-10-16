"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { UserAvatar } from "@/components/client/user-avatar";
import { cn } from "@/lib/utils";

export function AuthHeaderProfile() {
  const [user, setUser] = React.useState<{ name: string; photoUrl: string | null } | null>(null);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
        return;
      }
      setUser({
        name: u.displayName || u.email?.split("@")[0] || "User",
        photoUrl: u.photoURL || null,
      });
    });
  }, []);

  if (!user) return null;

  return (
    <Link
      href="/dashboard/settings"
      className={cn(
        "mr-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm",
        "hover:bg-white/10"
      )}
    >
      <UserAvatar
        name={user.name}
        photoUrl={user.photoUrl}
        className="size-8 shrink-0"
        textClassName="text-xs"
      />
      <span className="hidden max-w-[100px] truncate sm:inline">{user.name}</span>
      <span className="sm:hidden ml-1 max-w-[60px] truncate text-xs">{user.name.split(" ")[0]?.slice(0, 6)}</span>
    </Link>
  );
}
