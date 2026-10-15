"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  LogIn,
  Sparkles,
  Users,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actionBtn =
  "h-11 w-full sm:w-auto sm:min-w-[10rem] md:min-w-[10.5rem] justify-center gap-2 font-semibold tracking-tight text-xs sm:text-sm";

export function LandingHeroButtons() {
  const [signedIn, setSignedIn] = React.useState(false);
  const { user } = useDashboardUser();
  const isAdmin = user?.role === "admin";

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => setSignedIn(!!u));
    return () => unsub();
  }, []);

  if (signedIn) {
    return (
      <div className="flex w-full max-w-3xl flex-col items-center gap-3.5 sm:gap-4 px-2">
        {/* Mobile: 2 buttons per row in a clean 2x2 grid. Desktop: Graceful horizontal flex */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full max-w-sm sm:max-w-none sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
          {/* Button 1: Daily Attendance */}
          <Button
            asChild
            size="lg"
            className={cn(
              actionBtn,
              "shadow-lg shadow-violet-500/25 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0"
            )}
          >
            <Link href={isAdmin ? "/dashboard/admin" : "/dashboard/employee/check-in"}>
              <LogIn className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{isAdmin ? "Admin Console" : "Daily Attendance"}</span>
            </Link>
          </Button>

          {/* Button 2: Students Attendance */}
          <Button
            asChild
            size="lg"
            variant="outline"
            className={cn(
              actionBtn,
              "border-zinc-200/90 dark:border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5"
            )}
          >
            <Link href={isAdmin ? "/dashboard/admin/students" : "/dashboard/employee/students"}>
              <Users className="size-4 shrink-0 text-blue-500 dark:text-blue-400" aria-hidden />
              <span className="truncate">Students Attendance</span>
            </Link>
          </Button>

          {/* Button 3: My Attendance */}
          <Button
            asChild
            size="lg"
            variant="outline"
            className={cn(
              actionBtn,
              "border-zinc-200/90 dark:border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5"
            )}
          >
            <Link href={isAdmin ? "/dashboard/admin/workers" : "/dashboard/employee/working-hours"}>
              <CalendarClock className="size-4 shrink-0 text-amber-500 dark:text-amber-400" aria-hidden />
              <span className="truncate">{isAdmin ? "Staff Attendance" : "My Attendance"}</span>
            </Link>
          </Button>

          {/* Button 4: Staff Leaves */}
          <Button
            asChild
            size="lg"
            variant="outline"
            className={cn(
              actionBtn,
              "border-zinc-200/90 dark:border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5"
            )}
          >
            <Link href={isAdmin ? "/dashboard/admin/leaves" : "/dashboard/employee/leaves"}>
              <CalendarDays className="size-4 shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden />
              <span className="truncate">Staff Leaves</span>
            </Link>
          </Button>
        </div>

        {/* Secondary: Open full dashboard */}
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="gap-1.5 rounded-full border border-zinc-200/80 bg-white/60 dark:bg-zinc-900/60 dark:border-white/10 px-5 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-2xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Link href={isAdmin ? "/dashboard/admin" : "/dashboard/employee/check-in"}>
            <LayoutDashboard className="size-3.5 opacity-80" aria-hidden />
            Open full dashboard
            <ArrowRight className="size-3.5 opacity-70" aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <Button asChild size="lg" className={cn(actionBtn, "gap-2 px-10 shadow-lg shadow-violet-500/25")}>
        <Link href="/login">
          <Sparkles className="size-[1.05rem]" aria-hidden />
          Sign in with Google
          <ArrowRight className="size-4 opacity-90" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
