"use client";

import * as React from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CheckCircle2, Clock, MapPin, Radio, ShieldCheck } from "lucide-react";

export type AdminDashboardMetrics = {
  activeWorkers: number;
  totalCheckIns: number;
  completed: number;
  pending: number;
  lateArrivals: number;
  completionRate: number;
};

const defaultStats: AdminDashboardMetrics = {
  activeWorkers: 0,
  totalCheckIns: 0,
  completed: 0,
  pending: 0,
  lateArrivals: 0,
  completionRate: 0,
};

type MetricsCtx = {
  loading: boolean;
  err: string | null;
  stats: AdminDashboardMetrics;
  lastUpdated: Date | null;
  isRealtimeConnected: boolean;
  reload: () => void;
};

const Ctx = React.createContext<MetricsCtx | null>(null);

export function useAdminMetrics(): MetricsCtx {
  const v = React.useContext(Ctx);
  if (!v) {
    throw new Error("useAdminMetrics must be used within AdminDashboardMetricsProvider");
  }
  return v;
}

async function fetchDashboardStats(token: string): Promise<AdminDashboardMetrics> {
  const res = await fetch("/api/admin/dashboard-stats", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = (await res.json()) as Partial<AdminDashboardMetrics> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load stats");
  }
  return {
    activeWorkers: Number(data.activeWorkers ?? 0),
    totalCheckIns: Number(data.totalCheckIns ?? 0),
    completed: Number(data.completed ?? 0),
    pending: Number(data.pending ?? 0),
    lateArrivals: Number(data.lateArrivals ?? 0),
    completionRate: Number(data.completionRate ?? 0),
  };
}

export function AdminDashboardMetricsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<AdminDashboardMetrics>(defaultStats);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = React.useState(false);

  const loadRef = React.useRef<(showLoading?: boolean) => Promise<void>>(async () => {});

  const load = React.useCallback(() => {
    void loadRef.current(false);
  }, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    let cancelled = false;
    let isFetching = false;

    const run = async (u: User, showLoading = false) => {
      if (isFetching) return;
      isFetching = true;
      if (showLoading) setLoading(true);
      setErr(null);
      try {
        const token = await u.getIdToken();
        const next = await fetchDashboardStats(token);
        if (cancelled) return;
        setStats(next);
        setLastUpdated(new Date());
      } catch (e) {
        if (cancelled) return;
        // Only set error state if we don't have existing stats to prevent flash
        if (showLoading) {
          setErr(e instanceof Error ? e.message : "Failed to load stats");
          setStats(defaultStats);
        }
      } finally {
        isFetching = false;
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    loadRef.current = (showLoading = false) => {
      const u = auth.currentUser;
      if (u) return run(u, showLoading);
      return Promise.resolve();
    };

    let unsubTeacherSessions: (() => void) | undefined;
    let unsubAttendance: (() => void) | undefined;
    let pollInterval: NodeJS.Timeout | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        if (!cancelled) {
          setLoading(false);
          setErr("Not signed in");
          setStats(defaultStats);
          setIsRealtimeConnected(false);
        }
        unsubTeacherSessions?.();
        unsubAttendance?.();
        clearInterval(pollInterval);
        return;
      }

      // Initial authoritative fetch
      void run(u, true);

      // Setup Realtime Firestore listeners
      try {
        const db = getFirebaseDb();
        const todayDateKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const qSessions = query(
          collection(db, "teacherSessions"),
          where("date", "==", todayDateKey)
        );

        unsubTeacherSessions = onSnapshot(
          qSessions,
          () => {
            if (!cancelled) {
              setIsRealtimeConnected(true);
              void run(u, false);
            }
          },
          () => {
            // Permission or offline: fallback to live background sync
            setIsRealtimeConnected(false);
          }
        );

        const qAttendance = query(
          collection(db, "attendance"),
          where("date", "==", todayDateKey)
        );

        unsubAttendance = onSnapshot(
          qAttendance,
          () => {
            if (!cancelled) {
              void run(u, false);
            }
          },
          () => {
            // Non-critical fallback
          }
        );
      } catch {
        setIsRealtimeConnected(false);
      }

      // Background real-time sync loop (polls every 3.5s when page is active)
      pollInterval = setInterval(() => {
        if (!cancelled && typeof document !== "undefined" && document.visibilityState === "visible") {
          void run(u, false);
        }
      }, 3500);
    });

    // Refresh immediately when window regains focus or visibility
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && auth.currentUser) {
        void run(auth.currentUser, false);
      }
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      unsubAuth();
      unsubTeacherSessions?.();
      unsubAttendance?.();
      clearInterval(pollInterval);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const value = React.useMemo(
    () => ({
      loading,
      err,
      stats,
      lastUpdated,
      isRealtimeConnected,
      reload: load,
    }),
    [loading, err, stats, lastUpdated, isRealtimeConnected, load]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AdminDashboardStats() {
  const { loading, err, stats: s, lastUpdated, reload } = useAdminMetrics();

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Could not load dashboard stats</p>
        <p className="mt-1 opacity-90">{err}</p>
        <button
          type="button"
          className="mt-3 rounded-md bg-red-900 px-3 py-1.5 text-white text-xs dark:bg-red-800"
          onClick={() => reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  const statSlot = (value: number) =>
    loading ? <Skeleton className="h-9 w-16" /> : <span>{value}</span>;

  return (
    <div className="space-y-4">
      {/* Realtime Live Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            Realtime Employee Activity
          </span>
          {lastUpdated && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Live synced {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active on Campus */}
        <Card className="relative overflow-hidden border-zinc-200/80 transition-all hover:shadow-sm dark:border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Active on Campus</CardTitle>
              <CardDescription className="text-xs">
                Employees inside school geofence
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MapPin className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {statSlot(s.activeWorkers)}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Punched in & physically present
            </p>
          </CardContent>
        </Card>

        {/* Punched in Today */}
        <Card className="relative overflow-hidden border-zinc-200/80 transition-all hover:shadow-sm dark:border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Punched in Today</CardTitle>
              <CardDescription className="text-xs">
                All employees with check-in record
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {statSlot(s.totalCheckIns)}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Total staff punches today
            </p>
          </CardContent>
        </Card>

        {/* Day Completed */}
        <Card className="relative overflow-hidden border-zinc-200/80 transition-all hover:shadow-sm dark:border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Day Completed</CardTitle>
              <CardDescription className="text-xs">
                Punched in + signed out
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {statSlot(s.completed)}
            </div>
            {!loading && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {s.completionRate}%
                </span>
                completion rate
              </div>
            )}
          </CardContent>
        </Card>

        {/* Late Arrivals */}
        <Card className="relative overflow-hidden border-zinc-200/80 transition-all hover:shadow-sm dark:border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Late Arrivals</CardTitle>
              <CardDescription className="text-xs">
                Arrivals after 09:00 AM cutoff
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {statSlot(s.lateArrivals)}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Marked late for morning entry
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AdminPendingCheckoutsCard() {
  const { loading, stats: s } = useAdminMetrics();

  return (
    <Card className="relative overflow-hidden border-zinc-200/80 transition-all hover:shadow-sm dark:border-white/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Currently in School</CardTitle>
          <CardDescription className="text-xs">
            Employees punched in & actively in session
          </CardDescription>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          {loading ? <Skeleton className="h-9 w-12" /> : s.pending}
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Awaiting sign-out punch
        </p>
      </CardContent>
    </Card>
  );
}