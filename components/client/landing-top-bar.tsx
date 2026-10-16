"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/client/theme-toggle";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { NotificationsDropdown } from "@/components/client/notifications-dropdown";
import { UserAccountDropdown } from "@/components/client/user-account-dropdown";

/** Same pattern as the dashboard top bar: theme, notifications (when signed in), account menu. */
export function LandingTopBar({ hideAvatar = false }: { hideAvatar?: boolean }) {
  const { user, loading } = useDashboardUser();

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <ThemeToggle />
      {loading ? (
        <div
          className="h-9 w-28 animate-pulse rounded-full bg-zinc-200/90 dark:bg-white/10"
          aria-hidden
        />
      ) : user ? (
        <>
          <NotificationsDropdown />
          <UserAccountDropdown user={user} hideAvatar={hideAvatar} />
        </>
      ) : (
        <Link
          href="/login"
          className="group relative flex items-center gap-1.5 px-4 py-2 sm:px-4.5 sm:py-2 rounded-full bg-white/10 dark:bg-white/[0.08] hover:bg-white/20 dark:hover:bg-white/15 backdrop-blur-xl border border-white/20 dark:border-white/15 text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-100 shadow-sm transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span>Sign in</span>
          <ArrowRight className="size-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
