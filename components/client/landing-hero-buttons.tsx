"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  LogIn,
  Users,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

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

const actionBtn =
  "h-11 sm:h-12 w-full sm:w-auto sm:min-w-[10.5rem] md:min-w-[11.5rem] rounded-full pl-2.5 pr-3 sm:px-4 md:px-5 flex items-center justify-start gap-2 sm:gap-2.5 font-semibold tracking-tight text-[13px] sm:text-sm md:text-[15px] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]";

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
      <div className="flex w-full max-w-3xl flex-col items-center gap-3 sm:gap-4 px-1 sm:px-2">
        {/* Mobile: 2 buttons per row with tight padding for full text visibility */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-md sm:max-w-none sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
          {/* Button 1: Daily Attendance */}
          <Link
            href={isAdmin ? "/dashboard/admin" : "/dashboard/employee/check-in"}
            className={cn(
              actionBtn,
              "shadow-lg shadow-violet-500/25 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0"
            )}
          >
            <div className="size-6 sm:size-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <LogIn className="size-3 sm:size-3.5 text-white" aria-hidden />
            </div>
            <span className="truncate min-w-0">{isAdmin ? "Admin Console" : "Daily Attendance"}</span>
          </Link>

          {/* Button 2: Students Attendance */}
          <Link
            href={isAdmin ? "/dashboard/admin/students" : "/dashboard/employee/students"}
            className={cn(
              actionBtn,
              "rounded-full border border-zinc-200/90 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md hover:border-blue-500/50 hover:bg-blue-500/10 text-zinc-900 dark:text-zinc-100"
            )}
          >
            <div className="size-6 sm:size-7 rounded-full bg-blue-500/10 dark:bg-blue-400/20 flex items-center justify-center shrink-0">
              <Users className="size-3 sm:size-3.5 text-blue-600 dark:text-blue-400" aria-hidden />
            </div>
            <span className="truncate min-w-0">Students Attendance</span>
          </Link>

          {/* Button 3: My Attendance */}
          <Link
            href={isAdmin ? "/dashboard/admin/workers" : "/dashboard/employee/working-hours"}
            className={cn(
              actionBtn,
              "rounded-full border border-zinc-200/90 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md hover:border-amber-500/50 hover:bg-amber-500/10 text-zinc-900 dark:text-zinc-100"
            )}
          >
            <div className="size-6 sm:size-7 rounded-full bg-amber-500/10 dark:bg-amber-400/20 flex items-center justify-center shrink-0">
              <CalendarClock className="size-3 sm:size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
            </div>
            <span className="truncate min-w-0">{isAdmin ? "Staff Attendance" : "My Attendance"}</span>
          </Link>

          {/* Button 4: Staff Leaves */}
          <Link
            href={isAdmin ? "/dashboard/admin/leaves" : "/dashboard/employee/leaves"}
            className={cn(
              actionBtn,
              "rounded-full border border-zinc-200/90 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md hover:border-emerald-500/50 hover:bg-emerald-500/10 text-zinc-900 dark:text-zinc-100"
            )}
          >
            <div className="size-6 sm:size-7 rounded-full bg-emerald-500/10 dark:bg-emerald-400/20 flex items-center justify-center shrink-0">
              <CalendarDays className="size-3 sm:size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            </div>
            <span className="truncate min-w-0">Staff Leaves</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center">
      <Link
        href="/login"
        className="group relative inline-flex items-center gap-3.5 rounded-full p-1.5 pr-6 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white font-semibold text-sm sm:text-base shadow-[0_10px_35px_-5px_rgba(99,102,241,0.5)] hover:shadow-[0_15px_45px_-3px_rgba(99,102,241,0.7)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 border border-white/20 cursor-pointer"
      >
        <div className="size-9 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
          <GoogleIcon className="size-4.5" />
        </div>
        <span>Sign in with Google</span>
        <ArrowRight className="size-4 opacity-90 group-hover:translate-x-1 transition-transform shrink-0" />
      </Link>
    </div>
  );
}
