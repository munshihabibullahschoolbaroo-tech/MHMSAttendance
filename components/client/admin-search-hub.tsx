"use client";

import Link from "next/link";
import * as React from "react";
import { Search, X, Users, Calendar, ArrowRight } from "lucide-react";
import { AttendanceCalendar } from "@/components/client/attendance-calendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  designation?: string;
};

let cachedSearchUsers: UserRow[] | null = null;
let cachedSearchUsersAt = 0;

export function AdminSearchHub() {
  const [users, setUsers] = React.useState<UserRow[]>(() => cachedSearchUsers ?? []);
  const [loading, setLoading] = React.useState(() => !cachedSearchUsers);
  const [err, setErr] = React.useState<string | null>(null);
  const [qWorker, setQWorker] = React.useState("");
  const [workerModal, setWorkerModal] = React.useState<UserRow | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // If we don't have cached users, show skeleton loading
      if (!cachedSearchUsers) {
        setLoading(true);
      }
      setErr(null);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
        const uRes = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const uData = (await uRes.json()) as { users?: UserRow[]; error?: string };
        if (!uRes.ok) throw new Error(uData.error ?? "Failed to load users");
        if (cancelled) return;
        const list = uData.users ?? [];
        cachedSearchUsers = list;
        cachedSearchUsersAt = Date.now();
        setUsers(list);
      } catch (e) {
        if (!cancelled && !cachedSearchUsers) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const ql = qWorker.trim().toLowerCase();
  const workersFiltered = ql
    ? users.filter(
        (r) =>
          r.name?.toLowerCase().includes(ql) ||
          r.email?.toLowerCase().includes(ql) ||
          r.id?.toLowerCase().includes(ql) ||
          (r.employeeId && r.employeeId.toLowerCase().includes(ql)) ||
          (r.designation && r.designation.toLowerCase().includes(ql))
      )
    : users;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="size-4" />
            </span>
            <CardTitle className="text-lg">Search Teachers & Staff</CardTitle>
          </div>
          <CardDescription>
            Quickly search faculty and staff by name, email, employee ID, or role. Click a teacher to inspect their attendance calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Search by teacher name, ID, or designation…"
              className="w-full rounded-xl border border-zinc-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
              value={qWorker}
              onChange={(e) => setQWorker(e.target.value)}
              disabled={loading}
            />
          </div>
          {loading ? (
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-2 dark:border-white/10 dark:bg-white/[0.02]">
              {workersFiltered.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-zinc-500">
                  No matching teachers found.
                </li>
              ) : (
                workersFiltered.slice(0, 40).map((r) => (
                  <li key={r.id}>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors",
                        "hover:bg-zinc-100 dark:hover:bg-white/[0.06] cursor-pointer"
                      )}
                      onClick={() => setWorkerModal(r)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                            {r.name || "Staff Member"}
                          </span>
                          {r.employeeId && (
                            <span className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-white/10 dark:text-zinc-300">
                              {r.employeeId}
                            </span>
                          )}
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                              r.role === "admin" || r.role === "super_admin"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            )}
                          >
                            {r.role.replace("_", " ")}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {r.designation ? `${r.designation} • ` : ""}
                          {r.email}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkerModal(r);
                          }}
                        >
                          <Calendar className="size-3.5" />
                          <span>Calendar</span>
                        </Button>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Teacher Attendance Calendar Modal */}
      {workerModal ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Teacher Calendar"
        >
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              aria-label="Close"
              onClick={() => setWorkerModal(null)}
            >
              <X className="size-5" />
            </button>
            <div className="mb-4 pr-10">
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {workerModal.employeeId?.trim()
                  ? `${workerModal.name || "Teacher"} (${workerModal.employeeId})`
                  : workerModal.name || "Teacher"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">{workerModal.email}</p>
            </div>
            <AttendanceCalendar
              workerId={workerModal.id}
              title="Attendance Calendar"
              description="Tap a day to view daily clock-in / clock-out punches."
              adminDayDetailBasePath="/dashboard/admin/workers"
            />
            <div className="mt-4 flex flex-wrap justify-between items-center gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
              <Button type="button" variant="default" size="sm" asChild>
                <Link href={`/dashboard/admin/workers?worker=${encodeURIComponent(workerModal.id)}`}>
                  Open in Teachers Directory <ArrowRight className="size-3.5 ml-1" />
                </Link>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setWorkerModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
