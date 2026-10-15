"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { normalizeTimeZoneId, workTimeZoneUiLabel } from "@/lib/date/time-zone";
import type { CalendarMode } from "@/lib/date/bs-calendar";
import { formatIsoForCalendar } from "@/lib/date/bs-calendar";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import type {
  OvertimeDayDetailRow,
  OffsiteDayDetailRow,
} from "@/lib/attendance/worker-day-detail";
import { formatInstantTime12hInZone, formatWallHm12h } from "@/lib/time/format-wall-time";
import { DateTime } from "luxon";
import { FileCheck, FileText } from "lucide-react";

export type DayDetailPayload =
  | {
      ok: true;
      day: string;
      workerId: string;
      absent: true;
      workerName: string | null;
      workerEmail: string | null;
      onLeave?: boolean;
      leave?: {
        type: string;
        startDate: string;
        endDate: string;
        reason: string;
        documentUrl?: string | null;
        adminNotes?: string | null;
      } | null;
      overtime: OvertimeDayDetailRow[];
      offsite: OffsiteDayDetailRow[];
    }
  | {
      ok: true;
      day: string;
      workerId: string;
      absent: false;
      workerName: string | null;
      workerEmail: string | null;
      status: string;
      currentSiteId: string | null;
      currentSiteName: string | null;
      checkIn: {
        atMs: number | null;
        siteId: string;
        siteName: string;
        photoUrl: string | null;
        gps: unknown;
      } | null;
      checkOut: {
        atMs: number | null;
        siteId: string;
        siteName: string;
        photoUrl: string | null;
        gps: unknown;
        auto: boolean;
      } | null;
      timeline: {
        kind: "check_in" | "site_switch" | "check_out" | "offline_window" | "out_of_site_window" | "overtime" | "offsite";
        atMs: number;
        [key: string]: unknown;
      }[];
      analytics: {
        sessionOpen: boolean;
        switchCount: number;
        uniqueSitesCount: number;
        sitesVisitedOrdered: { id: string; name: string }[];
        firstEventMs: number | null;
        lastEventMs: number | null;
        totalSessionMs: number | null;
        segments: {
          siteId: string;
          siteName: string;
          startMs: number;
          endMs: number | null;
          durationMs: number;
          workScheduleLabel: string | null;
        }[];
        tracking: {
          pingCount: number;
          outOfSiteMs: number;
          offlineMs: number;
          outOfSiteWindows: {
            startMs: number;
            endMs: number;
            durationMs: number;
          }[];
          offlineWindows: {
            startMs: number;
            endMs: number;
            durationMs: number;
          }[];
        };
      };
      overtime: OvertimeDayDetailRow[];
      offsite: OffsiteDayDetailRow[];
    };

function fmtLocal(ms: number | null | undefined, displayTimeZone: string, mode: CalendarMode) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const dt = DateTime.fromMillis(ms, { zone: displayTimeZone });
  if (!dt.isValid) return "—";
  const dateStr = formatIsoForCalendar(dt.toISODate()!, mode, displayTimeZone);
  const timeStr = formatInstantTime12hInZone(ms, displayTimeZone, {
    withSeconds: true,
    withTimeZoneName: true,
  });
  return `${dateStr}, ${timeStr}`;
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

function overtimeStatusClass(status: string) {
  if (status === "approved") return "text-emerald-700 dark:text-emerald-400";
  if (status === "rejected") return "text-red-600 dark:text-red-400";
  if (status === "pending") return "text-amber-700 dark:text-amber-300";
  return "text-zinc-500 dark:text-zinc-400";
}

function offsiteStatusClass(status: string) {
  if (status === "approved") return "text-emerald-700 dark:text-emerald-400";
  if (status === "rejected") return "text-red-600 dark:text-red-400";
  if (status === "pending") return "text-amber-700 dark:text-amber-300";
  return "text-zinc-500 dark:text-zinc-400";
}

