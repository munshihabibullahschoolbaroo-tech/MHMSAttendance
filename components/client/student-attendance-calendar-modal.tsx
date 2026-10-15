"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  TrendingUp,
  Phone,
  GraduationCap,
  Download,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { downloadStudentMonthlyAttendancePdf } from "@/lib/school/attendance-pdf";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type Student = {
  id: string;
  name: string;
  rollNo: number;
  parentPhone?: string;
};

type Props = {
  student: Student | null;
  classId: string;
  sectionId: string;
  isOpen: boolean;
  onClose: () => void;
};

export function StudentAttendanceCalendarModal({
  student,
  classId,
  sectionId,
  isOpen,
  onClose,
}: Props) {
  const [mounted, setMounted] = React.useState(false);
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
  const [loading, setLoading] = React.useState(false);
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const [stats, setStats] = React.useState<{
    totalMarked: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    percent: number;
    history: Record<string, "present" | "absent" | "late">;
  }>({
    totalMarked: 0,
    presentDays: 0,
    absentDays: 0,
    lateDays: 0,
    percent: 100,
    history: {},
  });

  const handleDownloadPdf = async () => {
    if (!student) return;
    try {
      setDownloadingPdf(true);
      await downloadStudentMonthlyAttendancePdf({
        student: {
          rollNo: student.rollNo,
          name: student.name,
          parentPhone: student.parentPhone,
        },
        classId,
        sectionId,
        monthStr,
        stats,
      });
      toast.success("Attendance PDF downloaded successfully");
    } catch (err) {
      console.error("PDF download failed:", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const todayStr = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const monthStr = React.useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [currentDate]);

  const monthLabel = React.useMemo(() => {
    return currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  }, [currentDate]);

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Lock background body scroll when open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Fetch monthly records whenever student, classId, sectionId, or month changes
  React.useEffect(() => {
    if (!isOpen || !student) return;

    let cancelled = false;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();

        const res = await fetch(
          `/api/school/students/attendance?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}&month=${monthStr}&studentId=${encodeURIComponent(student.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error("Failed to load attendance history");
        const json = await res.json();
        if (cancelled) return;

        if (json.studentStats) {
          setStats(json.studentStats);
        } else {
          setStats({
            totalMarked: 0,
            presentDays: 0,
            absentDays: 0,
            lateDays: 0,
            percent: 100,
            history: {},
          });
        }
      } catch (err) {
        console.error("Error loading student monthly attendance:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [isOpen, student, classId, sectionId, monthStr]);

  if (!mounted) return null;

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const handleTodayMonth = () => {
    setCurrentDate(new Date());
  };

  const dayCells = [];
  if (student) {
    // Empty leading cells
    for (let i = 0; i < firstDayIndex; i++) {
      dayCells.push({ empty: true, key: `empty-${i}` });
    }
    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${monthStr}-${String(d).padStart(2, "0")}`;
      const dayDate = new Date(year, month, d);
      const isSunday = dayDate.getDay() === 0;
      const isToday = dayStr === todayStr;
      const isFuture = dayStr > todayStr;
      const status = stats.history[dayStr] || null;
      dayCells.push({
        empty: false,
        dayNum: d,
        dayStr,
        isSunday,
        isToday,
        isFuture,
        status,
        key: `day-${d}`,
      });
    }
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && student && (
        <div className="fixed inset-0 z-[10020] flex flex-col justify-end md:justify-center md:items-center p-0 md:p-6">
          {/* Background backdrop click listener */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal / Bottom Sheet Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="relative w-full max-w-5xl max-h-[92dvh] flex flex-col rounded-t-[28px] md:rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl border border-zinc-200/90 dark:border-white/10 overflow-hidden z-10"
          >
            {/* Top Right Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/20 dark:hover:text-white transition-colors cursor-pointer border border-zinc-200 dark:border-white/10 shadow-xs"
              title="Close"
            >
              <X className="size-4" />
            </button>

            {/* Mobile Drag Handle */}
            <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0 bg-white dark:bg-zinc-900/95">
              <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </div>

            {/* Modal Header */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200/90 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 px-4 sm:px-6 py-3 sm:py-4 gap-3 shrink-0 pr-14">
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                <span className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 font-extrabold font-mono text-sm sm:text-base border border-blue-500/20 shadow-xs">
                  #{student.rollNo}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white truncate">
                      {student.name}
                    </h2>
                  </div>
                  <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                    <span>{classId} ({sectionId})</span>
                    <span>•</span>
                    <span>Monthly Attendance</span>
                  </p>
                </div>
              </div>

              {/* Action Controls & Month Switcher */}
              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                {/* Month Switcher */}
                <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-white/10 dark:bg-zinc-800">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 min-w-[105px] sm:min-w-[130px] justify-center">
                    <CalendarIcon className="size-3.5 text-blue-500 hidden sm:inline" />
                    <span>{monthLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer disabled:opacity-50"
                    title="Download Monthly Attendance PDF"
                  >
                    {downloadingPdf ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    <span className="hidden sm:inline">Download PDF</span>
                  </button>
                </div>
              </div>
            </header>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 sm:p-4 dark:border-white/10 dark:bg-zinc-900/40">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Marked Days
                </span>
                <span className="p-1.5 rounded-lg bg-zinc-200/60 dark:bg-white/5 text-zinc-500">
                  <CalendarIcon className="size-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white">
                {stats.totalMarked}
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">
                School days recorded in {monthLabel}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Present Days
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {stats.presentDays}
              </p>
              <p className="mt-1 text-[11px] text-emerald-600/70 dark:text-emerald-400/70">
                Attended roll call on schedule
              </p>
            </div>

            <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Absent Days
                </span>
                <span className="p-1.5 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
                  <XCircle className="size-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400">
                {stats.absentDays}
              </p>
              <p className="mt-1 text-[11px] text-red-600/70 dark:text-red-400/70">
                {stats.lateDays > 0 ? `Plus ${stats.lateDays} day(s) on approved leave` : "Absences recorded"}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.04] p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Attendance Rate
                </span>
                <span className="p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <TrendingUp className="size-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
                {stats.percent}%
              </p>
              <p className="mt-1 text-[11px] text-blue-600/70 dark:text-blue-400/70">
                {stats.percent >= 75 ? "Good standing (above 75%)" : "Attention: below standard"}
              </p>
            </div>
          </div>

          {/* Calendar Grid Container */}
          <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-5 dark:border-white/10 dark:bg-zinc-900/60 shadow-xs relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-black/80 backdrop-blur-xs rounded-2xl gap-2">
                <Loader2 className="size-8 animate-spin text-blue-500" />
                <span className="text-xs font-semibold text-zinc-500">Loading attendance data…</span>
              </div>
            )}

            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2.5 text-center mb-2.5">
              <div className="text-[11px] sm:text-xs font-bold text-red-500 py-1 rounded-lg bg-red-500/5">
                <span className="sm:hidden">Sun</span>
                <span className="hidden sm:inline">Sunday</span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 py-1">
                <span className="sm:hidden">Mon</span>
                <span className="hidden sm:inline">Monday</span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 py-1">
                <span className="sm:hidden">Tue</span>
                <span className="hidden sm:inline">Tuesday</span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 py-1">
                <span className="sm:hidden">Wed</span>
                <span className="hidden sm:inline">Wednesday</span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 py-1">
                <span className="sm:hidden">Thu</span>
                <span className="hidden sm:inline">Thursday</span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 py-1">
                <span className="sm:hidden">Fri</span>
                <span className="hidden sm:inline">Friday</span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 py-1">
                <span className="sm:hidden">Sat</span>
                <span className="hidden sm:inline">Saturday</span>
              </div>
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {dayCells.map((cell) => {
                if (cell.empty) {
                  return (
                    <div
                      key={cell.key}
                      className="min-h-[75px] sm:min-h-[95px] md:min-h-[105px] rounded-xl bg-zinc-50/50 dark:bg-white/[0.01] border border-dashed border-zinc-200/40 dark:border-white/5"
                    />
                  );
                }

                const { dayNum, isSunday, isToday, isFuture, status } = cell;

                return (
                  <div
                    key={cell.key}
                    className={cn(
                      "min-h-[75px] sm:min-h-[95px] md:min-h-[105px] rounded-xl p-1.5 sm:p-2.5 border flex flex-col justify-between transition-all relative overflow-hidden",
                      status === "present"
                        ? "border-emerald-500/40 bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]"
                        : status === "absent"
                        ? "border-red-500/40 bg-red-500/[0.06] dark:bg-red-500/[0.08]"
                        : status === "late"
                        ? "border-amber-500/40 bg-amber-500/[0.06] dark:bg-amber-500/[0.08]"
                        : isFuture
                        ? "border-zinc-200/40 bg-zinc-100/30 dark:border-white/5 dark:bg-white/[0.01] opacity-45"
                        : isSunday
                        ? "border-zinc-200/60 bg-zinc-100/50 dark:border-white/5 dark:bg-white/[0.02]"
                        : "border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-900/40",
                      isToday && "ring-2 ring-blue-500 shadow-sm"
                    )}
                  >
                    {/* Day Number Row */}
                    <div className="flex items-center justify-between w-full min-w-0">
                      <span
                        className={cn(
                          "size-5 sm:size-6 rounded-md flex items-center justify-center text-xs sm:text-sm font-bold font-mono shrink-0",
                          isToday
                            ? "bg-blue-600 text-white font-extrabold shadow-xs"
                            : isSunday
                            ? "text-red-500 font-extrabold"
                            : isFuture
                            ? "text-zinc-400 dark:text-zinc-600"
                            : "text-zinc-800 dark:text-zinc-200"
                        )}
                      >
                        {dayNum}
                      </span>
                      {isToday && (
                        <>
                          <span className="hidden sm:inline-block text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1 py-0.2 rounded shrink-0">
                            Today
                          </span>
                          <span className="sm:hidden size-1.5 rounded-full bg-blue-500 shrink-0" title="Today" />
                        </>
                      )}
                    </div>

                    {/* Status Pill in Center/Bottom */}
                    <div className="flex justify-center items-center w-full my-auto py-0.5">
                      {status === "present" ? (
                        <div className="flex items-center justify-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md bg-emerald-600 text-white text-[10px] sm:text-xs font-bold shadow-xs">
                          <CheckCircle2 className="size-3 sm:size-3.5 shrink-0" />
                          <span className="hidden sm:inline">Present</span>
                        </div>
                      ) : status === "absent" ? (
                        <div className="flex items-center justify-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md bg-red-600 text-white text-[10px] sm:text-xs font-bold shadow-xs">
                          <XCircle className="size-3 sm:size-3.5 shrink-0" />
                          <span className="hidden sm:inline">Absent</span>
                        </div>
                      ) : status === "late" ? (
                        <div className="flex items-center justify-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md bg-amber-600 text-white text-[10px] sm:text-xs font-bold shadow-xs">
                          <Clock className="size-3 sm:size-3.5 shrink-0" />
                          <span className="hidden sm:inline">Leave</span>
                        </div>
                      ) : isFuture ? (
                        <span className="text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-600 font-medium italic">
                          Future
                        </span>
                      ) : isSunday ? (
                        <span className="text-[9px] sm:text-[10px] text-zinc-400 font-semibold px-1 py-0.5 rounded bg-zinc-200/50 dark:bg-white/5 truncate">
                          <span className="sm:hidden">Hol</span>
                          <span className="hidden sm:inline">Holiday</span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300 dark:text-zinc-600">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-1 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-emerald-600" />
              <strong>Present</strong> (Recorded on time)
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-600" />
              <strong>Absent</strong> (Missed roll call)
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-amber-600" />
              <strong>Leave</strong> (Authorized Leave)
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <strong>Weekend / Holiday</strong>
            </span>
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="size-2.5 rounded-full border border-dashed border-zinc-400" />
              <strong>Future / Unmarked</strong>
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  )}
</AnimatePresence>,
document.body
  );
}
