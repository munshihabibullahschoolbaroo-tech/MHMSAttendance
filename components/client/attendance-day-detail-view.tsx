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
import { cn, resolveDocumentViewUrl } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaPreviewModal } from "@/components/ui/media-preview-modal";
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
import {
  FileCheck,
  FileText,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Building,
  Briefcase,
  Calendar,
  LogOut,
  LogIn,
  User,
} from "lucide-react";

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
      beforeEnrollment?: boolean;
      firstActiveDate?: string | null;
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
        kind:
          | "check_in"
          | "site_switch"
          | "check_out"
          | "offline_window"
          | "out_of_site_window"
          | "overtime"
          | "offsite"
          | "emergency_leave";
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
      teacherSession?: {
        teacherName: string;
        teacherEmail: string;
        teacherPhone?: string | null;
        designation?: string;
        position?: string;
        wingId?: string;
        isClassTeacher?: boolean;
        schoolClassId?: string | null;
        schoolSectionId?: string | null;
        isLate?: boolean;
        lateArrival?: boolean;
        lateMinutes?: number;
        cutoffTime?: string;
        checkInGps?: {
          latitude: number;
          longitude: number;
          distanceM?: number;
          accuracy?: number;
        } | null;
        checkOutGps?: {
          latitude: number;
          longitude: number;
          distanceM?: number;
          accuracy?: number;
        } | null;
        emergencyLeave?: {
          active: boolean;
          type: "school_duty" | "emergency";
          departureTime: string;
          willReturn: boolean;
          returnTime?: string | null;
          reason: string;
          status: "pending" | "approved" | "rejected";
          assigneeAdminUid?: string | null;
          assigneeAdminName?: string | null;
        } | null;
      } | null;
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

