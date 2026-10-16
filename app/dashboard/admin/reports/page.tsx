"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DateTime } from "luxon";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import {
  monthLabelForModeYm,
  formatIsoForCalendar,
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
import {
  FileArchive,
  Loader2,
  Sparkles,
  User,
  Users,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Activity,
  ArrowDownToLine,
  Zap,
  Building2,
  HardDrive,
  Trash2,
  CheckCircle2,
  XCircle,
  Coffee,
  Clock,
  TrendingUp,
  FileText,
  ExternalLink,
  Search,
  FileImage,
  CheckSquare,
  Square,
  RefreshCw,
} from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";

type UserRow = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  designation?: string;
};

type SiteRow = {
  id: string;
  name: string;
};

type SiteAttendanceRow = {
  date: string;
  workerCount: number;
  workers: {
    id: string;
    name: string;
    wingId?: string;
    wingName?: string;
    designation?: string;
  }[];
};

type SiteAttendanceResponse = {
  siteId: string;
  siteName: string;
  period: "day" | "month" | "year";
  value: string;
  rows: SiteAttendanceRow[];
};

const DEFAULT_CAMPUS_LOCATIONS: SiteRow[] = [
  { id: "all", name: "Whole Campus / All Wings (Munshi Habibullah Mission School)" },
  { id: "higher", name: "Higher School Wing (Class 1st to 12th Senior Wing)" },
  { id: "lower", name: "Lower School Wing (Pre-Nursery to UKG Kindergarten Wing)" },
  { id: "rewa_na_kasco", name: "Rewa na Kasco (Special Handicraft, Vocational & Arts Wing)" },
];

type HoursPayload = TeacherMonthData;

