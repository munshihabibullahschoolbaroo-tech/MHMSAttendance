"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getBrowserTimeZone, normalizeTimeZoneId } from "@/lib/date/time-zone";
import { WorkingHoursMonthPickerCard } from "@/components/client/working-hours-month-picker-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import {
  formatIsoForCalendar,
  monthLabelForModeYm,
  convertMonthMode,
  currentMonthYyyyMmForMode,
  adIsoToBsIso,
} from "@/lib/date/bs-calendar";
import {
  generateTeacherAttendancePdf,
  TeacherMonthData,
} from "@/lib/school/attendance-pdf";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  TrendingUp,
  Download,
  AlertCircle,
  Coffee,
} from "lucide-react";

type DayRow = {
  day: string;
  regularSessionMs: number;
  approvedOvertimeMs: number;
  approvedOffsiteMs: number;
  totalMs: number;
};

type Payload = {
  month: string;
  zone: string;
  days: DayRow[];
  entries: {
    id: string;
    day: string;
    kind: "on_site" | "overtime" | "off_site";
    inTime: string;
    outTime: string;
    dutyHours: number;
    workPlace: string;
    schedule: string;
    remark: string;
  }[];
  worker: {
    id: string;
    employeeId: string | null;
    name: string | null;
    designation: string | null;
  };
  totalHours: number;
  approvedOffsiteHours: number;
  approvedClockOvertimeHours: number;
  onSiteSessionHours: number;
  regularHoursUpToCap: number;
  hoursOverCapAsOvertime: number;
};

function fmtHr(h: number): string {
  return `${h.toFixed(2)}`;
}

function getRowStatus(
  r: { day: string; remark: string; inTime: string; dutyHours: number },
  todayYmd: string
) {
  const rem = (r.remark || "").toLowerCase();
  const isFuture = r.day > todayYmd;
  if (rem.includes("leave")) {
    return {
      label: rem.includes("medical") ? "Medical Leave" : "Casual Leave",
      bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    };
  }
  if (rem.includes("sunday") || rem.includes("holiday")) {
    return {
      label: "Sunday Off",
      bg: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
    };
  }
  if (isFuture || rem.includes("unmarked") || rem.includes("before")) {
    return {
      label: "Unmarked",
      bg: "bg-zinc-500/10 text-zinc-400 dark:text-zinc-500 border-zinc-500/20",
    };
  }
  if (rem.includes("absent") || (r.inTime === "—" && r.dutyHours === 0)) {
    return {
      label: "Absent",
      bg: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    };
  }
  return {
    label: "Present",
    bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  };
}