function fmtTimeOnly(ms: number | null | undefined, displayTimeZone: string) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return formatInstantTime12hInZone(ms, displayTimeZone, {
    withSeconds: false,
    withTimeZoneName: false,
  });
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function AttendanceDayDetailView({
  data,
  loading = false,
  error = null,
  backHref = "/dashboard/employee/calendar",
  backLabel = "Calendar",
  showWorkerHeader = false,
}: {
  data: DayDetailPayload | null;
  loading?: boolean;
  error?: string | null;
  backHref?: string;
  backLabel?: string;
  showWorkerHeader?: boolean;
}) {
  const { user } = useDashboardUser();
  const { mode } = useCalendarMode();
  const [previewTarget, setPreviewTarget] = React.useState<{ url: string; title: string } | null>(null);

  const displayTz = normalizeTimeZoneId(user?.timeZone);
  const zoneLabel = workTimeZoneUiLabel(displayTz);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>← {backLabel}</Link>
        </Button>
        <Card className="border-red-500/30 bg-red-500/10">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Unable to load attendance</CardTitle>
            <CardDescription>{error ?? "No data returned for this day."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const ts = !data.absent ? data.teacherSession : null;
  const isLate = Boolean(ts?.isLate || ts?.lateArrival || (ts?.lateMinutes && ts.lateMinutes > 0));
  const emergency = ts?.emergencyLeave?.active ? ts.emergencyLeave : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Teacher Day Timeline
            </h1>
            {ts?.wingId && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                {ts.wingId.replace(/_/g, " ")} Wing
              </span>
            )}
            {ts?.designation && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">
                {ts.designation}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {formatIsoForCalendar(data.day, mode, displayTz)}
            </span>
            {data.workerName && (
              <>
                {" "}• <span className="font-semibold text-zinc-900 dark:text-zinc-100">{data.workerName}</span>
              </>
            )}
            {data.workerEmail && (
              <span className="text-zinc-400"> ({data.workerEmail})</span>
            )}
            <span className="ml-1.5 text-zinc-400 font-mono">({zoneLabel})</span>
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto gap-1.5 rounded-xl cursor-pointer">
          <Link href={backHref}>
            <Calendar className="size-4 text-blue-600 dark:text-blue-400" />
            <span>{backLabel}</span>
          </Link>
        </Button>
      </div>

      {data.absent ? (
        data.leave ? (
          /* Approved Leave Banner Card */
          <Card className="border-blue-500/30 bg-blue-500/10 shadow-sm dark:border-blue-500/20 dark:bg-blue-950/20 rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg font-bold text-blue-950 dark:text-blue-100 flex items-center gap-2">
                  <FileCheck className="size-5 text-blue-600 dark:text-blue-400" />
                  On Approved {data.leave.type.toUpperCase()} Leave
                </CardTitle>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  Official Leave Approved
                </span>
              </div>
              <CardDescription className="text-xs text-zinc-600 dark:text-zinc-400">
                Official leave recorded in school management system • Regular punch excused
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 font-medium">Leave Period</span>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                    {data.leave.startDate} to {data.leave.endDate}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 font-medium">Reason for Absence</span>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {data.leave.reason}
                  </p>
                </div>
              </div>
              {data.leave.documentUrl && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewTarget({
                        url: resolveDocumentViewUrl(data.leave?.documentUrl),
                        title: "Medical Certificate / Document",
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <FileText className="size-4" /> View Medical Certificate / Document
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : data.beforeEnrollment ? (
          /* Before Platform Enrollment Card */
          <Card className="border-zinc-200/90 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] rounded-2xl shadow-xs">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-blue-600 dark:text-blue-400" />
                <CardTitle className="text-zinc-900 dark:text-zinc-100 text-base">
                  Prior to Platform Enrollment (Unmarked)
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                This date ({formatIsoForCalendar(data.day, mode, displayTz)}) is prior to when{" "}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {data.workerName || "this staff member"}
                </span>{" "}
                first joined or signed into the MHMS attendance platform
                {data.firstActiveDate ? ` (${data.firstActiveDate})` : ""}. Daily attendance was not required and is not penalized as an absence.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          /* Absent Card */
          <Card className="border-red-500/30 bg-red-500/10 rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
                <CardTitle className="text-red-900 dark:text-red-200 text-base">
                  No Attendance Recorded (Absent)
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-red-700 dark:text-red-300">
                No morning punch-in or attendance session was found for this working day.
              </CardDescription>
            </CardHeader>
          </Card>
        )
      ) : (
        /* Present / Recorded Teacher Day Details */
        <>
          {/* 4 Key Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Attendance Status */}
            <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Attendance Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {isLate ? (
                    <>
                      <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                      <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                        Late Arrival
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        On Time
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {isLate
                    ? `Late by ${ts?.lateMinutes ?? 0}m (Cutoff: ${ts?.cutoffTime ?? "09:00 AM"})`
                    : `Arrived before cutoff (${ts?.cutoffTime ?? "09:00 AM"})`}
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Morning Punch-In */}
            <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Punch-In (Arrival)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <LogIn className="size-5 text-blue-500 shrink-0" />
                  <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {fmtTimeOnly(data.checkIn?.atMs, displayTz)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 truncate">
                  {ts?.checkInGps?.distanceM != null
                    ? `${ts.checkInGps.distanceM}m to school campus`
                    : "Recorded at school campus"}
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Emergency / On-Duty */}
            <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Emergency / On-Duty
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Briefcase className="size-5 text-amber-500 shrink-0" />
                  <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {emergency
                      ? emergency.type === "school_duty"
                        ? "Official Duty"
                        : "Emergency Departure"
                      : "None (On Campus)"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 truncate">
                  {emergency
                    ? `Departed ${emergency.departureTime} • ${emergency.status}`
                    : "Full day on school campus"}
                </p>
              </CardContent>
            </Card>

            {/* Card 4: Punch-Out & Working Hours */}
            <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Punch-Out (Departure)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <LogOut className="size-5 text-purple-500 shrink-0" />
                  <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {data.checkOut?.atMs ? fmtTimeOnly(data.checkOut.atMs, displayTz) : "Session Open"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {data.checkOut?.atMs
                    ? `Completed ${fmtDuration(data.analytics.totalSessionMs)} in school`
                    : `${fmtDuration(data.analytics.totalSessionMs)} active in school`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Emergency Leave / On-Duty Departure Banner (if active) */}
          {emergency && (
            <Card className="rounded-2xl border-amber-500/30 bg-amber-500/10 dark:border-amber-500/20 dark:bg-amber-950/20 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <Briefcase className="size-4 text-amber-600 dark:text-amber-400" />
                    <span>
                      {emergency.type === "school_duty"
                        ? "🏛️ Official School Duty Departure (OD)"
                        : "🚨 Emergency Departure"}
                    </span>
                  </CardTitle>
                  <span
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      emergency.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                        : emergency.status === "rejected"
                        ? "bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                    )}
                  >
                    {emergency.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                    <span className="text-zinc-400 font-medium">Departure Time</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                      {emergency.departureTime}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                    <span className="text-zinc-400 font-medium">Expected Return</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                      {emergency.willReturn ? emergency.returnTime || "Yes, returning" : "No, for day"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                    <span className="text-zinc-400 font-medium">Assigned Admin</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5 truncate">
                      {emergency.assigneeAdminName ?? emergency.assigneeAdminUid ?? "School Administration"}
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 font-medium">Reason & Destination</span>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-0.5 italic">
                    &quot;{emergency.reason}&quot;
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* School Presence & Working Hours Summary */}
          <Card className="rounded-2xl border-blue-500/20 bg-blue-500/[0.04]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Clock className="size-4 text-blue-600 dark:text-blue-400" />
                <span>School Presence & Working Hours</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Official attendance session for Munshi Habibullah Mission School ({zoneLabel}).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 text-xs">Standard Shift</span>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                    9:00 AM – 3:30 PM
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 text-xs">Late Cutoff Time</span>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                    {ts?.cutoffTime ?? "09:00 AM"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10">
                  <span className="text-zinc-400 text-xs">Total Duration</span>
                  <p className="font-bold text-blue-700 dark:text-blue-300 text-sm mt-0.5">
                    {fmtDuration(data.analytics.totalSessionMs)}
                    {data.analytics.sessionOpen ? " (active)" : " (completed)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chronological Day Timeline */}
          <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03]">
            <CardHeader className="pb-3 border-b border-zinc-100 dark:border-white/5">
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Chronological Events Timeline
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                School check-in, departure requests, and punch-out events in chronological order ({zoneLabel}).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <ol className="relative space-y-6 border-l-2 border-zinc-200 dark:border-white/10 pl-6 ml-2">
                {/* 1. Punch-In Event */}
                {data.checkIn?.atMs && (
                  <li className="relative">
                    <span
                      className={cn(
                        "absolute -left-[31px] mt-0.5 flex size-4 items-center justify-center rounded-full border-2 bg-white dark:bg-zinc-950",
                        isLate ? "border-amber-500" : "border-emerald-500"
                      )}
                    />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            isLate
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          )}
                        >
                          {isLate ? "⚠️ Late Arrival" : "✓ On-Time Arrival"}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">
                          {fmtLocal(data.checkIn.atMs, displayTz, mode)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        Punched In at Munshi Habibullah Mission School
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Building className="size-3.5 text-zinc-400" />
                          Bemathang Campus, Kargil
                        </span>
                        {ts?.checkInGps?.distanceM != null && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5 text-zinc-400" />
                            {ts.checkInGps.distanceM}m to school geofence
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )}

                {/* 2. Emergency Leave Event (if any) */}
                {emergency && (
                  <li className="relative">
                    <span className="absolute -left-[31px] mt-0.5 flex size-4 items-center justify-center rounded-full border-2 border-amber-500 bg-white dark:bg-zinc-950" />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          {emergency.type === "school_duty" ? "🏛️ Official Duty" : "🚨 Emergency Departure"}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">
                          Departed at {emergency.departureTime}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        Departed School Campus ({emergency.status.toUpperCase()})
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 italic">
                        &quot;{emergency.reason}&quot;
                      </p>
                    </div>
                  </li>
                )}

                {/* 3. Punch-Out Event */}
                {data.checkOut?.atMs ? (
                  <li className="relative">
                    <span className="absolute -left-[31px] mt-0.5 flex size-4 items-center justify-center rounded-full border-2 border-red-500 bg-white dark:bg-zinc-950" />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30">
                          Sign Out Completed
                        </span>
                        <span className="font-mono text-xs text-zinc-500">
                          {fmtLocal(data.checkOut.atMs, displayTz, mode)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        Punched Out from Munshi Habibullah Mission School
                      </p>
                      <p className="text-xs text-zinc-500">
                        Total working span: {fmtDuration(data.analytics.totalSessionMs)}
                      </p>
                    </div>
                  </li>
                ) : (
                  <li className="relative">
                    <span className="absolute -left-[31px] mt-0.5 flex size-4 items-center justify-center rounded-full border-2 border-emerald-500 bg-white dark:bg-zinc-950 animate-pulse" />
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        Session Currently Active
                      </span>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        Teacher is currently active at school ({fmtDuration(data.analytics.totalSessionMs)} elapsed)
                      </p>
                    </div>
                  </li>
                )}
              </ol>
            </CardContent>
          </Card>

          {/* Teacher & Campus Summary Fields */}
          <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03]">
            <CardHeader className="pb-3 border-b border-zinc-100 dark:border-white/5">
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Building className="size-4 text-blue-600 dark:text-blue-400" />
                <span>Teacher & Campus Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 grid gap-3 text-xs sm:grid-cols-2">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/5">
                <span className="text-zinc-400 font-medium">Campus Location</span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                  Munshi Habibullah Mission School
                </p>
                <p className="text-zinc-500 text-[11px] mt-0.5">
                  Bemathang Campus, Kargil, UT Ladakh
                </p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/5">
                <span className="text-zinc-400 font-medium">Teacher Designation & Wing</span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                  {ts?.designation ?? "Teacher"} • {ts?.wingId?.replace(/_/g, " ") ?? "Higher"} Wing
                </p>
                <p className="text-zinc-500 text-[11px] mt-0.5">
                  {data.workerEmail ?? "MHMS Faculty Member"}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* IN-WINDOW MEDIA PREVIEW MODAL */}
      <MediaPreviewModal
        isOpen={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        url={previewTarget?.url ?? null}
        title={previewTarget?.title}
      />
    </div>
  );
}