function getReportRowStatus(
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
  if (isFuture || rem.includes("unmarked")) {
    return {
      label: "Unmarked",
      bg: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20",
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

export default function AdminReportsPage() {
  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<"employee" | "site" | "storage">("employee");

  // ── Employee reports state ───────────────────────────────────────────────
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Advanced features selection
  const [targetType, setTargetType] = React.useState<"all" | "individual">("all");
  const [selectedWorkerId, setSelectedWorkerId] = React.useState("");

  const [periodMode, setPeriodMode] = React.useState<"year" | "month" | "range">("month");

  // Initialize calendar correct default year
  const [periodYear, setPeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE);
    return Number(current.split("-")[0]) || DateTime.now().year;
  });

  const [periodSingleMonth, setPeriodSingleMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [periodStartMonth, setPeriodStartMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [periodEndMonth, setPeriodEndMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );

  // Execution states
  const [downloading, setDownloading] = React.useState(false);
  const [downloadStatus, setDownloadStatus] = React.useState("");
  const [downloadCurrentDetail, setDownloadCurrentDetail] = React.useState("");
  const [downloadDoneCount, setDownloadDoneCount] = React.useState(0);
  const [downloadTotalCount, setDownloadTotalCount] = React.useState(0);
  const cancelDownloadRef = React.useRef(false);
  const activeFetchControllerRef = React.useRef<AbortController | null>(null);

  // Preview state
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<HoursPayload | null>(null);

  // ── Site reports state ───────────────────────────────────────────────────
  const [sites, setSites] = React.useState<SiteRow[]>(DEFAULT_CAMPUS_LOCATIONS);
  const [sitesLoading, setSitesLoading] = React.useState(false);
  const [selectedSiteId, setSelectedSiteId] = React.useState("all");
  const [sitePeriodMode, setSitePeriodMode] = React.useState<"day" | "month" | "year">("month");
  const [sitePeriodDay, setSitePeriodDay] = React.useState(() =>
    DateTime.now().setZone(DEFAULT_ATTENDANCE_TIME_ZONE).toISODate() ?? ""
  );
  const [sitePeriodValue, setSitePeriodValue] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [sitePeriodYear, setSitePeriodYear] = React.useState(() => {
    const current = currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE);
    return Number(current.split("-")[0]) || DateTime.now().year;
  });
  const [siteData, setSiteData] = React.useState<SiteAttendanceResponse | null>(null);
  const [siteLoading, setSiteLoading] = React.useState(false);
  const [siteDownloading, setSiteDownloading] = React.useState(false);

  // ── Storage cleanup state ────────────────────────────────────────────────
  type StorageFileItem = {
    url: string;
    pathname: string;
    size: number;
    sizeFormatted: string;
    uploadedAtIso: string;
    viewUrl: string;
    category: string;
    userId: string | null;
    userName: string;
    fileName: string;
  };
  const [storageFromMonth, setStorageFromMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [storageToMonth, setStorageToMonth] = React.useState(() =>
    currentMonthYyyyMmForMode("ad", DEFAULT_ATTENDANCE_TIME_ZONE)
  );
  const [storageLoading, setStorageLoading] = React.useState(false);
  const [storageDeleting, setStorageDeleting] = React.useState(false);
  const [storageFiles, setStorageFiles] = React.useState<StorageFileItem[]>([]);
  const [storageTotalBytesFormatted, setStorageTotalBytesFormatted] = React.useState("0 B");
  const [storageFilterMode, setStorageFilterMode] = React.useState<"all" | "range">("all");
  const [storageSearchQuery, setStorageSearchQuery] = React.useState("");
  const [storageSelectedUrls, setStorageSelectedUrls] = React.useState<string[]>([]);
  const [storageDeletingUrl, setStorageDeletingUrl] = React.useState<string | null>(null);
  const [storageCompressingUrl, setStorageCompressingUrl] = React.useState<string | null>(null);
  const [storageConfirmModal, setStorageConfirmModal] = React.useState<{
    title: string;
    subtitle?: string;
    description: string;
    confirmText: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [storagePreview, setStoragePreview] = React.useState<{
    scannedCount: number;
    deleteCandidateCount: number;
    sample: { pathname: string; uploadedAtIso: string }[];
    truncated?: boolean;
  } | null>(null);

  const [mounted, setMounted] = React.useState(false);
  const { mode } = useCalendarMode();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const prevModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (!mounted) {
      setPeriodSingleMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
      setPeriodStartMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
      setPeriodEndMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
      setSitePeriodValue(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
      setStorageFromMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
      setStorageToMonth(currentMonthYyyyMmForMode(mode, DEFAULT_ATTENDANCE_TIME_ZONE));
      prevModeRef.current = mode;
      return;
    }
    if (prevModeRef.current !== mode) {
      setPeriodSingleMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodStartMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setPeriodEndMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setSitePeriodValue((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setStorageFromMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
      setStorageToMonth((prev) => convertMonthMode(prev, prevModeRef.current, mode));
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

  // Load employees
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
        const data = (await res.json()) as { users?: UserRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load users");
        const emps = (data.users ?? []).filter((r) => r.role === "employee");
        emps.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        if (cancelled) return;
        setUsers(emps);
        if (emps.length > 0 && !selectedWorkerId) {
          setSelectedWorkerId(emps[0]!.id);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute month ranges
  const buildMonthsFromPeriod = React.useCallback(() => {
    if (periodMode === "month") {
      return [periodSingleMonth];
    }
    if (periodMode === "year") {
      return Array.from(
        { length: 12 },
        (_, i) =>
          `${String(periodYear).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`
      );
    }
    const s = DateTime.fromFormat(periodStartMonth, "yyyy-MM");
    const e = DateTime.fromFormat(periodEndMonth, "yyyy-MM");
    if (!s.isValid || !e.isValid || e < s) throw new Error("Invalid month range");
    const out: string[] = [];
    let c = s.startOf("month");
    while (c <= e) {
      out.push(c.toFormat("yyyy-MM"));
      c = c.plus({ months: 1 });
    }
    return out;
  }, [periodEndMonth, periodMode, periodStartMonth, periodYear, periodSingleMonth]);

  // Fetch school logo for PDF
  const fetchLogoDataUrl = React.useCallback(async (): Promise<string | null> => {
    try {
      let res = await fetch("/branding/mhms-logo.png");
      if (!res.ok) res = await fetch("/branding/mtes-logo.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      const reader = new FileReader();
      return await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }, []);

  // PDF generator using official MHMS school layout
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

  // Fetch preview for selected employee
  const fetchPreview = React.useCallback(async () => {
    if (!selectedWorkerId) {
      toast.error("Select a specific faculty member to preview");
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const q = new URLSearchParams({
        month: periodSingleMonth,
        workerId: selectedWorkerId,
        mode,
      });
      const res = await fetch(`/api/attendance/working-hours?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as HoursPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load preview");
      setPreviewData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedWorkerId, periodSingleMonth, mode]);

  // Preview School KPIs
  const previewKpis = React.useMemo(() => {
    if (!previewData) return null;
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let sundayDays = 0;
    let totalDutyHours = 0;
    const todayYmd = DateTime.now().setZone(previewData.zone).toISODate()!;

    for (const r of previewData.entries) {
      totalDutyHours += r.dutyHours;
      const rem = (r.remark || "").toLowerCase();
      const isFuture = r.day > todayYmd;
      if (rem.includes("leave")) {
        leaveDays++;
      } else if (rem.includes("sunday") || rem.includes("holiday")) {
        sundayDays++;
      } else if (isFuture || rem.includes("unmarked")) {
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
  }, [previewData]);

  // Main download trigger (single teacher PDF or batch ZIP)
  const startDownload = React.useCallback(async () => {
    if (targetType === "individual" && !selectedWorkerId) {
      toast.error("Please select a faculty member first");
      return;
    }

    cancelDownloadRef.current = false;
    setDownloading(true);
    setDownloadStatus("Starting download...");
    setDownloadCurrentDetail("");
    setDownloadDoneCount(0);

    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const months = buildMonthsFromPeriod();

      let periodTitle = "";
      let suffix = "";
      if (periodMode === "year") {
        periodTitle = `${periodYear}`;
        suffix = `${periodYear}`;
      } else if (periodMode === "month") {
        const pMonthParts = periodSingleMonth.split("-").map(Number);
        periodTitle =
          pMonthParts.length === 2 &&
          Number.isFinite(pMonthParts[0]) &&
          Number.isFinite(pMonthParts[1])
            ? monthLabelForModeYm(pMonthParts[0]!, pMonthParts[1]!, mode)
            : periodSingleMonth;
        suffix = periodSingleMonth;
      } else {
        periodTitle = `${periodStartMonth} to ${periodEndMonth}`;
        suffix = `${periodStartMonth}-${periodEndMonth}`;
      }

      const targets =
        targetType === "all"
          ? users
          : users.filter((u) => u.id === selectedWorkerId);

      if (targets.length === 0) throw new Error("No faculty members found");
      setDownloadTotalCount(targets.length * months.length);

      if (targetType === "individual") {
        setDownloadStatus(`Gathering ${months.length} month(s) of attendance data...`);
        const emp = targets[0]!;
        setDownloadCurrentDetail(emp.name || "Teacher");

        const monthRows: HoursPayload[] = [];
        let doneForTarget = 0;
        for (const m of months) {
          if (cancelDownloadRef.current) throw new Error("Download cancelled");
          const q = new URLSearchParams({ month: m, workerId: emp.id, mode });
          const controller = new AbortController();
          activeFetchControllerRef.current = controller;
          const res = await fetch(
            `/api/attendance/working-hours?${q.toString()}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            }
          );
          activeFetchControllerRef.current = null;
          const json = (await res.json()) as HoursPayload & { error?: string };
          if (!res.ok)
            throw new Error(json.error ?? `Failed to load ${m} for ${emp.name}`);
          monthRows.push(json);
          doneForTarget++;
          setDownloadDoneCount(doneForTarget);
        }

        setDownloadStatus("Generating PDF...");
        const pdf = await buildPdfBytes(monthRows, periodTitle);
        setDownloadStatus("Downloading...");
        const blob = new Blob([pdf as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fileNameSafeName = (
          emp.employeeId?.trim() ||
          emp.name ||
          "Teacher"
        ).replace(/[^\w.-]+/g, "_");
        a.download = `MHMS-Teacher-Attendance-${fileNameSafeName}_${suffix}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(`Official PDF downloaded for ${emp.name}`);
      } else {
        const zip = new JSZip();
        let totalDone = 0;
        for (let idx = 0; idx < targets.length; idx++) {
          if (cancelDownloadRef.current) throw new Error("Download cancelled");
          const emp = targets[idx]!;
          setDownloadCurrentDetail(emp.name || "Teacher");
          setDownloadStatus(
            `Processing faculty member ${idx + 1} of ${targets.length}...`
          );

          const safeName = (emp.name || "Teacher").replace(/[^\w.-]+/g, "_");
          const safeId = (emp.employeeId?.trim() || emp.id).replace(
            /[^\w.-]+/g,
            "_"
          );
          const folderName = `${safeId}_${safeName}`;
          const folder = zip.folder(folderName);
          if (!folder) continue;

          const monthRows: HoursPayload[] = [];
          for (const m of months) {
            if (cancelDownloadRef.current) throw new Error("Download cancelled");
            const q = new URLSearchParams({ month: m, workerId: emp.id, mode });
            const controller = new AbortController();
            activeFetchControllerRef.current = controller;
            const res = await fetch(
              `/api/attendance/working-hours?${q.toString()}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              }
            );
            activeFetchControllerRef.current = null;
            const json = (await res.json()) as HoursPayload & { error?: string };
            if (!res.ok)
              throw new Error(json.error ?? `Failed to load ${m} for ${emp.name}`);
            monthRows.push(json);
            totalDone++;
            setDownloadDoneCount(totalDone);
          }

          if (cancelDownloadRef.current) throw new Error("Download cancelled");
          const pdf = await buildPdfBytes(monthRows, periodTitle);
          folder.file(`MHMS-Teacher-Attendance-${safeName}_${suffix}.pdf`, pdf);
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
        a.download = `MHMS-All-Staff-Attendance-${suffix}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("All staff attendance reports downloaded!");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to download";
      if (/cancelled|abort/i.test(msg)) toast.message("Download cancelled.");
      else toast.error(msg);
    } finally {
      setDownloading(false);
      setDownloadStatus("");
      setDownloadCurrentDetail("");
      cancelDownloadRef.current = false;
      activeFetchControllerRef.current = null;
    }
  }, [
    targetType,
    selectedWorkerId,
    users,
    buildMonthsFromPeriod,
    periodMode,
    periodYear,
    periodSingleMonth,
    periodStartMonth,
    periodEndMonth,
    mode,
    buildPdfBytes,
  ]);

  const cancelDownload = React.useCallback(() => {
    cancelDownloadRef.current = true;
    setDownloadStatus("Cancelling download...");
    activeFetchControllerRef.current?.abort();
  }, []);

  // ── Campuses & Wings: load list ─────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setSitesLoading(true);
      try {
        const res = await fetch("/api/school/config");
        if (res.ok) {
          const cfg = (await res.json()) as {
            wings?: Array<{ id: string; name: string; description?: string }>;
          };
          if (cfg.wings && Array.isArray(cfg.wings) && cfg.wings.length > 0) {
            const list: SiteRow[] = [
              {
                id: "all",
                name: "Whole Campus / All Wings (Munshi Habibullah Mission School)",
              },
              ...cfg.wings.map((w) => ({
                id: w.id,
                name: `${w.name} (${w.description || "Wing"})`,
              })),
            ];
            if (!cancelled) {
              setSites(list);
              setSelectedSiteId((prev) => prev || "all");
            }
            return;
          }
        }
      } catch {
        // fallback
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
      if (!cancelled) {
        setSites(DEFAULT_CAMPUS_LOCATIONS);
        setSelectedSiteId((prev) => prev || "all");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Sites: fetch headcount ───────────────────────────────────────────────
  const fetchSiteData = React.useCallback(async () => {
    if (!selectedSiteId) {
      toast.error("Please select a campus location first");
      return;
    }
    cancelDownloadRef.current = false;
    setSiteLoading(true);
    setSiteData(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      let value = sitePeriodValue;
      if (sitePeriodMode === "year") value = String(sitePeriodYear);
      if (sitePeriodMode === "day") value = sitePeriodDay;
      const q = new URLSearchParams({
        siteId: selectedSiteId,
        period: sitePeriodMode,
        value,
      });

      const controller = new AbortController();
      activeFetchControllerRef.current = controller;

      const res = await fetch(`/api/admin/site-attendance?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      activeFetchControllerRef.current = null;
      if (cancelDownloadRef.current) throw new Error("Fetch cancelled");

      const json = (await res.json()) as SiteAttendanceResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load campus data");
      setSiteData(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load campus data";
      if (/cancelled|abort/i.test(msg)) toast.message("Fetch cancelled.");
      else toast.error(msg);
    } finally {
      setSiteLoading(false);
      activeFetchControllerRef.current = null;
      cancelDownloadRef.current = false;
    }
  }, [selectedSiteId, sitePeriodMode, sitePeriodValue, sitePeriodYear, sitePeriodDay]);

  // ── Sites: download PDF ──────────────────────────────────────────────────
  const downloadSitePdf = React.useCallback(async () => {
    if (!siteData) {
      toast.error("Load campus data first");
      return;
    }
    setSiteDownloading(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const logo = await fetchLogoDataUrl();
      const marginX = 40;
      const pageWidth = doc.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;

      // Header
      const y = 20;
      if (logo) doc.addImage(logo, "PNG", marginX, y, 42, 42);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 24, 27);
      doc.text("MUNSHI HABIBULLAH MISSION SCHOOL", centerX, y + 12, { align: "center" });

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text("Bemathang, Kargil, UT Ladakh - 194103", centerX, y + 24, { align: "center" });
      doc.text("Affiliated to JKBOSE | Managed by Mutahhary Educational Society (MTES)", centerX, y + 34, { align: "center" });

      doc.setDrawColor(210, 210, 215);
      doc.line(marginX, y + 42, pageWidth - marginX, y + 42);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 24, 27);
      doc.text("CAMPUS & WING ATTENDANCE REPORT", centerX, y + 56, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(`Campus / Wing: ${siteData.siteName}`, marginX, y + 72);

      let periodLabel = siteData.value;
      if (siteData.period === "month") {
        const [py, pm] = siteData.value.split("-").map(Number);
        if (py && pm) periodLabel = monthLabelForModeYm(py, pm, mode);
      } else if (siteData.period === "year") {
        periodLabel = `${siteData.value}`;
      } else {
        periodLabel = siteData.value;
      }
      doc.text(`Period: ${periodLabel}`, marginX + 260, y + 72);

      const startY = y + 86;

      autoTable(doc, {
        startY,
        head: [["Date", "Staff Present", "Present Faculty & Staff Members"]],
        body: siteData.rows.map((r) => [
          r.date,
          String(r.workerCount),
          r.workers
            .map(
              (w) =>
                `${w.name}${w.designation ? ` (${w.designation})` : ""}${
                  w.wingName && siteData.siteId === "all" ? ` [${w.wingName}]` : ""
                }`
            )
            .join(", ") || "—",
        ]),
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80, halign: "center" }, 2: { cellWidth: 350 } },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? 680;
      const sigY = Math.min(finalY + 45, 785);
      doc.setFontSize(8.5);
      doc.line(marginX, sigY, marginX + 130, sigY);
      doc.text("Campus / Wing Incharge", marginX, sigY + 12);

      doc.line(pageWidth - marginX - 130, sigY, pageWidth - marginX, sigY);
      doc.text("Principal / Administrator", pageWidth - marginX - 130, sigY + 12);

      const ab = doc.output("arraybuffer");
      const blob = new Blob([new Uint8Array(ab)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = siteData.siteName.replace(/[^\w.-]+/g, "_");
      a.download = `MHMS-Campus-Report_${safeName}_${siteData.value}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Campus report PDF downloaded!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setSiteDownloading(false);
    }
  }, [siteData, fetchLogoDataUrl, mode]);

  // ── Storage cleanup functions ────────────────────────────────────────────
  const fetchStorageFiles = React.useCallback(
    async (showToast = false) => {
      setStorageLoading(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
        const params = new URLSearchParams();
        if (storageFilterMode === "range") {
          params.set("fromMonth", storageFromMonth);
          params.set("toMonth", storageToMonth);
        } else {
          params.set("all", "1");
        }
        const res = await fetch(`/api/admin/storage/photos?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch storage files");
        setStorageFiles(json.files ?? []);
        setStorageTotalBytesFormatted(json.totalBytesFormatted ?? "0 B");
        setStoragePreview({
          scannedCount: json.scannedCount ?? 0,
          deleteCandidateCount: json.deleteCandidateCount ?? 0,
          sample: json.sample ?? [],
          truncated: json.truncated,
        });
        if (showToast) {
          toast.success(`Storage scan completed (${json.totalCount ?? 0} files found)`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load storage files");
      } finally {
        setStorageLoading(false);
      }
    },
    [storageFilterMode, storageFromMonth, storageToMonth]
  );

  const compressSingleFile = React.useCallback(
    async (file: StorageFileItem) => {
      setStorageCompressingUrl(file.url);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) throw new Error("Not signed in");
        const token = await u.getIdToken();
        const res = await fetch("/api/admin/storage/photos", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: file.url }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to compress file");
        toast.success(json.message ?? "File optimized successfully!");
        void fetchStorageFiles(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error compressing file");
      } finally {
        setStorageCompressingUrl(null);
      }
    },
    [fetchStorageFiles]
  );

  const deleteSingleFile = React.useCallback(
    (file: StorageFileItem) => {
      setStorageConfirmModal({
        title: "Delete Stored Document",
        subtitle: file.fileName,
        description: `Permanently delete "${file.fileName}" (${file.sizeFormatted}) from Vercel Blob storage? This cannot be undone.`,
        confirmText: "Delete File",
        onConfirm: async () => {
          setStorageDeletingUrl(file.url);
          try {
            const auth = getFirebaseAuth();
            const u = auth.currentUser;
            if (!u) throw new Error("Not signed in");
            const token = await u.getIdToken();
            const res = await fetch("/api/admin/storage/photos", {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url: file.url }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? "Failed to delete file");
            toast.success(`Deleted "${file.fileName}" from Blob storage`);
            setStorageFiles((prev) => prev.filter((f) => f.url !== file.url));
            setStorageSelectedUrls((prev) => prev.filter((u) => u !== file.url));
            void fetchStorageFiles(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete file");
          } finally {
            setStorageDeletingUrl(null);
            setStorageConfirmModal(null);
          }
        },
      });
    },
    [fetchStorageFiles]
  );

  const deleteSelectedFiles = React.useCallback(() => {
    if (storageSelectedUrls.length === 0) return;
    setStorageConfirmModal({
      title: "Delete Selected Documents",
      subtitle: `${storageSelectedUrls.length} file(s) selected`,
      description: `Permanently delete ${storageSelectedUrls.length} selected document(s) from Vercel Blob storage? This will permanently free up storage space.`,
      confirmText: "Delete Selected",
      onConfirm: async () => {
        setStorageDeleting(true);
        try {
          const auth = getFirebaseAuth();
          const u = auth.currentUser;
          if (!u) throw new Error("Not signed in");
          const token = await u.getIdToken();
          const res = await fetch("/api/admin/storage/photos", {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ urls: storageSelectedUrls }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Failed to delete files");
          toast.success(
            `Successfully deleted ${json.deletedCount ?? storageSelectedUrls.length} file(s) from Blob storage`
          );
          setStorageSelectedUrls([]);
          void fetchStorageFiles(false);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to delete selected files");
        } finally {
          setStorageDeleting(false);
          setStorageConfirmModal(null);
        }
      },
    });
  }, [storageSelectedUrls, fetchStorageFiles]);

  const executeStorageDeletion = React.useCallback(() => {
    if (storageFiles.length === 0) {
      toast.error("No documents found in storage to delete.");
      return;
    }
    const label =
      storageFilterMode === "range"
        ? `all documents between ${storageFromMonth} and ${storageToMonth}`
        : "ALL stored medical reports and certificates";

    setStorageConfirmModal({
      title: "Prune Stored Documents",
      subtitle: label,
      description: `Permanently delete ${label} (${storageFiles.length} file(s)) from Vercel Blob storage? This will clear all stored files and cannot be undone.`,
      confirmText: "Prune Storage",
      onConfirm: async () => {
        setStorageDeleting(true);
        try {
          const auth = getFirebaseAuth();
          const u = auth.currentUser;
          if (!u) throw new Error("Not signed in");
          const token = await u.getIdToken();
          const res = await fetch("/api/admin/storage/photos", {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              storageFilterMode === "range"
                ? { fromMonth: storageFromMonth, toMonth: storageToMonth, confirmed: true }
                : { all: true, confirmed: true }
            ),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Failed to delete from storage");
          toast.success(
            `Successfully pruned ${json.deletedCount ?? 0} file(s) from Blob storage`
          );
          setStorageSelectedUrls([]);
          void fetchStorageFiles(false);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to delete files");
        } finally {
          setStorageDeleting(false);
          setStorageConfirmModal(null);
        }
      },
    });
  }, [storageFiles.length, storageFilterMode, storageFromMonth, storageToMonth, fetchStorageFiles]);

  // Load storage files when tab is opened
  React.useEffect(() => {
    if (activeTab === "storage") {
      void fetchStorageFiles(false);
    }
  }, [activeTab, storageFilterMode, storageFromMonth, storageToMonth, fetchStorageFiles]);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] p-4 sm:p-6 md:p-8">
      <div className="relative mx-auto max-w-5xl space-y-8 z-10">
        {/* Header Segment */}
        <div className="relative overflow-hidden rounded-3xl border border-zinc-200/50 bg-white/60 p-6 shadow-sm backdrop-blur-3xl dark:border-white/10 dark:bg-zinc-900/60">
          <div className="absolute -left-20 -top-20 z-0 size-64 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-600/20" />
          <div className="absolute -right-20 -bottom-20 z-0 size-64 rounded-full bg-purple-400/20 blur-3xl dark:bg-purple-600/20" />

          <div className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 backdrop-blur-md">
                <Sparkles className="size-3.5" />
                MHMS Analytics & Official Exports
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                School Reports Dashboard
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">
                Generate, download, and archive official JKBOSE-compliant attendance records for faculty, staff, and campus locations in print-ready PDF format.
              </p>
            </div>

            <div className="mt-4 sm:mt-0 flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-4 text-white shadow-xl shadow-cyan-500/20">
              <Zap className="size-8" />
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex w-full items-center rounded-2xl bg-zinc-100/80 p-1 backdrop-blur-sm dark:bg-zinc-800/80 shadow-inner">
          <button
            onClick={() => setActiveTab("employee")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              activeTab === "employee"
                ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <Users className="size-4" /> Faculty & Staff Reports
          </button>
          <button
            onClick={() => setActiveTab("site")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              activeTab === "site"
                ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <Building2 className="size-4" /> Campus Attendance Reports
          </button>
          <button
            onClick={() => setActiveTab("storage")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              activeTab === "storage"
                ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <HardDrive className="size-4" /> Storage
          </button>
        </div>

        {/* ══════════════════════════════════════════════ EMPLOYEE TAB ══ */}
        {activeTab === "employee" && (
          <>
            {/* Control Interface Grid */}
            <div className="grid gap-6 md:grid-cols-12">
              {/* Target Selection Panel */}
              <Card className="md:col-span-12 lg:col-span-5 relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <Activity className="size-4" /> Select Faculty Member
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTargetType("all")}
                      className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 outline-none transition-all ${
                        targetType === "all"
                          ? "border-cyan-500 bg-cyan-50/50 text-cyan-900 shadow-lg shadow-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100"
                          : "border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <Users
                        className={`size-6 transition-transform ${
                          targetType === "all"
                            ? "scale-110 text-cyan-600 dark:text-cyan-400"
                            : ""
                        }`}
                      />
                      <span className="text-sm font-semibold">
                        All Faculty & Staff
                      </span>
                      {targetType === "all" && (
                        <div className="absolute inset-x-0 -bottom-2 mx-auto h-1 w-8 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetType("individual")}
                      className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 outline-none transition-all ${
                        targetType === "individual"
                          ? "border-purple-500 bg-purple-50/50 text-purple-900 shadow-lg shadow-purple-500/20 dark:bg-purple-500/10 dark:text-purple-100"
                          : "border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <User
                        className={`size-6 transition-transform ${
                          targetType === "individual"
                            ? "scale-110 text-purple-600 dark:text-purple-400"
                            : ""
                        }`}
                      />
                      <span className="text-sm font-semibold">
                        Individual Teacher
                      </span>
                      {targetType === "individual" && (
                        <div className="absolute inset-x-0 -bottom-2 mx-auto h-1 w-8 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                      )}
                    </button>
                  </div>

                  {targetType === "individual" && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Search for Faculty Member
                      </label>
                      <SearchableSelect
                        value={selectedWorkerId}
                        onValueChange={setSelectedWorkerId}
                        includeEmpty={false}
                        options={users.map((u) => ({
                          value: u.id,
                          label: u.employeeId?.trim()
                            ? `${u.employeeId} — ${u.name || "Teacher"}${u.designation ? ` (${u.designation})` : ""}`
                            : `${u.name || "Teacher"}${u.designation ? ` (${u.designation})` : ""}`,
                          keywords: [
                            u.employeeId ?? "",
                            u.id,
                            u.name,
                            u.email,
                            u.designation ?? "",
                          ],
                        }))}
                        emptyLabel="— Select Faculty Member —"
                        searchPlaceholder="Search faculty & staff..."
                        triggerClassName="h-11 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-purple-500/50 hover:bg-zinc-50 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-white/10 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timeframe Engine */}
              <Card className="md:col-span-12 lg:col-span-7 relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <CalendarRange className="size-4" /> Select Date Range
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="inline-flex w-full items-center rounded-xl bg-zinc-100/80 p-1 backdrop-blur-sm dark:bg-zinc-800/80 shadow-inner">
                    <button
                      onClick={() => setPeriodMode("month")}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                        periodMode === "month"
                          ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setPeriodMode("year")}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                        periodMode === "year"
                          ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Yearly
                    </button>
                    <button
                      onClick={() => setPeriodMode("range")}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                        periodMode === "range"
                          ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {periodMode === "month" ? (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Select Month
                      </label>
                      <SearchableSelect
                        value={periodSingleMonth}
                        onValueChange={setPeriodSingleMonth}
                        includeEmpty={false}
                        options={monthOptions}
                        searchPlaceholder="Select month..."
                        triggerClassName="h-12 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                      />
                    </div>
                  ) : periodMode === "year" ? (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Calendar Year
                      </label>
                      <div className="relative">
                        <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-zinc-400" />
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          value={periodYear}
                          onChange={(e) => setPeriodYear(Number(e.target.value))}
                          className="h-12 w-full rounded-xl border border-zinc-200 bg-white/50 backdrop-blur-md pl-12 pr-4 text-base font-semibold shadow-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-300">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                          From Month
                        </label>
                        <SearchableSelect
                          value={periodStartMonth}
                          onValueChange={setPeriodStartMonth}
                          includeEmpty={false}
                          options={monthOptions}
                          searchPlaceholder="Select month..."
                          triggerClassName="h-12 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                          To Month
                        </label>
                        <SearchableSelect
                          value={periodEndMonth}
                          onValueChange={setPeriodEndMonth}
                          includeEmpty={false}
                          options={monthOptions}
                          searchPlaceholder="Select month..."
                          triggerClassName="h-12 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Execution & Processing HUD */}
            <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-2xl shadow-cyan-500/10 p-2 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/90 dark:shadow-cyan-500/5">
              {!downloading && (
                <div className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row sm:px-6">
                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div
                      className={`flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 shadow-[inset_0_0_10px_rgba(6,182,212,0.3)] dark:bg-cyan-500/20 dark:text-cyan-400 ${
                        loading ? "animate-pulse" : ""
                      }`}
                    >
                      {loading ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <ChevronRight className="size-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        Ready to Download
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {targetType === "all"
                          ? "Export all faculty attendance reports in an organized ZIP archive."
                          : "Download official print-ready PDF report for selected teacher."}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full gap-3 sm:w-auto">
                    {periodMode === "month" && targetType === "individual" && (
                      <Button
                        size="lg"
                        onClick={() => void fetchPreview()}
                        disabled={previewLoading || !selectedWorkerId}
                        className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 gap-2 h-12 transition-all hover:scale-[1.02] active:scale-95"
                      >
                        {previewLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Activity className="size-4" />
                        )}
                        Preview
                      </Button>
                    )}
                    <Button
                      size="lg"
                      onClick={startDownload}
                      disabled={loading || users.length === 0}
                      className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 border-t border-white/10 font-bold text-white shadow-xl shadow-zinc-500/20 hover:from-zinc-800 hover:to-zinc-700 dark:from-white dark:to-zinc-200 dark:text-zinc-900 dark:shadow-cyan-500/10 dark:hover:from-zinc-200 dark:hover:to-zinc-300 gap-2 h-12 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      {targetType === "all" ? (
                        <>
                          <FileArchive className="size-4" /> Download All Reports (ZIP)
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="size-4" /> Download Report (PDF)
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Faculty monthly preview table */}
            {previewData && periodMode === "month" && targetType === "individual" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* 5 School KPI Cards */}
                {previewKpis && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Days Present
                        </span>
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {previewKpis.presentDays}
                        </span>
                        <span className="text-xs text-zinc-500">days</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Days Absent
                        </span>
                        <XCircle className="size-4 text-rose-500" />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
                          {previewKpis.absentDays}
                        </span>
                        <span className="text-xs text-zinc-500">days</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          Approved Leaves
                        </span>
                        <Coffee className="size-4 text-blue-500" />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold tabular-nums text-blue-700 dark:text-blue-300">
                          {previewKpis.leaveDays}
                        </span>
                        <span className="text-xs text-zinc-500">days</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Duty Hours
                        </span>
                        <Clock className="size-4 text-indigo-500" />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold tabular-nums text-indigo-700 dark:text-indigo-300">
                          {previewKpis.totalDutyHours.toFixed(2)}
                        </span>
                        <span className="text-xs text-zinc-500">hrs</span>
                      </div>
                    </div>

                    <div className="col-span-2 md:col-span-1 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          Attendance Rate
                        </span>
                        <TrendingUp className="size-4 text-amber-500" />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                          {previewKpis.attendanceRate}%
                        </span>
                        <span className="text-xs text-zinc-500">present</span>
                      </div>
                    </div>
                  </div>
                )}

                <Card className="overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                  <CardHeader className="bg-zinc-50/50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/10 pb-4">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <User className="size-4" />
                      {previewData.worker.name ?? "Teacher"} —{" "}
                      {(() => {
                        const p = periodSingleMonth.split("-").map(Number);
                        return monthLabelForModeYm(p[0]!, p[1]!, mode);
                      })()}{" "}
                      — Attendance Sheet Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-100 bg-zinc-50/80 dark:border-white/5 dark:bg-white/[0.03]">
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Punch In
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Punch Out
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Duty Hours
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Campus / Site
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                              Remark
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.entries.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-8 text-center text-sm text-zinc-400 italic"
                              >
                                No attendance entries found for this month.
                              </td>
                            </tr>
                          ) : (
                            (() => {
                              const todayYmd = DateTime.now()
                                .setZone(previewData.zone)
                                .toISODate()!;
                              return previewData.entries.map((e, i) => {
                                const statusObj = getReportRowStatus(e, todayYmd);
                                return (
                                  <tr
                                    key={`${e.day}-${i}`}
                                    className={`border-b border-zinc-100/60 dark:border-white/5 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02] ${
                                      i % 2 === 0
                                        ? ""
                                        : "bg-zinc-50/40 dark:bg-white/[0.015]"
                                    }`}
                                  >
                                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                      {mode === "bs"
                                        ? formatIsoForCalendar(e.day, "bs")
                                        : e.day}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span
                                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold border ${statusObj.bg}`}
                                      >
                                        {statusObj.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                      {e.inTime}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                      {e.outTime}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 font-mono">
                                      {e.dutyHours > 0
                                        ? `${e.dutyHours.toFixed(2)} h`
                                        : "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
                                      {e.workPlace || "MHMS Main Campus"}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                                      {e.remark}
                                    </td>
                                  </tr>
                                );
                              });
                            })()
                          )}
                        </tbody>
                        {previewKpis && (
                          <tfoot>
                            <tr className="bg-zinc-100/90 font-bold dark:bg-white/5 text-xs">
                              <td
                                colSpan={4}
                                className="px-4 py-3 text-zinc-800 dark:text-zinc-200"
                              >
                                Total Month Duty Hours ({previewKpis.presentDays} Days Present, {previewKpis.absentDays} Absent, {previewKpis.leaveDays} Leaves)
                              </td>
                              <td className="px-4 py-3 font-mono text-emerald-700 dark:text-emerald-400">
                                {previewKpis.totalDutyHours.toFixed(2)} hrs
                              </td>
                              <td
                                colSpan={2}
                                className="px-4 py-3 text-zinc-500 dark:text-zinc-400"
                              >
                                Attendance Rate: {previewKpis.attendanceRate}%
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════ SITE TAB ══ */}
        {activeTab === "site" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Site selector + period */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Site picker */}
              <Card className="relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <Building2 className="size-4" /> Select Campus / School Wing
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5 space-y-3">
                  {/* Quick Preset Pills for Whole Campus, Higher School, Lower School, Rewa na Kasco */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: "all", label: "🏫 Whole Campus", desc: "All Wings" },
                      { id: "higher", label: "🎓 Higher School", desc: "Class 1-12" },
                      { id: "lower", label: "🎒 Lower School", desc: "Pre-Nur to UKG" },
                      { id: "rewa_na_kasco", label: "🎨 Rewa na Kasco", desc: "Vocational" },
                    ].map((w) => {
                      const isSelected = selectedSiteId === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSelectedSiteId(w.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all shadow-xs cursor-pointer",
                            isSelected
                              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 ring-2 ring-blue-500/30"
                              : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300"
                          )}
                        >
                          <span>{w.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {sitesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Loader2 className="size-4 animate-spin" /> Loading
                      campuses…
                    </div>
                  ) : (
                    <SearchableSelect
                      value={selectedSiteId}
                      onValueChange={setSelectedSiteId}
                      includeEmpty={false}
                      options={sites.map((s) => ({ value: s.id, label: s.name }))}
                      emptyLabel="— Select Campus / School Wing —"
                      searchPlaceholder="Search campus locations or wings…"
                      triggerClassName="h-11 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm hover:border-cyan-500/50 dark:border-white/10 dark:bg-zinc-900/50"
                    />
                  )}
                  {sites.length === 0 && !sitesLoading && (
                    <p className="mt-2 text-xs text-zinc-400">
                      No campus locations configured.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Period picker */}
              <Card className="relative overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 pb-4 border-b border-zinc-100 dark:border-white/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <CalendarRange className="size-4" /> Period
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="inline-flex w-full items-center rounded-xl bg-zinc-100/80 p-1 dark:bg-zinc-800/80 shadow-inner">
                    {(["day", "month", "year"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setSitePeriodMode(p)}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all capitalize ${
                          sitePeriodMode === p
                            ? "bg-white text-zinc-900 shadow-md dark:bg-zinc-700 dark:text-white"
                            : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                        }`}
                      >
                        {p === "day"
                          ? "Daily"
                          : p === "month"
                          ? "Monthly"
                          : "Yearly"}
                      </button>
                    ))}
                  </div>

                  {sitePeriodMode === "day" && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Select Date
                      </label>
                      <DateField
                        value={sitePeriodDay}
                        onChange={setSitePeriodDay}
                        timeZone={DEFAULT_ATTENDANCE_TIME_ZONE}
                      />
                    </div>
                  )}
                  {sitePeriodMode === "month" && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Select Month
                      </label>
                      <SearchableSelect
                        value={sitePeriodValue}
                        onValueChange={setSitePeriodValue}
                        includeEmpty={false}
                        options={monthOptions}
                        searchPlaceholder="Select month…"
                        triggerClassName="h-11 w-full rounded-xl border-zinc-200 bg-white/50 backdrop-blur-md px-4 text-sm font-medium shadow-sm dark:border-white/10 dark:bg-zinc-900/50"
                      />
                    </div>
                  )}
                  {sitePeriodMode === "year" && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Calendar Year
                      </label>
                      <div className="relative">
                        <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-zinc-400" />
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          value={sitePeriodYear}
                          onChange={(e) =>
                            setSitePeriodYear(Number(e.target.value))
                          }
                          className="h-11 w-full rounded-xl border border-zinc-200 bg-white/50 pl-12 pr-4 text-base font-semibold shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Action row */}
            <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-xl p-2 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/90">
              <div className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row sm:px-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ${
                      siteLoading ? "animate-pulse" : ""
                    }`}
                  >
                    {siteLoading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Building2 className="size-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {siteData
                        ? `${siteData.rows.length} record${
                            siteData.rows.length !== 1 ? "s" : ""
                          } loaded`
                        : "Campus Attendance Reports"}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {siteData
                        ? `Campus: ${siteData.siteName}`
                        : "Select campus location and date range to preview or export."}
                    </p>
                  </div>
                </div>
                <div className="flex w-full gap-3 sm:w-auto">
                  <Button
                    onClick={fetchSiteData}
                    disabled={siteLoading || !selectedSiteId}
                    className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 gap-2 h-11 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    <Activity className="size-4" /> Preview
                  </Button>
                  <Button
                    onClick={downloadSitePdf}
                    disabled={siteDownloading || !siteData}
                    className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 text-white font-bold shadow-lg shadow-zinc-500/20 hover:from-zinc-700 hover:to-zinc-600 dark:from-white dark:to-zinc-200 dark:text-zinc-900 gap-2 h-11 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    {siteDownloading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="size-4" />
                    )}
                    Download PDF
                  </Button>
                </div>
              </div>
            </div>

            {/* Preview table */}
            {siteData && siteData.rows.length > 0 && (
              <Card className="overflow-hidden border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CardHeader className="bg-zinc-50/50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/10 pb-4">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <Building2 className="size-4" /> {siteData.siteName} — Campus
                    Attendance Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50/80 dark:border-white/5 dark:bg-white/[0.03]">
                          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                            Date
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                            Staff Present
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                            Faculty / Staff Names
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteData.rows.map((row, i) => (
                          <tr
                            key={row.date}
                            className={`border-b border-zinc-100/60 dark:border-white/5 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02] ${
                              i % 2 === 0
                                ? ""
                                : "bg-zinc-50/40 dark:bg-white/[0.015]"
                            }`}
                          >
                            <td className="px-5 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                              {mode === "bs"
                                ? formatIsoForCalendar(row.date, "bs")
                                : row.date}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  row.workerCount > 0
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                }`}
                              >
                                {row.workerCount}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                              {row.workers.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {row.workers.map((w) => (
                                    <span
                                      key={w.id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200"
                                    >
                                      <span className="font-semibold">{w.name}</span>
                                      {w.designation ? (
                                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">({w.designation})</span>
                                      ) : null}
                                      {w.wingName && selectedSiteId === "all" ? (
                                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 ml-0.5">· {w.wingName}</span>
                                      ) : null}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-400 italic">
                                  No staff attendance
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-zinc-100/60 dark:bg-white/5">
                          <td className="px-5 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            Total days with staff present
                          </td>
                          <td className="px-5 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {
                              siteData.rows.filter((r) => r.workerCount > 0)
                                .length
                            }{" "}
                            / {siteData.rows.length}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">
                            Average:{" "}
                            {siteData.rows.filter((r) => r.workerCount > 0)
                              .length > 0
                              ? (
                                  siteData.rows.reduce(
                                    (s, r) => s + r.workerCount,
                                    0
                                  ) /
                                  siteData.rows.filter((r) => r.workerCount > 0)
                                    .length
                                ).toFixed(1)
                              : "0"}{" "}
                            faculty/day
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
            {siteData && siteData.rows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-zinc-400">
                <Building2 className="mx-auto mb-3 size-10 opacity-30" />
                <p className="text-sm font-medium">
                  No attendance records found for this campus in the selected
                  period.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "storage" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Storage Header & Info */}
            <Card className="border-zinc-200 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 overflow-hidden">
              <CardHeader className="bg-zinc-50/50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/10 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                      <HardDrive className="size-5 text-cyan-600 dark:text-cyan-400" />
                      Leave Medical Documents & Certificate Storage
                    </CardTitle>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
                      Cloud storage in Vercel Blob is strictly used for staff medical certificates, prescriptions, and leave proof documents. You can inspect all files, view attachments, and permanently delete files at any time to free up storage.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchStorageFiles(true)}
                      disabled={storageLoading || storageDeleting}
                      className="gap-1.5 rounded-xl text-xs font-semibold"
                    >
                      <RefreshCw className={cn("size-3.5", storageLoading && "animate-spin")} />
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void executeStorageDeletion()}
                      disabled={storageLoading || storageDeleting || storageFiles.length === 0}
                      className="gap-1.5 rounded-xl text-xs font-bold"
                    >
                      {storageDeleting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Prune All in Range
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                {/* Metrics Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      Total Documents Stored
                    </p>
                    <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1">
                      {storageFiles.length}
                      <span className="text-xs font-medium text-zinc-500 ml-1.5">files</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      Cloud Storage Consumed
                    </p>
                    <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">
                      {storageTotalBytesFormatted}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      Storage Backend
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                        Vercel Blob (Private Store)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Filter and Search Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-zinc-100 dark:border-white/5">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-white/5 self-start">
                    <button
                      type="button"
                      onClick={() => setStorageFilterMode("all")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                        storageFilterMode === "all"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                      )}
                    >
                      All Stored Files
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorageFilterMode("range")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                        storageFilterMode === "range"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                      )}
                    >
                      Filter by Month
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      value={storageSearchQuery}
                      onChange={(e) => setStorageSearchQuery(e.target.value)}
                      placeholder="Search document name or staff..."
                      className="h-9 w-full rounded-xl border border-zinc-200 bg-white/70 pl-9 pr-3 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-white/10 dark:bg-zinc-900/70 dark:text-zinc-100"
                    />
                  </div>
                </div>

                {/* Month Range Selectors (when range mode active) */}
                {storageFilterMode === "range" && (
                  <div className="grid gap-4 md:grid-cols-2 p-3 rounded-2xl bg-zinc-50/50 border border-zinc-100 dark:bg-white/[0.02] dark:border-white/5">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        From month
                      </label>
                      <SearchableSelect
                        value={storageFromMonth}
                        onValueChange={setStorageFromMonth}
                        includeEmpty={false}
                        options={monthOptions}
                        searchPlaceholder="Select start month..."
                        triggerClassName="h-10 w-full rounded-xl border-zinc-200 bg-white/70 px-4 text-xs font-medium shadow-sm dark:border-white/10 dark:bg-zinc-900/70"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                        To month
                      </label>
                      <SearchableSelect
                        value={storageToMonth}
                        onValueChange={setStorageToMonth}
                        includeEmpty={false}
                        options={monthOptions}
                        searchPlaceholder="Select end month..."
                        triggerClassName="h-10 w-full rounded-xl border-zinc-200 bg-white/70 px-4 text-xs font-medium shadow-sm dark:border-white/10 dark:bg-zinc-900/70"
                      />
                    </div>
                  </div>
                )}

                {/* Bulk Selection Actions Bar */}
                {storageSelectedUrls.length > 0 && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-cyan-50/80 border border-cyan-200/60 dark:bg-cyan-950/30 dark:border-cyan-800/40">
                    <span className="text-xs font-semibold text-cyan-900 dark:text-cyan-200">
                      {storageSelectedUrls.length} file(s) selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setStorageSelectedUrls([])}
                        className="text-xs h-8 text-zinc-600 dark:text-zinc-300"
                      >
                        Clear Selection
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void deleteSelectedFiles()}
                        disabled={storageDeleting}
                        className="text-xs h-8 font-bold gap-1.5"
                      >
                        <Trash2 className="size-3.5" />
                        Delete Selected ({storageSelectedUrls.length})
                      </Button>
                    </div>
                  </div>
                )}

                {/* Stored Files Table */}
                {storageLoading ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-zinc-500">
                    <Loader2 className="size-7 animate-spin text-cyan-600" />
                    <p className="text-xs font-medium">Scanning Vercel Blob cloud storage...</p>
                  </div>
                ) : storageFiles.length === 0 ? (
                  <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-200 p-8 text-center dark:border-white/10">
                    <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        No Stored Documents Found
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {storageFilterMode === "range"
                          ? "No medical documents uploaded in this month range. Storage is completely clean!"
                          : "There are currently 0 medical certificates or documents stored in Vercel Blob."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-zinc-200/90 overflow-hidden dark:border-white/10 bg-white/50 dark:bg-zinc-900/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-200/80 bg-zinc-50/80 dark:border-white/10 dark:bg-white/[0.02] text-zinc-500 font-bold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-4 w-10 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  if (storageSelectedUrls.length === storageFiles.length) {
                                    setStorageSelectedUrls([]);
                                  } else {
                                    setStorageSelectedUrls(storageFiles.map((f) => f.url));
                                  }
                                }}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                              >
                                {storageSelectedUrls.length > 0 &&
                                storageSelectedUrls.length === storageFiles.length ? (
                                  <CheckSquare className="size-4 text-cyan-600" />
                                ) : (
                                  <Square className="size-4" />
                                )}
                              </button>
                            </th>
                            <th className="py-3 px-3">Document Name</th>
                            <th className="py-3 px-3">Staff / Teacher</th>
                            <th className="py-3 px-3">Upload Date</th>
                            <th className="py-3 px-3 text-right">Size</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5 font-medium text-zinc-700 dark:text-zinc-300">
                          {storageFiles
                            .filter((f) => {
                              if (!storageSearchQuery.trim()) return true;
                              const q = storageSearchQuery.toLowerCase();
                              return (
                                f.fileName.toLowerCase().includes(q) ||
                                f.userName.toLowerCase().includes(q) ||
                                f.category.toLowerCase().includes(q)
                              );
                            })
                            .map((file) => {
                              const isSelected = storageSelectedUrls.includes(file.url);
                              const isDeleting = storageDeletingUrl === file.url;
                              const isPdf = file.fileName.toLowerCase().endsWith(".pdf");

                              return (
                                <tr
                                  key={file.url}
                                  className={cn(
                                    "transition-colors hover:bg-zinc-50/80 dark:hover:bg-white/[0.02]",
                                    isSelected && "bg-cyan-50/40 dark:bg-cyan-950/20"
                                  )}
                                >
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStorageSelectedUrls((prev) =>
                                          prev.includes(file.url)
                                            ? prev.filter((u) => u !== file.url)
                                            : [...prev, file.url]
                                        );
                                      }}
                                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                    >
                                      {isSelected ? (
                                        <CheckSquare className="size-4 text-cyan-600" />
                                      ) : (
                                        <Square className="size-4" />
                                      )}
                                    </button>
                                  </td>

                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2 max-w-xs sm:max-w-md">
                                      <div className="size-7 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center shrink-0 text-zinc-500">
                                        {isPdf ? (
                                          <FileText className="size-4 text-red-500" />
                                        ) : (
                                          <FileImage className="size-4 text-blue-500" />
                                        )}
                                      </div>
                                      <div className="truncate">
                                        <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                          {file.fileName}
                                        </p>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                          {file.category.replace(/_/g, " ")}
                                        </span>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3 px-3">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-800 dark:text-zinc-200 text-xs font-semibold">
                                      <User className="size-3 text-zinc-400" />
                                      {file.userName}
                                    </span>
                                  </td>

                                  <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 text-xs whitespace-nowrap">
                                    {DateTime.fromISO(file.uploadedAtIso).toFormat("LLL dd, yyyy · hh:mm a")}
                                  </td>

                                  <td className="py-3 px-3 text-right font-mono text-zinc-600 dark:text-zinc-400 text-xs whitespace-nowrap">
                                    {file.sizeFormatted}
                                  </td>

                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1.5 justify-end">
                                      {file.size > 200 * 1024 && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => void compressSingleFile(file)}
                                          disabled={storageCompressingUrl === file.url || isDeleting || storageDeleting}
                                          className="h-7 px-2 text-[11px] gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 rounded-lg transition-colors font-semibold shadow-2xs"
                                          title="Optimize & compress document"
                                        >
                                          {storageCompressingUrl === file.url ? (
                                            <Loader2 className="size-3 animate-spin text-blue-600" />
                                          ) : (
                                            <Zap className="size-3 text-blue-500" />
                                          )}
                                          Compress
                                        </Button>
                                      )}
                                      <a
                                        href={file.viewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 font-semibold text-xs shadow-2xs transition-colors"
                                      >
                                        View
                                        <ExternalLink className="size-3 opacity-60" />
                                      </a>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => void deleteSingleFile(file)}
                                        disabled={isDeleting || storageDeleting || storageCompressingUrl === file.url}
                                        className="size-7 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                        title="Delete file permanently"
                                      >
                                        {isDeleting ? (
                                          <Loader2 className="size-3.5 animate-spin text-red-600" />
                                        ) : (
                                          <Trash2 className="size-3.5" />
                                        )}
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

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
                      <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-spin" />
                      <Loader2 className="size-5 text-cyan-500 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                        {downloadStatus || "Compiling Reports..."}
                      </h3>
                      {downloadCurrentDetail && (
                        <p className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold truncate max-w-xs mt-0.5">
                          {downloadCurrentDetail}
                        </p>
                      )}
                    </div>
                  </div>

                  {downloadTotalCount > 0 && (
                    <div className="space-y-2 mt-6">
                      <div className="flex justify-between text-xs font-mono text-zinc-500 font-semibold">
                        <span>Progress</span>
                        <span>
                          {downloadDoneCount} / {downloadTotalCount}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
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

        {/* DangerConfirmModal for Storage Deletions */}
        <DangerConfirmModal
          open={Boolean(storageConfirmModal)}
          onClose={() => setStorageConfirmModal(null)}
          onConfirm={async () => {
            if (storageConfirmModal) await storageConfirmModal.onConfirm();
          }}
          title={storageConfirmModal?.title ?? "Danger Zone"}
          subtitle={storageConfirmModal?.subtitle}
          description={<p className="text-xs text-zinc-300">{storageConfirmModal?.description}</p>}
          confirmText={storageConfirmModal?.confirmText ?? "Confirm"}
          cancelText="Cancel"
          loading={storageDeleting || Boolean(storageDeletingUrl)}
          variant="danger"
        />
      </div>
    </div>
  );
}
