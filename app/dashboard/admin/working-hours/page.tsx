"use client";

import * as React from "react";
import Link from "next/link";
import JSZip from "jszip";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";
import { Button } from "@/components/ui/button";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import {
  monthLabelForModeYm,
  currentMonthYyyyMmForMode,
  convertMonthMode,
  adIsoToBsIso,
} from "@/lib/date/bs-calendar";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import {
  generateTeacherAttendancePdf,
  TeacherMonthData,
} from "@/lib/school/attendance-pdf";
import { toast } from "sonner";
import { Loader2, Download, Archive, Users, FileSpreadsheet, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AppSelect } from "@/components/ui/app-select";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  designation?: string;
};

type HoursPayload = TeacherMonthData;

export default function AdminWorkingHoursPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [workerId, setWorkerId] = React.useState("");
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [periodMode, setPeriodMode] = React.useState<"year" | "range">("year");
  const { mode } = useCalendarMode();
  const defaultYear = React.useMemo(() => {
    const current = currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE);
    return current.split("-")[0] || String(DateTime.now().year);
  }, [mode]);

  const [periodYear, setPeriodYear] = React.useState<string>(defaultYear);
  const [periodStartMonth, setPeriodStartMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [periodEndMonth, setPeriodEndMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [downloadingAll, setDownloadingAll] = React.useState(false);
  const [downloadStatus, setDownloadStatus] = React.useState("Waiting to start...");
  const [downloadCurrentEmployee, setDownloadCurrentEmployee] = React.useState("");
  const [downloadDoneCount, setDownloadDoneCount] = React.useState(0);
  const [downloadTotalCount, setDownloadTotalCount] = React.useState(0);
  const cancelDownloadRef = React.useRef(false);
  const activeFetchControllerRef = React.useRef<AbortController | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const prevModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (!mounted) {
      setPeriodStartMonth(
        currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE)
      );
      setPeriodEndMonth(
        currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE)
      );
      prevModeRef.current = mode;
      return;
    }
    if (prevModeRef.current !== mode) {
      setPeriodStartMonth((prev) =>
        convertMonthMode(prev, prevModeRef.current, mode)
      );
      setPeriodEndMonth((prev) =>
        convertMonthMode(prev, prevModeRef.current, mode)
      );
      const current = currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE);
      const newY = current.split("-")[0] || String(DateTime.now().year);
      setPeriodYear(newY);
      prevModeRef.current = mode;
    }
  }, [mode, mounted]);

  const monthOptions = React.useMemo(() => {
    const now = DateTime.now();
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
        out.push({
          value,
          label: monthLabelForModeYm(y, m, mode),
        });
      }
    }
    return out;
  }, [mode]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          users?: UserRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load users");
        const emps = (data.users ?? []).filter((r) => r.role === "employee");
        emps.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        if (cancelled) return;
        setUsers(emps);
        setWorkerId((prev) => {
          if (prev && emps.some((e) => e.id === prev)) return prev;
          return emps[0]?.id ?? "";
        });
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error");
        if (!cancelled) {
          setUsers([]);
          setWorkerId("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildMonthsFromPeriod = React.useCallback(() => {
    if (periodMode === "year") {
      const targetYearNum = parseInt(periodYear, 10) || parseInt(defaultYear, 10);
      const targetYearStr = String(targetYearNum).padStart(4, "0");
      return Array.from(
        { length: 12 },
        (_, i) =>
          `${targetYearStr}-${String(i + 1).padStart(2, "0")}`
      );
    }
    const s = DateTime.fromFormat(periodStartMonth, "yyyy-MM");
    const e = DateTime.fromFormat(periodEndMonth, "yyyy-MM");
    if (!s.isValid || !e.isValid || e < s)
      throw new Error("Invalid month range");
    const out: string[] = [];
    let c = s.startOf("month");
    while (c <= e) {
      out.push(c.toFormat("yyyy-MM"));
      c = c.plus({ months: 1 });
    }
    return out;
  }, [defaultYear, periodEndMonth, periodMode, periodStartMonth, periodYear]);

  const buildPdfBytes = React.useCallback(
    async (rows: HoursPayload[], titlePeriod: string): Promise<Uint8Array> => {
      const doc = await generateTeacherAttendancePdf({
        monthsData: rows,
        titlePeriod,
        filePrefix:
          rows[0]?.worker?.employeeId ?? rows[0]?.worker?.id ?? "employee",
      });
      const ab = doc.output("arraybuffer");
      return new Uint8Array(ab);
    },
    []
  );

  const downloadAllEmployeesZip = React.useCallback(async () => {
    cancelDownloadRef.current = false;
    setDownloadingAll(true);
    setDownloadStatus("Preparing staff attendance reports...");
    setDownloadCurrentEmployee("");
    setDownloadDoneCount(0);
    setDownloadTotalCount(users.length);

    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months = buildMonthsFromPeriod();
      const targetYearNum = parseInt(periodYear, 10) || parseInt(defaultYear, 10);
      const modeSuffix = mode === "bs" ? "BS" : "AD";
      const periodTitle =
        periodMode === "year"
          ? `${targetYearNum} ${modeSuffix}`
          : `${periodStartMonth} to ${periodEndMonth}`;
      const zip = new JSZip();

      for (let idx = 0; idx < users.length; idx++) {
        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const emp = users[idx]!;
        setDownloadCurrentEmployee(
          emp.employeeId?.trim()
            ? `${emp.employeeId} (${emp.name || "Teacher"})`
            : emp.name || "Teacher"
        );
        setDownloadStatus(`Generating PDF ${idx + 1} of ${users.length}...`);

        const safeName = (emp.name || "Staff").replace(/[^\w.-]+/g, "_");
        const safeId = (emp.employeeId?.trim() || emp.id).replace(/[^\w.-]+/g, "_");
        const folderName = `${safeId}_${safeName}`;
        const folder = zip.folder(folderName);
        if (!folder) continue;

        const monthRows: HoursPayload[] = [];
        for (const m of months) {
          if (cancelDownloadRef.current) throw new Error("Download cancelled");
          const q = new URLSearchParams({ month: m, workerId: emp.id });
          const controller = new AbortController();
          activeFetchControllerRef.current = controller;
          const res = await fetch(`/api/attendance/working-hours?${q.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          activeFetchControllerRef.current = null;
          const json = (await res.json()) as HoursPayload & { error?: string };
          if (!res.ok)
            throw new Error(json.error ?? `Failed to load ${m} for ${emp.name}`);
          monthRows.push(json);
        }

        if (cancelDownloadRef.current) throw new Error("Download cancelled");
        const pdf = await buildPdfBytes(monthRows, periodTitle);
        const targetYearNum = parseInt(periodYear, 10) || parseInt(defaultYear, 10);
        const modeSuffix = mode === "bs" ? "BS" : "AD";
        const suffix =
          periodMode === "year"
            ? `${targetYearNum}-${modeSuffix}`
            : `${periodStartMonth}-${periodEndMonth}`;
        folder.file(`MHMS-Teacher-Attendance-${suffix}.pdf`, pdf);
        setDownloadDoneCount(idx + 1);
      }

      if (cancelDownloadRef.current) throw new Error("Download cancelled");
      setDownloadStatus("Compressing ZIP package...");
      const out = await zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      });

      setDownloadStatus("Starting download...");
      const blob = new Blob([out], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix =
        periodMode === "year"
          ? `${periodYear}`
          : `${periodStartMonth}-${periodEndMonth}`;
      a.download = `MHMS-All-Staff-Attendance-${suffix}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPeriodOpen(false);
      toast.success("All staff attendance reports downloaded!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download ZIP";
      if (/cancelled/i.test(msg)) toast.message("Download cancelled");
      else toast.error(msg);
    } finally {
      setDownloadingAll(false);
      setDownloadStatus("Done");
      setDownloadCurrentEmployee("");
      cancelDownloadRef.current = false;
      activeFetchControllerRef.current = null;
    }
  }, [
    buildMonthsFromPeriod,
    buildPdfBytes,
    periodEndMonth,
    periodMode,
    periodStartMonth,
    periodYear,
    users,
  ]);

  const cancelAllEmployeesDownload = React.useCallback(() => {
    cancelDownloadRef.current = true;
    setDownloadStatus("Cancelling download...");
    activeFetchControllerRef.current?.abort();
  }, []);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Teacher & Staff Attendance
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Monthly attendance records, campus punch-in/out logs, approved leaves, and official downloadable PDFs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPeriodOpen(true)}
            className="gap-2"
          >
            <Archive className="size-4 text-blue-500" />
            <span>Batch Download All (ZIP)</span>
          </Button>
          <Link href="/dashboard/admin/reports">
            <Button type="button" variant="secondary" className="gap-2">
              <FileSpreadsheet className="size-4" />
              <span>Advanced Reports</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="border border-zinc-200/90 dark:border-white/10 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-blue-500" />
              Faculty & Staff Member
            </CardTitle>
            <CardDescription>
              Select an employee to view their attendance timeline, punch logs, and export reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-full max-w-md rounded-lg" />
            ) : users.length === 0 ? (
              <p className="text-sm text-zinc-500">No staff members found.</p>
            ) : (
              <div className="max-w-md space-y-2">
                <SearchableSelect
                  id="admin-wh-worker"
                  value={workerId}
                  onValueChange={setWorkerId}
                  includeEmpty={false}
                  options={users.map((u) => ({
                    value: u.id,
                    label: u.employeeId?.trim()
                      ? `${u.employeeId} - ${u.name || "Teacher"}${u.designation ? ` (${u.designation})` : ""}`
                      : `${u.name || "Teacher"}${u.designation ? ` (${u.designation})` : ""}`,
                    keywords: [u.employeeId ?? "", u.id, u.name, u.email, u.designation ?? ""],
                  }))}
                  emptyLabel="— Select Faculty Member —"
                  searchPlaceholder="Search faculty & staff…"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {workerId ? (
          <WorkingHoursMonthPanel key={workerId} workerId={workerId} />
        ) : null}

        {/* Batch Export Modal (iOS Bottom Sheet on Mobile, Centered Modal on Desktop) */}
        {mounted && typeof document !== "undefined"
          ? createPortal(
              <AnimatePresence>
                {periodOpen && (
                  <div
                    className={cn(
                      "fixed inset-0 z-[10000]",
                      isMobile
                        ? "flex flex-col justify-end p-0"
                        : "flex items-center justify-center p-4"
                    )}
                  >
                    {/* Backdrop */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                      onClick={() => !downloadingAll && setPeriodOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Modal Container */}
                    <motion.div
                      initial={
                        isMobile
                          ? { y: "100%" }
                          : { opacity: 0, scale: 0.95, y: 16 }
                      }
                      animate={
                        isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }
                      }
                      exit={
                        isMobile
                          ? { y: "100%" }
                          : { opacity: 0, scale: 0.95, y: 16 }
                      }
                      transition={
                        isMobile
                          ? { type: "spring", damping: 28, stiffness: 280 }
                          : { type: "spring", damping: 25, stiffness: 320 }
                      }
                      className={cn(
                        "relative z-10 w-full max-h-[90dvh] flex flex-col border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden",
                        isMobile ? "rounded-t-[28px]" : "max-w-md rounded-3xl"
                      )}
                    >
                      {/* Close Button */}
                      <button
                        type="button"
                        onClick={() => setPeriodOpen(false)}
                        disabled={downloadingAll}
                        className="absolute top-4 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer transition-colors disabled:opacity-50"
                        aria-label="Close"
                      >
                        <X className="size-4" />
                      </button>

                      {/* Mobile drag handle */}
                      {isMobile && (
                        <div className="flex justify-center pt-3 pb-1">
                          <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        </div>
                      )}

                      {/* Header */}
                      <div className="p-5 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                            <Archive className="size-4" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                              Batch Export All Staff Attendance
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Downloads an archive containing verified attendance PDF reports for all {users.length} teachers and staff.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="p-5 pt-2 space-y-4 overflow-y-auto">
                        {/* Segmented Mode Toggle */}
                        <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-white/[0.06] rounded-xl">
                          <button
                            type="button"
                            onClick={() => setPeriodMode("year")}
                            className={cn(
                              "py-2 text-xs font-semibold rounded-lg transition-all text-center cursor-pointer",
                              periodMode === "year"
                                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                            )}
                          >
                            Full Year
                          </button>
                          <button
                            type="button"
                            onClick={() => setPeriodMode("range")}
                            className={cn(
                              "py-2 text-xs font-semibold rounded-lg transition-all text-center cursor-pointer",
                              periodMode === "range"
                                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                            )}
                          >
                            Custom Range
                          </button>
                        </div>

                        {periodMode === "year" ? (
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                              Calendar Year
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={periodYear}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                                setPeriodYear(val);
                              }}
                              onBlur={() => {
                                if (!periodYear.trim()) {
                                  setPeriodYear(defaultYear);
                                }
                              }}
                              aria-label="Calendar Year"
                              title={mode === "bs" ? "Calendar Year (BS)" : "Calendar Year (AD)"}
                              placeholder={defaultYear}
                              className="w-full rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-zinc-800/80 px-3.5 py-2.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                From Month
                              </label>
                              <AppSelect
                                value={periodStartMonth}
                                onChange={setPeriodStartMonth}
                                options={monthOptions}
                                drawerTitle="Select From Month"
                                searchable={monthOptions.length > 4}
                                searchPlaceholder="Search month..."
                                placeholder="Select month..."
                                className="h-11 rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                To Month
                              </label>
                              <AppSelect
                                value={periodEndMonth}
                                onChange={setPeriodEndMonth}
                                options={monthOptions}
                                drawerTitle="Select To Month"
                                searchable={monthOptions.length > 4}
                                searchPlaceholder="Search month..."
                                placeholder="Select month..."
                                className="h-11 rounded-xl"
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-white/5">
                          <button
                            type="button"
                            disabled={downloadingAll}
                            onClick={() => setPeriodOpen(false)}
                            className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={downloadingAll}
                            onClick={() => void downloadAllEmployeesZip()}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all active:scale-[0.98] cursor-pointer"
                          >
                            {downloadingAll ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                <span>Preparing...</span>
                              </>
                            ) : (
                              <>
                                <Download className="size-3.5" />
                                <span>Download ZIP</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>,
              document.body
            )
          : null}

        {/* Global Progress Modal for Batch Download */}
        {downloadingAll &&
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
                        {downloadStatus || "Compiling Batch Reports..."}
                      </h3>
                      {downloadCurrentEmployee && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-xs mt-0.5">
                          {downloadCurrentEmployee}
                        </p>
                      )}
                    </div>
                  </div>

                  {downloadTotalCount > 0 && (
                    <div className="space-y-2 mt-6">
                      <div className="flex justify-between text-xs font-mono text-zinc-500 font-semibold">
                        <span>Staff Completed</span>
                        <span>
                          {downloadDoneCount} / {downloadTotalCount}
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
                      onClick={cancelAllEmployeesDownload}
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
    </div>
  );
}
