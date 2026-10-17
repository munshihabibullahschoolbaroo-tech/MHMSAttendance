"use client";

import { Skeleton } from "@/components/ui/skeleton";

/** Notifications list placeholder (bell dropdown). */
export function NotificationsListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-white/5 px-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="space-y-2 px-2 py-3">
          <Skeleton className="h-4 w-[85%] max-w-[14rem]" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[66%]" />
        </li>
      ))}
    </ul>
  );
}

/** Generic card block. */
export function CardBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

/** Table rows for admin lists. */
export function TableRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Stats grid (admin overview). */
export function StatsGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

/** Centered page spinner replacement. */
export function PageLoadingSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
      <div className="flex w-full max-w-md flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      {label ? (
        <span className="sr-only">{label}</span>
      ) : null}
    </div>
  );
}

/** Rich skeleton matching Student Attendance Portal layout on mobile & desktop */
export function StudentAttendanceSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Banner / Header Card */}
      <div className="rounded-3xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-8 w-56 max-w-full rounded-lg" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-9 w-16 rounded-xl" />
            <Skeleton className="h-9 w-36 rounded-xl" />
          </div>
        </div>

        {/* Desktop Tabs Placeholder */}
        <div className="hidden md:flex items-center justify-between border-t border-zinc-200/70 pt-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-36 rounded-lg" />
            <Skeleton className="h-8 w-44 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Mobile 3 Action Cards Skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
              <div className="space-y-1.5 min-w-0 flex-1">
                <Skeleton className="h-3.5 w-3/4 max-w-[140px] rounded" />
                <Skeleton className="h-3 w-5/6 max-w-[180px] rounded" />
              </div>
            </div>
            <Skeleton className="h-7 w-20 rounded-full shrink-0" />
          </div>
        ))}

        {/* Mobile Dropdown Card */}
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 shadow-sm space-y-3">
          <Skeleton className="h-3.5 w-40 max-w-[75%] rounded" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>

      {/* Desktop Roster Placeholder (table / cards) */}
      <div className="hidden md:block rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-zinc-950 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200/80 dark:border-white/10">
          <div className="space-y-1">
            <Skeleton className="h-5 w-48 rounded" />
            <Skeleton className="h-3.5 w-32 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl border border-zinc-200/70 dark:border-white/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-1 min-w-0">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Teacher Dashboard / Daily Attendance Skeleton */
export function TeacherHomeSkeleton() {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Welcome Card */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36 rounded-full" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
        <Skeleton className="h-7 w-48 max-w-full rounded-lg" />
        <Skeleton className="h-3.5 w-32 rounded" />
      </div>

      {/* Punch / Action Cards */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4 max-w-[160px] rounded" />
              <Skeleton className="h-3 w-5/6 max-w-[200px] rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-full shrink-0" />
        </div>

        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4 max-w-[140px] rounded" />
              <Skeleton className="h-3 w-5/6 max-w-[180px] rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-full shrink-0" />
        </div>
      </div>
    </div>
  );
}

/** Staff Leaves Page Skeleton */
export function StaffLeavesSkeleton() {
  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-6 md:p-8 space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 max-w-full rounded-lg" />
        <Skeleton className="h-4 w-80 max-w-full rounded" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-7 w-40 rounded-full" />
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4 max-w-[140px] rounded" />
              <Skeleton className="h-3 w-5/6 max-w-[180px] rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-full shrink-0" />
        </div>
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4 max-w-[150px] rounded" />
              <Skeleton className="h-3 w-5/6 max-w-[200px] rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-full shrink-0" />
        </div>
      </div>
    </div>
  );
}

/** Content-only skeleton for Missed Attendance (used inside EmployeeManualPunchPanel when loading) */
export function MissedAttendanceContentSkeleton() {
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* 1. Mobile Trigger Cards Skeleton (md:hidden) */}
      <div className="space-y-3.5 md:hidden">
        {/* Card 1: Missed Attendance Request */}
        <div className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white dark:bg-white/[0.03] dark:border-white/10 shadow-sm">
          <div className="min-w-0 flex-1 pr-3 space-y-1.5">
            <Skeleton className="h-3.5 w-44 max-w-[80%] rounded" />
            <Skeleton className="h-3 w-56 max-w-[90%] rounded" />
          </div>
          <div className="shrink-0 pl-2">
            <Skeleton className="h-6 w-20 rounded-lg" />
          </div>
        </div>

        {/* Card 2: My Missed Attendance Requests */}
        <div className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white dark:bg-white/[0.03] dark:border-white/10 shadow-sm">
          <div className="min-w-0 flex-1 pr-3 space-y-1.5">
            <Skeleton className="h-3.5 w-48 max-w-[80%] rounded" />
            <Skeleton className="h-3 w-60 max-w-[90%] rounded" />
          </div>
          <div className="shrink-0 pl-2">
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
        </div>
      </div>

      {/* 2. Tablet & Desktop View Skeleton (hidden md:block) */}
      <div className="hidden md:block space-y-6">
        {/* Form Card Skeleton */}
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm overflow-hidden p-6 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-100 dark:border-white/5">
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-3 w-72 rounded" />
            </div>
          </div>

          {/* Form fields grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-36 rounded" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-40 rounded" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-44 rounded" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>

        {/* Submit button skeleton */}
        <Skeleton className="h-12 w-full rounded-xl" />

        {/* Requests List Card Skeleton */}
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm overflow-hidden p-6 space-y-4">
          <div className="pb-3 border-b border-zinc-100 dark:border-white/5 space-y-1.5">
            <Skeleton className="h-4 w-52 rounded" />
            <Skeleton className="h-3 w-80 rounded" />
          </div>
          <div className="space-y-3 pt-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-page skeleton for Missed Attendance route (used in loading.tsx) */
export function MissedAttendanceSkeleton() {
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 md:p-8 space-y-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Missed Attendance
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Request manual timeline adjustment for forgotten scans.
        </p>
      </div>
      <MissedAttendanceContentSkeleton />
    </div>
  );
}

/** Working Hours & Attendance Summary Skeleton */
export function WorkingHoursSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Month Picker Card Skeleton */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 shadow-sm flex items-center justify-between gap-4 max-w-md">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Skeleton className="size-12 rounded-xl shrink-0" />
          <div className="space-y-1.5 min-w-0 flex-1">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-5 w-36 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        </div>
        <Skeleton className="size-5 rounded shrink-0" />
      </div>

      {/* Single-line PDF Export Controls Skeleton */}
      <div className="flex items-center justify-end gap-2">
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>

      {/* 5 KPI Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 sm:gap-4 my-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 space-y-2 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-14 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Breakdown Card Skeleton */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Monthly Attendance Records Table Skeleton */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-zinc-950 p-4 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80 dark:border-white/10">
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="space-y-2 pt-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Generic Dashboard Page Skeleton */
export function GenericDashboardSkeleton() {
  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