export function WorkingHoursMonthPanel({
  workerId,
}: {
  /** When set, loads that user (admin only). When omitted, loads the signed-in user. */
  workerId?: string;
  wageRate?: number;
  overtimeRate?: number;
}) {
  const { mode } = useCalendarMode();
  const { user: viewer } = useDashboardUser();
  const canEdit = viewer?.role === "admin" || viewer?.role === "super_admin";

  const [data, setData] = React.useState<Payload | null>(null);
  const zone = React.useMemo(() => {
    if (data?.zone) return data.zone;
    if (!workerId) return normalizeTimeZoneId(viewer?.timeZone) ?? getBrowserTimeZone();
    return getBrowserTimeZone();
  }, [data?.zone, workerId, viewer?.timeZone]);

  const [month, setMonth] = React.useState(() =>
    currentMonthYyyyMmForMode(mode, getBrowserTimeZone())
  );
  const [loading, setLoading] = React.useState(false);
  const [edits, setEdits] = React.useState<
    Record<
      string,
      {
        inTime: string;
        outTime: string;
        dutyHours: string;
        workPlace: string;
        remark: string;
      }
    >
  >({});
  const [year, setYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode(mode, zone);
    return Number(current.split("-")[0]) || DateTime.now().setZone(zone).year;
  });
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [periodMode, setPeriodMode] = React.useState<"year" | "range">("year");
  const [periodYear, setPeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode(mode, zone);
    return Number(current.split("-")[0]) || DateTime.now().setZone(zone).year;
  });
  const [periodStartMonth, setPeriodStartMonth] = React.useState(() =>
    currentMonthYyyyMmForMode(mode, zone)
  );
  const [periodEndMonth, setPeriodEndMonth] = React.useState(() =>
    currentMonthYyyyMmForMode(mode, zone)
  );
  const [mounted, setMounted] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [savingEdits, setSavingEdits] = React.useState(false);

  const [downloadStatus, setDownloadStatus] = React.useState("");
  const [downloadDoneCount, setDownloadDoneCount] = React.useState(0);
  const [downloadTotalCount, setDownloadTotalCount] = React.useState(0);
  const cancelDownloadRef = React.useRef(false);
  const activeFetchControllerRef = React.useRef<AbortController | null>(null);

  const cancelDownload = React.useCallback(() => {
    cancelDownloadRef.current = true;
    setDownloadStatus("Cancelling download...");
    activeFetchControllerRef.current?.abort();
  }, []);

  const prevModeRef = React.useRef(mode);

  React.useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodStartMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodEndMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      prevModeRef.current = mode;
    }
  }, [mode]);

  const monthOptions = React.useMemo(() => {
    const now = DateTime.now().setZone(zone);
    let startYear = 2020;
    let endYear = now.year + 1;
    if (mode === "bs") {
      const bsNow = adIsoToBsIso(now.toISODate()!).split("-").map(Number);
      startYear = 2077;
      endYear = bsNow[0]! + 1;
    }
    const out: Array<{ value: string; label: string }> = [];
    for (let y = endYear; y >= startYear; y--) {
      for (let m = 12; m >= 1; m--) {
        const value = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
        out.push({ value, label: monthLabelForModeYm(y, m, mode) });
      }
    }
    return out;
  }, [mode, zone]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const q = new URLSearchParams({ month, mode });
      if (workerId) q.set("workerId", workerId);
      const res = await fetch(`/api/attendance/working-hours?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, workerId, mode]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setEdits({});
  }, [month, workerId]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const titleMonth = React.useMemo(() => {
    const dt = month.split("-").map(Number);
    if (dt.length === 2 && Number.isFinite(dt[0]) && Number.isFinite(dt[1])) {
      return monthLabelForModeYm(dt[0]!, dt[1]!, mode);
    }
    return month;
  }, [mode, month]);

  const handleEditChange = React.useCallback(
    (
      id: string,
      field: string,
      value: string,
      r: Payload["entries"][number]
    ) => {
      setEdits((prev) => {
        const current = prev[id] || {
          inTime: r.inTime,
          outTime: r.outTime,
          dutyHours: r.dutyHours.toFixed(2),
          workPlace: r.workPlace,
          remark: r.remark,
        };
        const updated = { ...current, [field]: value };

        if (field === "inTime" || field === "outTime") {
          const t1 = DateTime.fromFormat(updated.inTime.trim(), "h:mm a");
          const t2 = DateTime.fromFormat(updated.outTime.trim(), "h:mm a");
          if (t1.isValid && t2.isValid) {
            let diff = t2.diff(t1, "hours").hours;
            if (diff < 0) diff += 24;
            updated.dutyHours = diff.toFixed(2);
          }
        }
        return { ...prev, [id]: updated };
      });
    },
    []
  );

  const saveEdits = React.useCallback(async () => {
    const editKeys = Object.keys(edits);
    if (editKeys.length === 0) return;
    setSavingEdits(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const payloadEdits = editKeys.map((rowId) => ({
        rowId,
        inTime: edits[rowId]!.inTime,
        outTime: edits[rowId]!.outTime,
        dutyHours: Number(edits[rowId]!.dutyHours),
        workPlace: edits[rowId]!.workPlace,
        remark: edits[rowId]!.remark,
      }));

      const res = await fetch("/api/attendance/update-records", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workerId: workerId || u.uid,
          month,
          edits: payloadEdits,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save edits");

      toast.success("Attendance records updated successfully!");
      setEdits({});
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save edits");
    } finally {
      setSavingEdits(false);
    }
  }, [edits, month, workerId, load]);

  const todayYmd = React.useMemo(() => {
    return DateTime.now().setZone(zone).toISODate()!;
  }, [zone]);

  const mergedRows = React.useMemo(() => {
    if (!data) return [];
    return data.entries.map((r) => {
      const override = edits[r.id];
      const duty =
        override && override.dutyHours.trim().length > 0
          ? Number(override.dutyHours)
          : r.dutyHours;
      const initialRemark =
        r.day > todayYmd && r.remark === "Absent" ? "Unmarked" : r.remark;
      return {
        ...r,
        inTime: override?.inTime ?? r.inTime,
        outTime: override?.outTime ?? r.outTime,
        dutyHours: Number.isFinite(duty) ? Math.max(0, duty) : r.dutyHours,
        workPlace: override?.workPlace ?? r.workPlace,
        remark: override?.remark ?? initialRemark,
      };
    });
  }, [data, edits, todayYmd]);

  const groupedRows = React.useMemo(() => {
    const map = new Map<string, typeof mergedRows>();
    for (const row of mergedRows) {
      const list = map.get(row.day);
      if (list) list.push(row);
      else map.set(row.day, [row]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mergedRows]);

  // School KPI Metrics Calculation
  const schoolKpis = React.useMemo(() => {
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let sundayDays = 0;
    let totalDutyHours = 0;

    for (const r of mergedRows) {
      totalDutyHours += r.dutyHours;
      const rem = (r.remark || "").toLowerCase();
      const isFuture = r.day > todayYmd;
      if (rem.includes("leave")) {
        leaveDays++;
      } else if (rem.includes("sunday") || rem.includes("holiday")) {
        sundayDays++;
      } else if (isFuture || rem.includes("unmarked")) {
        // Future date not yet arrived - do not count as absent
        continue;
      } else if (rem.includes("absent") || (r.inTime === "—" && r.dutyHours === 0)) {
        absentDays++;
      } else {
        presentDays++;
      }
    }

    const workingDays = presentDays + absentDays + leaveDays;
    const attendanceRate =
      workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

    return {
      presentDays,
      absentDays,
      leaveDays,
      sundayDays,
      totalDutyHours,
      attendanceRate,
    };
  }, [mergedRows, todayYmd]);

  const downloadMonthPdf = React.useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const teacherData: TeacherMonthData = {
        month: data.month,
        zone: data.zone,
        entries: mergedRows,
        worker: data.worker,
        totalHours: schoolKpis.totalDutyHours,
      };
      const doc = await generateTeacherAttendancePdf({
        monthsData: [teacherData],
        titlePeriod: titleMonth,
        filePrefix: data.worker.employeeId ?? data.worker.id,
      });
      doc.save(
        `MHMS-Teacher-Attendance-${data.worker.employeeId ?? data.worker.id}-${month}.pdf`
      );
      toast.success("Attendance PDF downloaded!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }, [data, mergedRows, schoolKpis.totalDutyHours, titleMonth, month]);

  const downloadYearPdf = React.useCallback(async () => {
    cancelDownloadRef.current = false;
    setDownloading(true);
    setDownloadStatus("Gathering year attendance data...");
    setDownloadDoneCount(0);
    setDownloadTotalCount(12);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months = Array.from({ length: 12 }, (_, i) =>
        `${String(year).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
      );
      const list: TeacherMonthData[] = [];
      let done = 0;
      for (const m of months) {
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const q = new URLSearchParams({ month: m, mode });
        if (workerId) q.set("workerId", workerId);

        const controller = new AbortController();
        activeFetchControllerRef.current = controller;

        const res = await fetch(`/api/attendance/working-hours?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        activeFetchControllerRef.current = null;

        const json = (await res.json()) as Payload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed to load ${m}`);
        list.push({
          month: json.month,
          zone: json.zone,
          entries: json.entries,
          worker: json.worker,
          totalHours: json.totalHours,
        });
        done++;
        setDownloadDoneCount(done);
      }

      setDownloadStatus("Generating PDF...");
      const workerMeta = list[0]?.worker;
      const doc = await generateTeacherAttendancePdf({
        monthsData: list,
        titlePeriod: `${year}`,
        filePrefix: workerMeta?.employeeId ?? workerMeta?.id ?? "staff",
      });
      doc.save(
        `MHMS-Teacher-Attendance-${workerMeta?.employeeId ?? workerMeta?.id ?? "staff"}-${year}.pdf`
      );
      toast.success("Yearly Attendance PDF downloaded!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download PDF";
      if (/cancelled|abort/i.test(msg)) toast.message("Download cancelled.");
      else toast.error(msg);
    } finally {
      setDownloading(false);
      activeFetchControllerRef.current = null;
    }
  }, [mode, workerId, year]);

  const downloadPeriodPdf = React.useCallback(async () => {
    cancelDownloadRef.current = false;
    setDownloading(true);
    setDownloadStatus("Gathering period attendance data...");
    setDownloadDoneCount(0);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months =
        periodMode === "year"
          ? Array.from({ length: 12 }, (_, i) =>
              `${String(periodYear).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
            )
          : (() => {
              const s = DateTime.fromFormat(periodStartMonth, "yyyy-MM", {
                zone,
              });
              const e = DateTime.fromFormat(periodEndMonth, "yyyy-MM", {
                zone,
              });
              if (!s.isValid || !e.isValid || e < s)
                throw new Error("Invalid month range");
              const out: string[] = [];
              let c = s.startOf("month");
              while (c <= e) {
                out.push(c.toFormat("yyyy-MM"));
                c = c.plus({ months: 1 });
              }
              return out;
            })();

      setDownloadTotalCount(months.length);
      const list: TeacherMonthData[] = [];
      let done = 0;
      for (const m of months) {
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const q = new URLSearchParams({ month: m, mode });
        if (workerId) q.set("workerId", workerId);

        const controller = new AbortController();
        activeFetchControllerRef.current = controller;

        const res = await fetch(`/api/attendance/working-hours?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        activeFetchControllerRef.current = null;

        const json = (await res.json()) as Payload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed to load ${m}`);
        list.push({
          month: json.month,
          zone: json.zone,
          entries: json.entries,
          worker: json.worker,
          totalHours: json.totalHours,
        });
        done++;
        setDownloadDoneCount(done);
      }

      setDownloadStatus("Generating PDF...");
      const title =
        periodMode === "year"
          ? `${periodYear}`
          : `${periodStartMonth} to ${periodEndMonth}`;
      const suffix =
        periodMode === "year"
          ? `${periodYear}`
          : `${periodStartMonth}-${periodEndMonth}`;
      const workerMeta = list[0]?.worker;
      const doc = await generateTeacherAttendancePdf({
        monthsData: list,
        titlePeriod: title,
        filePrefix: workerMeta?.employeeId ?? workerMeta?.id ?? "staff",
      });
      doc.save(
        `MHMS-Teacher-Attendance-${workerMeta?.employeeId ?? workerMeta?.id ?? "staff"}-${suffix}.pdf`
      );
      setPeriodOpen(false);
      toast.success("Period Attendance PDF downloaded!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download PDF";
      if (/cancelled|abort/i.test(msg)) toast.message("Download cancelled.");
      else toast.error(msg);
    } finally {
      setDownloading(false);
      activeFetchControllerRef.current = null;
    }
  }, [
    mode,
    periodEndMonth,
    periodMode,
    periodStartMonth,
    periodYear,
    workerId,
    zone,
  ]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <WorkingHoursMonthPickerCard
          value={month}
          onChange={setMonth}
          zone={zone}
          disabled={loading && !data}
        />
        {loading && data ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Updating…
          </p>
        ) : null}

        {/* PDF Export Controls */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <label className="text-xs text-zinc-500 flex items-center">
            Yearly PDF
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) =>
                setYear(Number(e.target.value) || new Date().getFullYear())
              }
              className="ml-2 w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={downloading}
            onClick={() => void downloadYearPdf()}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            {downloading ? "Preparing..." : "Download Year PDF"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={downloading}
            onClick={() => setPeriodOpen(true)}
            className="gap-1.5"
          >
            <Calendar className="size-3.5" />
            Period-wise PDF
          </Button>
        </div>
      </div>

      {periodOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-1360 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
                aria-label="Close period modal"
                onClick={() => setPeriodOpen(false)}
              />
              <Card className="relative z-1 w-full max-w-md border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Download className="size-4 text-blue-400" />
                    Download Attendance PDF
                  </CardTitle>
                  <CardDescription>
                    Choose full calendar year or custom month range export.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={periodMode === "year" ? "default" : "secondary"}
                      onClick={() => setPeriodMode("year")}
                    >
                      Full Year
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={periodMode === "range" ? "default" : "secondary"}
                      onClick={() => setPeriodMode("range")}
                    >
                      Custom Range
                    </Button>
                  </div>
                  {periodMode === "year" ? (
                    <label className="block text-sm">
                      <span className="mb-1 block text-zinc-400">Year</span>
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={periodYear}
                        onChange={(e) =>
                          setPeriodYear(
                            Number(e.target.value) || new Date().getFullYear()
                          )
                        }
                        className="w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2"
                      />
                    </label>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-sm">
                        <span className="mb-1 block text-zinc-400">From Month</span>
                        <SearchableSelect
                          value={periodStartMonth}
                          onValueChange={setPeriodStartMonth}
                          includeEmpty={false}
                          options={monthOptions}
                          searchPlaceholder="Search month..."
                          triggerClassName="h-10 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-900"
                          popoverContentClassName="z-[1500] border-white/10 bg-zinc-950 text-zinc-100"
                          listClassName="max-h-[min(260px,40vh)]"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-zinc-400">To Month</span>
                        <SearchableSelect
                          value={periodEndMonth}
                          onValueChange={setPeriodEndMonth}
                          includeEmpty={false}
                          options={monthOptions}
                          searchPlaceholder="Search month..."
                          triggerClassName="h-10 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 text-sm text-zinc-100 hover:bg-zinc-900"
                          popoverContentClassName="z-[1500] border-white/10 bg-zinc-950 text-zinc-100"
                          listClassName="max-h-[min(260px,40vh)]"
                        />
                      </label>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPeriodOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={downloading}
                      onClick={() => void downloadPeriodPdf()}
                    >
                      {downloading ? "Preparing..." : "Download PDF"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}

      {data ? (
        <div className="relative">
          {loading ? (
            <div className="pointer-events-auto absolute inset-0 z-20 rounded-2xl bg-zinc-950/15 backdrop-blur-[1px]">
              <div className="space-y-4 p-3 sm:p-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
              </div>
            </div>
          ) : null}
          <div className={cn(loading && "select-none blur-[1px]")}>
            {/* School Attendance KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 sm:gap-4 mb-6">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Days Present
                  </span>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {schoolKpis.presentDays}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">days</span>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Days Absent
                  </span>
                  <XCircle className="size-4 text-rose-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
                    {schoolKpis.absentDays}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">days</span>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Approved Leaves
                  </span>
                  <Coffee className="size-4 text-blue-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-blue-700 dark:text-blue-300">
                    {schoolKpis.leaveDays}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">days</span>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Duty Hours
                  </span>
                  <Clock className="size-4 text-indigo-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-indigo-700 dark:text-indigo-300">
                    {fmtHr(schoolKpis.totalDutyHours)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">hrs</span>
                </div>
              </div>

              <div className="col-span-2 md:col-span-1 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Attendance Rate
                  </span>
                  <TrendingUp className="size-4 text-amber-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                    {schoolKpis.attendanceRate}%
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">present</span>
                </div>
              </div>
            </div>

            {/* Attendance Timeline Table Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      Teacher Attendance Sheet
                    </CardTitle>
                    <CardDescription>
                      Daily verified punch records, campus check-in/out times, and approved leaves for {titleMonth}.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && Object.keys(edits).length > 0 && (
                      <Button
                        type="button"
                        disabled={savingEdits}
                        onClick={() => void saveEdits()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      >
                        {savingEdits ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        {savingEdits ? "Saving..." : "Save Changes"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={downloading}
                      onClick={() => void downloadMonthPdf()}
                      className="gap-1.5"
                    >
                      <Download className="size-3.5" />
                      {downloading ? "Preparing PDF..." : "Download Monthly PDF"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[940px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                      <th className="py-2.5 pr-3">Date</th>
                      <th className="py-2.5 pr-3">Day</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 pr-3">Punch In</th>
                      <th className="py-2.5 pr-3">Punch Out</th>
                      <th className="py-2.5 pr-3">Duty Hours</th>
                      <th className="py-2.5 pr-3">Campus / Site</th>
                      <th className="py-2.5">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map(([day, rows]) => {
                      const dt = DateTime.fromISO(day, { zone });
                      const dow = dt.isValid ? dt.toFormat("ccc") : "";
                      const weekend =
                        dt.isValid && (dt.weekday === 6 || dt.weekday === 7);
                      return rows.map((r, idx) => {
                        const statusObj = getRowStatus(r, todayYmd);
                        return (
                          <tr
                            key={r.id}
                            className={cn(
                              "border-b border-zinc-100 dark:border-white/5 transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]",
                              weekend && "bg-zinc-50/80 dark:bg-white/3"
                            )}
                          >
                            {idx === 0 ? (
                              <>
                                <td
                                  rowSpan={rows.length}
                                  className="py-2 pr-3 align-top font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300"
                                >
                                  {mode === "bs"
                                    ? formatIsoForCalendar(day, "bs", zone)
                                    : day}
                                </td>
                                <td
                                  rowSpan={rows.length}
                                  className="py-2 pr-3 align-top text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                                >
                                  {dow}
                                </td>
                              </>
                            ) : null}

                            {/* Status badge */}
                            <td className="py-2 pr-3">
                              <span
                                className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border",
                                  statusObj.bg
                                )}
                              >
                                {statusObj.label}
                              </span>
                            </td>

                            {/* In Time */}
                            <td className="py-2 pr-3 tabular-nums font-mono text-xs">
                              {canEdit ? (
                                <input
                                  type="text"
                                  value={edits[r.id]?.inTime ?? r.inTime}
                                  onChange={(e) =>
                                    handleEditChange(
                                      r.id,
                                      "inTime",
                                      e.target.value,
                                      r
                                    )
                                  }
                                  className="w-20 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-white/15 dark:bg-zinc-950 font-mono"
                                />
                              ) : (
                                r.inTime
                              )}
                            </td>

                            {/* Out Time */}
                            <td className="py-2 pr-3 tabular-nums font-mono text-xs">
                              {canEdit ? (
                                <input
                                  type="text"
                                  value={edits[r.id]?.outTime ?? r.outTime}
                                  onChange={(e) =>
                                    handleEditChange(
                                      r.id,
                                      "outTime",
                                      e.target.value,
                                      r
                                    )
                                  }
                                  className="w-20 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-white/15 dark:bg-zinc-950 font-mono"
                                />
                              ) : (
                                r.outTime
                              )}
                            </td>

                            {/* Duty Hours */}
                            <td className="py-2 pr-3 tabular-nums font-mono text-xs font-semibold">
                              {canEdit ? (
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  value={
                                    edits[r.id]?.dutyHours ??
                                    r.dutyHours.toFixed(2)
                                  }
                                  onChange={(e) =>
                                    handleEditChange(
                                      r.id,
                                      "dutyHours",
                                      e.target.value,
                                      r
                                    )
                                  }
                                  className="w-20 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-white/15 dark:bg-zinc-950 font-mono"
                                />
                              ) : (
                                fmtHr(r.dutyHours)
                              )}
                            </td>

                            {/* Campus / Site */}
                            <td className="py-2 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {canEdit ? (
                                <input
                                  type="text"
                                  value={edits[r.id]?.workPlace ?? r.workPlace}
                                  onChange={(e) =>
                                    handleEditChange(
                                      r.id,
                                      "workPlace",
                                      e.target.value,
                                      r
                                    )
                                  }
                                  className="w-full min-w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                                />
                              ) : (
                                r.workPlace || "MHMS Main Campus"
                              )}
                            </td>

                            {/* Remark */}
                            <td className="py-2 text-xs">
                              {canEdit ? (
                                <input
                                  type="text"
                                  value={edits[r.id]?.remark ?? r.remark}
                                  onChange={(e) =>
                                    handleEditChange(
                                      r.id,
                                      "remark",
                                      e.target.value,
                                      r
                                    )
                                  }
                                  className="w-full min-w-36 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-zinc-950"
                                />
                              ) : (
                                <span className="text-zinc-600 dark:text-zinc-300">
                                  {r.remark}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })}

                    {/* Table Monthly Summary Footer */}
                    <tr className="border-t-2 border-zinc-300 bg-zinc-100/90 font-bold dark:border-white/20 dark:bg-zinc-900/90 text-xs">
                      <td
                        className="py-2.5 pr-3 text-zinc-900 dark:text-zinc-100"
                        colSpan={5}
                      >
                        Total Month Duty Hours ({schoolKpis.presentDays} Days Present, {schoolKpis.absentDays} Absent, {schoolKpis.leaveDays} Leaves)
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums font-mono text-zinc-900 dark:text-zinc-100">
                        {fmtHr(schoolKpis.totalDutyHours)} hrs
                      </td>
                      <td
                        className="py-2.5 pr-3 text-zinc-500 dark:text-zinc-400"
                        colSpan={2}
                      >
                        Attendance: {schoolKpis.attendanceRate}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {/* Global Progress Modal */}
      {downloading &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/20 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900">
              <div className="p-6">
                <div className="mb-4 flex items-center gap-4">
                  <div className="relative flex size-12 shrink-0 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-spin" />
                    <Loader2 className="size-5 text-blue-500 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      {downloadStatus || "Generating Attendance PDF..."}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Compiling MHMS official reports with verified digital punch records.
                    </p>
                  </div>
                </div>

                {downloadTotalCount > 0 && (
                  <div className="space-y-2 mt-6">
                    <div className="flex justify-between text-xs font-mono text-zinc-500 font-semibold">
                      <span>Progress</span>
                      <span>
                        {downloadDoneCount} / {downloadTotalCount} Months
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{
                          width: `${Math.round(
                            (downloadDoneCount / downloadTotalCount) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelDownload}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