function OffsiteSection({
  rows,
  displayTimeZone,
}: {
  rows: OffsiteDayDetailRow[];
  displayTimeZone: string;
}) {
  if (rows.length === 0) return null;
  const z = workTimeZoneUiLabel(displayTimeZone);
  return (
    <Card className="border-sky-500/20 bg-sky-500/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Off-site work (requested)</CardTitle>
        <CardDescription>
          Approved windows count toward your day total below ({z} wall times).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const start =
            r.status === "approved" && r.approvedStartHm ? r.approvedStartHm : r.requestedStartHm;
          const end =
            r.status === "approved" && r.approvedEndHm ? r.approvedEndHm : r.requestedEndHm;
          return (
            <div
              key={r.id}
              className="rounded-xl border border-zinc-200/80 bg-zinc-100/80 px-3 py-3 text-sm dark:border-white/10 dark:bg-black/20"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] text-zinc-500">{r.id}</p>
                <span className={cn("text-xs font-semibold capitalize", offsiteStatusClass(r.status))}>
                  {r.status}
                </span>
              </div>
              {r.reason ? (
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-500">Reason: </span>
                  {r.reason}
                </p>
              ) : null}
              <p className="mt-1 text-zinc-900 dark:text-zinc-200">
                <span className="text-zinc-500">Assignee: </span>
                {r.assigneeAdminName ?? r.assigneeAdminEmail ?? r.assigneeAdminUid ?? "—"}
              </p>
              <p className="mt-1 font-mono text-xs text-zinc-400">
                Window: {formatWallHm12h(start)} → {formatWallHm12h(end)} ({z})
              </p>
              {r.durationMs != null && r.durationMs >= 0 ? (
                <p className="mt-1 text-xs text-sky-800 dark:text-sky-200/90">
                  Duration: {fmtDuration(r.durationMs)}
                </p>
              ) : null}
              {r.requestGps ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Request GPS: {r.requestGps.latitude.toFixed(5)}, {r.requestGps.longitude.toFixed(5)}
                  {typeof r.requestGps.accuracyM === "number"
                    ? ` (±${Math.round(r.requestGps.accuracyM)}m)`
                    : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DayHoursSummary({
  data,
  displayTimeZone,
}: {
  data: DayDetailPayload;
  displayTimeZone: string;
}) {
  if (data.absent) return null;
  const z = workTimeZoneUiLabel(displayTimeZone);
  const regularMs = data.analytics.totalSessionMs != null
    ? Math.max(0, data.analytics.totalSessionMs)
    : 0;
  const sessionOpen = data.analytics.sessionOpen;

  return (
    <Card className="border-blue-500/25 bg-blue-500/[0.05]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Teacher Attendance Summary</CardTitle>
        <CardDescription>
          Recorded attendance session for Munshi Habibullah Mission School ({z}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-200/80 pb-2 dark:border-white/10">
          <span className="text-zinc-600 dark:text-zinc-400">School Presence</span>
          <span className="font-mono font-semibold text-blue-900 dark:text-blue-200">
            {regularMs > 0 ? (
              <>
                {fmtDuration(regularMs)}
                {sessionOpen ? " (active in school)" : " (completed)"}
              </>
            ) : (
              "Recorded"
            )}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <span className="font-medium text-zinc-900 dark:text-zinc-200">Total Hours in School</span>
          <span className="font-mono text-lg font-bold text-blue-700 dark:text-blue-300">
            {regularMs > 0 ? fmtDuration(regularMs) : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}


function OvertimeSection({
  rows,
  displayTimeZone,
  mode,
}: {
  rows: OvertimeDayDetailRow[];
  displayTimeZone: string;
  mode: CalendarMode;
}) {
  if (rows.length === 0) return null;
  const z = workTimeZoneUiLabel(displayTimeZone);
  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Overtime (requested)</CardTitle>
        <CardDescription>
          Approved overtime records for this calendar day ({z}): check-in/out and site, separate from the
          main shift timeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const spanMs =
            r.overtimeCheckIn?.atMs != null && r.overtimeCheckOut?.atMs != null
              ? r.overtimeCheckOut.atMs - r.overtimeCheckIn.atMs
              : null;
          return (
            <div
              key={r.id}
              className="rounded-xl border border-zinc-200/80 bg-zinc-100/80 px-3 py-3 text-sm dark:border-white/10 dark:bg-black/20"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[11px] text-zinc-500">{r.id}</p>
                <span className={cn("text-xs font-semibold capitalize", overtimeStatusClass(r.status))}>
                  {r.status}
                </span>
              </div>
              {r.reason ? (
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-500">Reason: </span>
                  {r.reason}
                </p>
              ) : null}
              <p className="mt-1 text-zinc-900 dark:text-zinc-200">
                <span className="text-zinc-500">Site: </span>
                {r.siteName ?? (r.siteId ?? "—")}
              </p>
              {spanMs != null && spanMs >= 0 ? (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
                  Overtime duration: {fmtDuration(spanMs)}
                </p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400/90">
                    OT check-in
                  </p>
                  <p className="font-mono text-xs text-zinc-500">
                    {fmtLocal(r.overtimeCheckIn?.atMs, displayTimeZone, mode)}
                  </p>
                  {typeof r.overtimeCheckIn?.photoUrl === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.overtimeCheckIn.photoUrl}
                      alt="Overtime check-in"
                      className="mt-2 max-h-40 rounded-lg border border-white/10 object-contain"
                    />
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400/90">
                    OT check-out
                  </p>
                  <p className="font-mono text-xs text-zinc-500">
                    {fmtLocal(r.overtimeCheckOut?.atMs, displayTimeZone, mode)}
                  </p>
                  {typeof r.overtimeCheckOut?.photoUrl === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.overtimeCheckOut.photoUrl}
                      alt="Overtime check-out"
                      className="mt-2 max-h-40 rounded-lg border border-white/10 object-contain"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

type Props = {
  data: DayDetailPayload | null;
  loading: boolean;
  error: string | null;
  backHref: string;
  backLabel?: string;
  showWorkerHeader?: boolean;
};

export function AttendanceDayDetailView({
  data,
  loading,
  error,
  backHref,
  backLabel = "Back",
  showWorkerHeader = true,
}: Props) {
  const { user } = useDashboardUser();
  const { mode } = useCalendarMode();
  const displayTz = normalizeTimeZoneId(user?.timeZone);
  const zoneLabel = workTimeZoneUiLabel(displayTz);

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showWorkerHeader ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Day timeline</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-zinc-800 dark:text-zinc-300">
                {formatIsoForCalendar(data.day, "ad", displayTz)}
              </span>
              {data.workerName ? (
                <>
                  {" "}
                  · <span className="text-zinc-900 dark:text-zinc-200">{data.workerName}</span>
                </>
              ) : null}
              {data.workerEmail ? (
                <span className="text-zinc-500"> ({data.workerEmail})</span>
              ) : null}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Day detail</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Calendar day ({zoneLabel}):{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-300">
                {formatIsoForCalendar(data.day, "ad", displayTz)}
              </span>
            </p>
          </div>
        )}
        <Button asChild variant="secondary" size="sm">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>

      {data.absent ? (
        data.leave ? (
          <Card className="border-blue-200 bg-gradient-to-r from-blue-50/70 via-blue-50/30 to-transparent shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100 flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  On Approved {data.leave.type.toUpperCase()} Leave
                </CardTitle>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  Official Leave Approved
                </span>
              </div>
              <CardDescription className="text-xs text-zinc-600 dark:text-zinc-400">
                Official absence granted by School Administration • Punch excused
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 font-medium">Leave Period</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                    {data.leave.startDate} to {data.leave.endDate}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 font-medium">Reason for Absence</span>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {data.leave.reason}
                  </p>
                </div>
              </div>
              {data.leave.documentUrl && (
                <div className="pt-1">
                  <a
                    href={data.leave.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <FileText className="h-4 w-4" /> View Medical Certificate / Prescription ↗
                  </a>
                </div>
              )}
              {data.leave.adminNotes && (
                <p className="text-[11px] text-zinc-500 italic">
                  Admin Remark: {data.leave.adminNotes}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Attendance Recorded</CardTitle>
              <CardDescription>
                No punch record found for this calendar day — teacher was absent.
              </CardDescription>
            </CardHeader>
          </Card>
        )
      ) : (

        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Day status</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {data.analytics.sessionOpen ? (
                    <span className="text-emerald-700 dark:text-emerald-400">Session open</span>
                  ) : (
                    <span className="text-zinc-800 dark:text-zinc-200">Completed</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-500 capitalize">Record: {data.status}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Active site (now)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {data.currentSiteName ?? "—"}
                </p>
                {data.currentSiteId ? (
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">{data.currentSiteId}</p>
                ) : null}
              </CardContent>
            </Card>
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Sites visited</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-cyan-800 dark:text-cyan-300">
                  {data.analytics.uniqueSitesCount}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Unique locations this day</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-50/90 dark:bg-white/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Session span</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {fmtDuration(data.analytics.totalSessionMs)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {data.analytics.sessionOpen
                    ? "From first check-in (still open)"
                    : "Check-in → check-out"}
                </p>
              </CardContent>
            </Card>
          </div>

          {data.analytics.segments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Time by site</CardTitle>
                <CardDescription>
                  Estimated duration at each site from check-in, switches, and check-out times.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.analytics.segments.map((seg, i) => (
                    <li
                      key={`${seg.siteId}-${i}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{seg.siteName}</p>
                        <p className="text-xs text-zinc-500">
                          {fmtLocal(seg.startMs, displayTz, mode)}
                          {seg.endMs != null ? ` → ${fmtLocal(seg.endMs, displayTz, mode)}` : " → …"}
                        </p>
                        {seg.workScheduleLabel ? (
                          <p className="text-xs text-zinc-400">Shift: {seg.workScheduleLabel}</p>
                        ) : null}
                      </div>
                      <p className="font-mono text-cyan-800 dark:text-cyan-300/90">
                        {data.analytics.sessionOpen && seg.endMs == null
                          ? `${fmtDuration(seg.durationMs)} (so far)`
                          : fmtDuration(seg.durationMs)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {(user?.role === "admin" || user?.role === "super_admin") ? (
            <Card className="border-cyan-500/25 bg-cyan-500/[0.04]">
              <CardHeader>
                <CardTitle className="text-base">Tracking diagnostics (admin)</CardTitle>
                <CardDescription>
                  Out-of-site and connectivity gaps are estimated from live pings (~45s interval).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-3">
                  <p>Ping count: <span className="font-mono">{data.analytics.tracking.pingCount}</span></p>
                  <p>Out of site: <span className="font-mono">{fmtDuration(data.analytics.tracking.outOfSiteMs)}</span></p>
                  <p>Offline/no pings: <span className="font-mono">{fmtDuration(data.analytics.tracking.offlineMs)}</span></p>
                </div>
                {data.analytics.tracking.offlineWindows.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Offline windows</p>
                    <ul className="space-y-1">
                      {data.analytics.tracking.offlineWindows.map((w, i) => (
                        <li key={`off-${i}`} className="font-mono text-xs text-zinc-400">
                          {fmtLocal(w.startMs, displayTz, mode)} → {fmtLocal(w.endMs, displayTz, mode)} ({fmtDuration(w.durationMs)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-violet-500/20 bg-violet-500/[0.03]">

            <CardHeader>
              <CardTitle className="text-base">Full timeline</CardTitle>
              <CardDescription>
                {data.analytics.switchCount} site switch
                {data.analytics.switchCount === 1 ? "" : "es"}. Events in chronological order ({zoneLabel}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-0 border-l border-zinc-300 pl-6 dark:border-white/15">
                {data.timeline.map((ev, idx) => (
                  <li key={idx} className="mb-6 ml-1 last:mb-0">
                    <span className={cn(
                      "absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 bg-white dark:bg-zinc-950",
                      (ev as { isOvertime?: boolean }).isOvertime
                        ? "border-amber-400"
                        : ev.kind === "offline_window"
                          ? "border-orange-500"
                          : ev.kind === "out_of_site_window"
                            ? "border-red-500"
                            : ev.kind === "overtime"
                              ? "border-amber-400"
                              : ev.kind === "offsite"
                                ? "border-blue-400"
                                : "border-violet-500"
                    )} />
                    {ev.kind === "check_in" ? (
                      <div className="space-y-2">
                        <p className={cn(
                          "text-xs font-semibold uppercase tracking-wide",
                          (ev as { isOvertime?: boolean }).isOvertime ? "text-amber-700 dark:text-amber-400/90" : "text-emerald-700 dark:text-emerald-400/90"
                        )}>
                          Check-in {(ev as { isOvertime?: boolean }).isOvertime ? "(Overtime)" : ""}
                        </p>
                        <p className="text-sm text-zinc-900 dark:text-zinc-200">
                          <strong>{String((ev as { siteName?: string }).siteName ?? "?")}</strong>
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{fmtLocal(ev.atMs, displayTz, mode)}</p>
                        {typeof (ev as { photoUrl?: string }).photoUrl === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(ev as unknown as { photoUrl: string }).photoUrl}
                            alt="Check-in"
                            className="max-h-48 rounded-lg border border-zinc-200/80 object-contain dark:border-white/10"
                          />
                        ) : null}
                      </div>
                    ) : ev.kind === "site_switch" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800 dark:text-cyan-400/90">
                          Site switch
                        </p>
                        <p className="text-sm text-zinc-900 dark:text-zinc-200">
                          <span className="text-cyan-800 dark:text-cyan-300">
                            {(ev as { fromSiteName?: string }).fromSiteName}
                          </span>
                          {" → "}
                          <span className="text-emerald-800 dark:text-emerald-300">
                            {(ev as { toSiteName?: string }).toSiteName}
                          </span>
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{fmtLocal(ev.atMs, displayTz, mode)}</p>
                        {(ev as { previousSiteCheckOut?: { siteName?: string } | null })
                          .previousSiteCheckOut ? (
                          <p className="text-xs text-amber-900 dark:text-amber-200/80">
                            Segment check-out from{" "}
                            <strong>
                              {
                                (
                                  ev as unknown as {
                                    previousSiteCheckOut: { siteName: string };
                                  }
                                ).previousSiteCheckOut.siteName
                              }
                            </strong>{" "}
                            (not end of day)
                          </p>
                        ) : null}
                        {typeof (ev as { arrivalPhotoUrl?: string }).arrivalPhotoUrl === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(ev as unknown as { arrivalPhotoUrl: string }).arrivalPhotoUrl}
                            alt="Switch"
                            className="max-h-48 rounded-lg border border-zinc-200/80 object-contain dark:border-white/10"
                          />
                        ) : null}
                      </div>
                    ) : ev.kind === "offline_window" ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
                          Offline / No ping
                        </p>
                        <p className="text-xs text-zinc-500">
                          {fmtLocal(ev.atMs, displayTz, mode)}{" → "}
                          {fmtLocal((ev as unknown as { endMs: number }).endMs, displayTz, mode)}
                        </p>
                        <p className="text-xs text-orange-800 dark:text-orange-300/90">
                          Gap: {fmtDuration((ev as unknown as { durationMs: number }).durationMs)}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          Internet was off or app stopped sending pings during this window.
                        </p>
                      </div>
                    ) : ev.kind === "out_of_site_window" ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                          Out of site
                        </p>
                        <p className="text-xs text-zinc-500">
                          {fmtLocal(ev.atMs, displayTz, mode)}{" → "}
                          {fmtLocal((ev as unknown as { endMs: number }).endMs, displayTz, mode)}
                        </p>
                        <p className="text-xs text-red-800 dark:text-red-300/90">
                          {fmtDuration((ev as unknown as { durationMs: number }).durationMs)} outside{" "}
                          <strong>{(ev as unknown as { siteName: string }).siteName || "site"}</strong> geofence
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          GPS was outside the site radius during this window.
                        </p>
                      </div>
                    ) : ev.kind === "overtime" ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Overtime
                          {" "}
                          <span className={cn(
                            "ml-1 rounded px-1 py-0.5 text-[10px] font-medium",
                            (ev as unknown as { status: string }).status === "approved"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : (ev as unknown as { status: string }).status === "rejected"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-amber-500/15 text-amber-400"
                          )}>
                            {(ev as unknown as { status: string }).status}
                          </span>
                        </p>
                        {(ev as unknown as { siteName?: string | null }).siteName ? (
                          <p className="text-sm font-medium text-zinc-200">
                            {(ev as unknown as { siteName: string }).siteName}
                          </p>
                        ) : null}
                        <p className="text-xs text-zinc-500">
                          {fmtLocal(ev.atMs, displayTz, mode)}
                          {(ev as unknown as { endMs?: number | null }).endMs
                            ? <> → {fmtLocal((ev as unknown as { endMs: number }).endMs, displayTz, mode)}</>
                            : " — check-out pending"}
                        </p>
                        {(ev as unknown as { reason?: string }).reason ? (
                          <p className="text-[10px] text-zinc-400">{(ev as unknown as { reason: string }).reason}</p>
                        ) : null}
                      </div>
                    ) : ev.kind === "offsite" ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                          Offsite work
                          {" "}
                          <span className={cn(
                            "ml-1 rounded px-1 py-0.5 text-[10px] font-medium",
                            (ev as unknown as { status: string }).status === "approved"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : (ev as unknown as { status: string }).status === "rejected"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-blue-500/15 text-blue-400"
                          )}>
                            {(ev as unknown as { status: string }).status}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-500">
                          {fmtLocal(ev.atMs, displayTz, mode)}
                          {" → "}
                          {fmtLocal((ev as unknown as { endMs: number }).endMs, displayTz, mode)}
                          {" "}
                          <span className="text-zinc-400">
                            ({fmtDuration((ev as unknown as { durationMs: number }).durationMs)})
                          </span>
                        </p>
                        {(ev as unknown as { reason?: string }).reason ? (
                          <p className="text-[10px] text-zinc-400">{(ev as unknown as { reason: string }).reason}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className={cn(
                          "text-xs font-semibold uppercase tracking-wide",
                          (ev as { isOvertime?: boolean }).isOvertime ? "text-amber-700 dark:text-amber-400/90" : "text-zinc-600 dark:text-zinc-400"
                        )}>
                          Check-out {(ev as { auto?: boolean }).auto ? "(automatic)" : ""} {(ev as { isOvertime?: boolean }).isOvertime ? "(Overtime)" : ""}
                        </p>
                        <p className="text-sm text-zinc-900 dark:text-zinc-200">
                          <strong>{String((ev as { siteName?: string }).siteName ?? "?")}</strong> — end
                          of day
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{fmtLocal(ev.atMs, displayTz, mode)}</p>
                        {(ev as { auto?: boolean }).auto &&
                        typeof (ev as { photoUrl?: string | null }).photoUrl !== "string" ? (
                          <p className="text-[10px] text-zinc-500">
                            Scheduled shift end after the check-out window closed — same instant used for
                            credited hours; Firestore may update when sync runs.
                          </p>
                        ) : null}
                        {typeof (ev as { photoUrl?: string }).photoUrl === "string" &&
                        !(ev as { auto?: boolean }).auto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(ev as unknown as { photoUrl: string }).photoUrl}
                            alt="Check-out"
                            className="max-h-48 rounded-lg border border-zinc-200/80 object-contain dark:border-white/10"
                          />
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary fields</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">First check-in (site)</dt>
                <dd className={cn("font-medium text-zinc-900 dark:text-zinc-100")}>
                  {data.checkIn?.siteName ?? "—"}
                </dd>
                <dd className="font-mono text-xs text-zinc-500">{fmtLocal(data.checkIn?.atMs, displayTz, mode)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Final check-out</dt>
                {data.checkOut ? (
                  <>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                      {data.checkOut.siteName}
                      {data.checkOut.auto ? (
                        <span className="ml-2 text-xs text-amber-400">auto</span>
                      ) : null}
                    </dd>
                    <dd className="font-mono text-xs text-zinc-500">{fmtLocal(data.checkOut.atMs, displayTz, mode)}</dd>
                  </>
                ) : (() => {
                  const provisional = data.timeline.find(
                    (e) =>
                      e.kind === "check_out" &&
                      (e as { auto?: boolean }).auto === true
                  ) as { atMs: number; siteName?: string } | undefined;
                  return provisional ? (
                    <>
                      <dd className="font-medium text-amber-700 dark:text-amber-300">
                        {String(provisional.siteName ?? "?")}
                        <span className="ml-2 text-xs text-amber-400">auto</span>
                        <span className="ml-2 text-xs font-normal text-zinc-500">(pending Firestore)</span>
                      </dd>
                      <dd className="font-mono text-xs text-zinc-500">{fmtLocal(provisional.atMs, displayTz, mode)}</dd>
                    </>
                  ) : (
                    <>
                      <dd className="font-medium text-zinc-500">Still open</dd>
                      <dd className="font-mono text-xs text-zinc-600">—</dd>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <DayHoursSummary data={data} displayTimeZone={displayTz} />
        </>
      )}
    </div>
  );
}
