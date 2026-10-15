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
import { Loader2, Download, Archive, Users, FileSpreadsheet } from "lucide-react";

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
  const [periodYear, setPeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE);
    return Number(current.split("-")[0]) || DateTime.now().year;
  });
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
  const { mode } = useCalendarMode();

  React.useEffect(() => {
    setMounted(true);
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
      return Array.from(
        { length: 12 },
        (_, i) =>
          `${String(periodYear).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
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
  }, [periodEndMonth, periodMode, periodStartMonth, periodYear]);

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
      const periodTitle =
        periodMode === "year"
          ? `${periodYear}`
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
        const suffix =
          periodMode === "year"
            ? `${periodYear}`
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

        {/* Batch Export Modal */}
        {periodOpen && mounted && typeof document !== "undefined"
          ? createPortal(
              <div className="fixed inset-0 z-1360 flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
                  aria-label="Close all-employees export modal"
                  onClick={() => setPeriodOpen(false)}
                />
                <Card className="relative z-1 w-full max-w-md border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Archive className="size-4 text-blue-400" />
                      Batch Export All Staff Attendance
                    </CardTitle>
                    <CardDescription>
                      Downloads an archive containing verified attendance PDF reports for all {users.length} teachers and staff.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                        disabled={downloadingAll}
                        onClick={() => void downloadAllEmployeesZip()}
                        className="gap-1.5"
                      >
                        <Download className="size-4" />
                        {downloadingAll ? "Preparing..." : "Download ZIP"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>,
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
