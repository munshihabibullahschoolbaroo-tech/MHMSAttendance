"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  Loader2,
  Award,
  UserPlus,
  Trash2,
  X,
  Plus,
  RotateCcw,
  Calendar,
  AlertTriangle,
  Download,
  UserCheck,
  UserCog,
  ArrowRightLeft,
  SlidersHorizontal,
  ShieldAlert,
  Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppSelect } from "@/components/ui/app-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { StudentAttendanceCalendarModal } from "@/components/client/student-attendance-calendar-modal";
import { downloadStudentDailyAttendancePdf } from "@/lib/school/attendance-pdf";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { Separator } from "@/components/ui/separator";

type Student = {
  id: string;
  rollNo: number;
  name: string;
  parentPhone?: string;
};

type RecordStatus = "present" | "absent" | "late";

type SubstituteDelegation = {
  docId?: string;
  classId: string;
  sectionId: string;
  permanentTeacherId: string;
  permanentTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  reason: string;
  startDate?: string;
  endDate?: string | null;
  active: boolean;
};

type FacultyMember = {
  id: string;
  name: string;
  email: string;
  employeeId?: string;
  designation?: string;
  wingId?: string;
};

type Props = {
  classId: string;
  sectionId: string;
  wingId?: string;
  dateStr?: string; // YYYY-MM-DD
  readOnly?: boolean;
  isAdmin?: boolean;
  embedded?: boolean;
  onSubmittedChange?: (submitted: boolean) => void;
  onSwitchConsumed?: (assignedClass?: string | null, assignedSection?: string | null) => void;
  onRequestSwitch?: (classId: string, sectionId: string) => void;
  onBackToMyClass?: () => void;
};

// Fast in-memory cache for class rosters and attendance
const rosterCache = new Map<string, Student[]>();
const attendanceRecordCache = new Map<string, { map: Record<string, RecordStatus>; saved: boolean }>();

export function StudentAttendanceBoard({
  classId,
  sectionId,
  wingId = "higher",
  dateStr,
  readOnly = false,
  isAdmin = false,
  embedded = false,
  onSubmittedChange,
  onSwitchConsumed,
  onRequestSwitch,
  onBackToMyClass,
}: Props) {
  const [students, setStudents] = React.useState<Student[]>([]);
  const [statusMap, setStatusMap] = React.useState<Record<string, RecordStatus>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [alreadySaved, setAlreadySaved] = React.useState(false);
  const [isLocked, setIsLocked] = React.useState(false);
  const [lockMessage, setLockMessage] = React.useState("");

  React.useEffect(() => {
    onSubmittedChange?.(alreadySaved);
  }, [alreadySaved, onSubmittedChange]);

  // Substitute teacher delegation state
  const [delegation, setDelegation] = React.useState<SubstituteDelegation | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = React.useState(false);
  const [facultyList, setFacultyList] = React.useState<FacultyMember[]>([]);
  const [loadingFaculty, setLoadingFaculty] = React.useState(false);
  const [submittingDelegation, setSubmittingDelegation] = React.useState(false);
  const [revokingDelegation, setRevokingDelegation] = React.useState(false);
  const [revokeSubConfirmOpen, setRevokeSubConfirmOpen] = React.useState(false);

  // Delete student danger modal state
  const [deleteStudentTarget, setDeleteStudentTarget] = React.useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = React.useState(false);

  // Form states for substitute modal
  const [substituteTeacherId, setSubstituteTeacherId] = React.useState("");
  const [delegationReason, setDelegationReason] = React.useState("On Leave / Proxy Attendance");
  const [delegationStartDate, setDelegationStartDate] = React.useState("");
  const [delegationEndDate, setDelegationEndDate] = React.useState("");

  // Add student state
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [newRollNo, setNewRollNo] = React.useState<number>(1);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [isSubmittingStudent, setIsSubmittingStudent] = React.useState(false);
  const [selectedStudentForCalendar, setSelectedStudentForCalendar] = React.useState<Student | null>(null);
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleDownloadPdf = async () => {
    if (students.length === 0) {
      toast.warning("No students in class roster to export");
      return;
    }
    setDownloadingPdf(true);
    try {
      await downloadStudentDailyAttendancePdf({
        classId,
        sectionId,
        dateStr: todayStr,
        students,
        statusMap,
      });
      toast.success(`Downloaded ${classId} (${sectionId}) daily attendance PDF!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate attendance PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const realTodayStr = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const todayStr = React.useMemo(() => {
    if (dateStr) return dateStr;
    return realTodayStr;
  }, [dateStr, realTodayStr]);

  const isFuture = todayStr > realTodayStr;
  const isPast = todayStr < realTodayStr;
  const effectiveReadOnly = readOnly || isPast;

  // Load active substitute delegation for this class
  const loadDelegation = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch(
        `/api/school/students/substitute?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = (await res.json()) as { active?: boolean; delegation?: SubstituteDelegation };
        if (json.active && json.delegation) {
          setDelegation(json.delegation);
        } else {
          setDelegation(null);
        }
      }
    } catch {
      // ignore
    }
  }, [classId, sectionId]);

  React.useEffect(() => {
    void loadDelegation();
  }, [loadDelegation]);

  const currentUid = getFirebaseAuth().currentUser?.uid;
  const isSubstituteForThisClass = Boolean(delegation?.active && delegation.substituteTeacherId === currentUid);

  const openSubstituteModal = async () => {
    setIsSubModalOpen(true);
    setDelegationStartDate(todayStr);
    setLoadingFaculty(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const [teachersRes, coveragesRes] = await Promise.all([
        fetch("/api/school/teachers", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/school/students/substitute?mine=true", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (teachersRes.ok) {
        const json = (await teachersRes.json()) as { teachers?: FacultyMember[] };
        const teachers: FacultyMember[] = json.teachers || [];

        // Exclude current teacher AND any teacher who has delegated their class to current teacher (prevents circular loops)
        const blockedTeacherIds = new Set<string>();
        blockedTeacherIds.add(u.uid);

        if (coveragesRes.ok) {
          const covJson = await coveragesRes.json();
          if (Array.isArray(covJson.delegations)) {
            covJson.delegations.forEach((d: { permanentTeacherId?: string }) => {
              if (d.permanentTeacherId) blockedTeacherIds.add(d.permanentTeacherId);
            });
          }
        }

        const filtered = teachers.filter((t) => !blockedTeacherIds.has(t.id));
        setFacultyList(filtered);
        if (filtered.length > 0) {
          if (!substituteTeacherId || blockedTeacherIds.has(substituteTeacherId)) {
            setSubstituteTeacherId(filtered[0]!.id);
          }
        }
      }
    } catch {
      toast.error("Failed to load teachers list");
    } finally {
      setLoadingFaculty(false);
    }
  };

  const handleAssignSubstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!substituteTeacherId) {
      toast.error("Please select a colleague to delegate as substitute");
      return;
    }
    setSubmittingDelegation(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/students/substitute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classId,
          sectionId,
          substituteTeacherId,
          reason: delegationReason,
          startDate: delegationStartDate || todayStr,
          endDate: delegationEndDate || null,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        delegation?: SubstituteDelegation;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to assign substitute");

      toast.success(json.message ?? "Substitute teacher assigned successfully!");
      if (json.delegation) {
        setDelegation(json.delegation);
      }
      setIsSubModalOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("substitute-delegation-changed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error assigning substitute teacher");
    } finally {
      setSubmittingDelegation(false);
    }
  };

  const handleRevokeSubstitute = async () => {
    setRevokingDelegation(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch(
        `/api/school/students/substitute?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to revoke substitute");

      toast.success(json.message ?? "Substitute delegation revoked");
      setDelegation(null);
      setRevokeSubConfirmOpen(false);
      setIsSubModalOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("substitute-delegation-changed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error revoking substitute");
    } finally {
      setRevokingDelegation(false);
    }
  };

  // Load students and existing attendance with instant cache paint + parallel fetch
  React.useEffect(() => {
    let cancelled = false;
    const cacheKey = `${wingId}_${classId}_${sectionId}`;
    const attCacheKey = `${todayStr}_${classId}_${sectionId}`;

    // 1. Instant Cache Paint: if already in memory, display immediately with 0 delay!
    const cachedRoster = rosterCache.get(cacheKey);
    const cachedAtt = attendanceRecordCache.get(attCacheKey);

    if (cachedRoster && cachedRoster.length > 0) {
      setStudents(cachedRoster);
      if (cachedAtt) {
        setStatusMap(cachedAtt.map);
        setAlreadySaved(cachedAtt.saved);
      } else {
        setStatusMap({});
        setAlreadySaved(false);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }

    const load = async () => {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();

        setIsLocked(false);
        setLockMessage("");

        // 2. Run both Students and Attendance queries in PARALLEL
        const [resSt, resAtt] = await Promise.all([
          fetch(
            `/api/school/students?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}&wingId=${wingId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
          fetch(
            `/api/school/students/attendance?date=${todayStr}&classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).catch((attErr) => {
            console.warn("[StudentAttendanceBoard] attendance fetch error:", attErr);
            return null;
          }),
        ]);

        const dataSt = (await resSt.json().catch(() => ({}))) as { students?: Student[]; error?: string };
        if (!resSt.ok) {
          if (resSt.status === 403 && !isAdmin) {
            if (!cancelled) {
              setIsLocked(true);
              setLockMessage(dataSt.error || "This class is locked. You must request a class switch to access this roster.");
              setStudents([]);
            }
            return;
          }
          throw new Error(dataSt.error || "Could not retrieve class roster");
        }
        const roster = dataSt.students ?? [];
        if (cancelled) return;
        setStudents(roster);
        rosterCache.set(cacheKey, roster);

        // Process Attendance
        if (resAtt && resAtt.ok) {
          const dataAtt = (await resAtt.json().catch(() => ({}))) as {
            found?: boolean;
            attendance?: { records?: Array<{ studentId: string; status: RecordStatus }> };
          };

          if (dataAtt.found && dataAtt.attendance?.records) {
            const map: Record<string, RecordStatus> = {};
            dataAtt.attendance.records.forEach((r) => {
              map[r.studentId] = r.status;
            });
            if (!cancelled) {
              setStatusMap(map);
              setAlreadySaved(true);
              attendanceRecordCache.set(attCacheKey, { map, saved: true });
            }
            return;
          }
        }

        // If no prior attendance was recorded for this date, keep all students unmarked
        const map: Record<string, RecordStatus> = {};
        if (!cancelled) {
          setStatusMap(map);
          setAlreadySaved(false);
          attendanceRecordCache.set(attCacheKey, { map, saved: false });
        }
      } catch (err) {
        console.error("[StudentAttendanceBoard] load error:", err);
        const msg = err instanceof Error ? err.message : "Failed to load students roster";
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [classId, sectionId, wingId, todayStr, isAdmin]);

  const openAddModal = () => {
    if (effectiveReadOnly) return;
    const nextRoll = students.length > 0 ? Math.max(...students.map((s) => Number(s.rollNo) || 0)) + 1 : 1;
    setNewRollNo(nextRoll);
    setNewName("");
    setNewPhone("");
    setIsAddModalOpen(true);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveReadOnly) return;
    if (!newName.trim()) {
      toast.error("Please enter the student's name");
      return;
    }
    setIsSubmittingStudent(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/students", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wingId,
          classId,
          sectionId,
          rollNo: Number(newRollNo),
          name: newName.trim(),
          parentPhone: newPhone.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add student");

      const created: Student = data.student ?? {
        id: `st_${Date.now()}`,
        rollNo: Number(newRollNo),
        name: newName.trim(),
        parentPhone: newPhone.trim(),
      };

      const cacheKey = `${wingId}_${classId}_${sectionId}`;
      setStudents((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0));
        rosterCache.set(cacheKey, next);
        return next;
      });
      setStatusMap((prev) => ({ ...prev, [created.id]: "present" }));
      setIsAddModalOpen(false);
      toast.success(`${created.name} added to ${classId} roster!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error adding student");
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!deleteStudentTarget || effectiveReadOnly) return;
    const studentId = deleteStudentTarget.id;
    const studentName = deleteStudentTarget.name;
    setDeletingStudent(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch(`/api/school/students?id=${encodeURIComponent(studentId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete student");
      }

      const cacheKey = `${wingId}_${classId}_${sectionId}`;
      setStudents((prev) => {
        const next = prev.filter((s) => s.id !== studentId);
        rosterCache.set(cacheKey, next);
        return next;
      });
      setStatusMap((prev) => {
        const copy = { ...prev };
        delete copy[studentId];
        return copy;
      });
      toast.success(`Removed ${studentName} from roster`);
      setDeleteStudentTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error deleting student");
    } finally {
      setDeletingStudent(false);
    }
  };

  const markAll = (status: RecordStatus) => {
    if (effectiveReadOnly) return;
    const next: Record<string, RecordStatus> = {};
    students.forEach((s) => {
      next[s.id] = status;
    });
    setStatusMap(next);
  };

  const clearAll = () => {
    if (effectiveReadOnly) return;
    setStatusMap({});
  };

  const setStudentStatus = (studentId: string, status: RecordStatus) => {
    if (effectiveReadOnly) return;
    setStatusMap((prev) => {
      // Toggle off if already selected
      if (prev[studentId] === status) {
        const copy = { ...prev };
        delete copy[studentId];
        return copy;
      }
      return { ...prev, [studentId]: status };
    });
  };

  const saveAttendance = async () => {
    if (effectiveReadOnly) {
      toast.error("Past or read-only attendance records cannot be modified.");
      return;
    }
    const unmarked = students.filter((s) => !statusMap[s.id]);
    if (unmarked.length > 0) {
      toast.warning(
        `Please mark attendance for all students before saving (${unmarked.length} unmarked).`
      );
      return;
    }

    setSaving(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const records = students.map((s) => ({
        studentId: s.id,
        studentName: s.name,
        rollNo: s.rollNo,
        status: statusMap[s.id] || "present",
      }));

      const res = await fetch("/api/school/students/attendance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: todayStr,
          wingId,
          classId,
          sectionId,
          records,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save attendance");

      setAlreadySaved(true);
      const attCacheKey = `${todayStr}_${classId}_${sectionId}`;
      attendanceRecordCache.set(attCacheKey, { map: statusMap, saved: true });
      toast.success(`Attendance saved for ${classId} (${sectionId})!`);
      if (data.consumedSwitch) {
        onSwitchConsumed?.(data.assignedClass, data.assignedSection);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error saving attendance");
    } finally {
      setSaving(false);
    }
  };

  const presentCount = students.filter((s) => statusMap[s.id] === "present").length;
  const absentCount = students.filter((s) => statusMap[s.id] === "absent").length;
  const lateCount = students.filter((s) => statusMap[s.id] === "late").length;
  const unmarkedCount = students.filter((s) => !statusMap[s.id]).length;
  const total = students.length;

  if (isLocked) {
    return (
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.04] p-8 text-center dark:border-amber-500/20 shadow-sm space-y-4">
        <div className="inline-flex p-4 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="size-8" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {classId} ({sectionId}) is Locked
          </h3>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
            {lockMessage}
          </p>
        </div>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
          {onRequestSwitch && (
            <Button
              type="button"
              onClick={() => onRequestSwitch(classId, sectionId)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl h-9 gap-1.5 shadow-sm cursor-pointer"
            >
              <Shuffle className="size-3.5" />
              Request Class Switch to {classId}
            </Button>
          )}
          {onBackToMyClass && (
            <Button
              type="button"
              variant="outline"
              onClick={onBackToMyClass}
              className="text-xs font-bold rounded-xl h-9 border-zinc-200 dark:border-white/10"
            >
              ← Back to My Assigned Class
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isFuture) {
    if (embedded) {
      return (
        <div className="w-full p-6 text-center space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.03]">
          <div className="inline-flex p-3 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Cannot Access Future Date
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Attendance for <strong>{todayStr}</strong> cannot be accessed because it is in the future.
          </p>
        </div>
      );
    }
    return (
      <Card className="w-full border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.03] shadow-sm">
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center max-w-md mx-auto space-y-3">
          <div className="p-3 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Cannot Access Future Date
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Attendance for <strong className="text-zinc-800 dark:text-zinc-200">{todayStr}</strong> cannot be accessed, marked, or modified because it is in the future.
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
              Today is {realTodayStr}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    if (embedded) {
      return (
        <div className="flex h-36 flex-col items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs">Loading class roster…</span>
        </div>
      );
    }
    return (
      <Card className="w-full border-zinc-200 dark:border-white/10">
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs">Loading class roster…</span>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className={cn(embedded ? "w-full space-y-3" : "hidden")}>
        {/* Embedded View: Quick Status Chips (No duplicate Class header, no nested Card container) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isPast && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-white/10 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/10">
              Past Record (View Only)
            </span>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Present: {presentCount}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-red-700 dark:text-red-400 font-semibold border border-red-500/20">
            <XCircle className="h-3.5 w-3.5" />
            <span>Absent: {absentCount}</span>
          </div>
          {lateCount > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/20">
              <Clock className="h-3.5 w-3.5" />
              <span>Leave: {lateCount}</span>
            </div>
          )}
          {unmarkedCount > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-zinc-500/10 px-2.5 py-1 text-zinc-600 dark:text-zinc-400 font-semibold border border-zinc-500/20">
              <span>Unmarked: {unmarkedCount}</span>
            </div>
          )}
        </div>
      </div>

      <Card className={cn("w-full shadow-sm", embedded ? "border-0 shadow-none bg-transparent" : "border-zinc-200 dark:border-white/10")}>
        {!embedded && (
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <CardTitle className="text-lg md:text-xl font-bold">
                  {classId} — {sectionId}
                </CardTitle>
                {alreadySaved ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" />
                    Submitted
                  </span>
                ) : isPast ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-500/10 dark:text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    <AlertTriangle className="h-3 w-3" />
                    No Record
                  </span>
                ) : null}
                {isPast && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-white/10 px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-white/10">
                    Past Record (View Only)
                  </span>
                )}
              </div>
              <CardDescription className="text-xs mt-1">
                Student Daily Roll Call for <strong className="text-zinc-700 dark:text-zinc-300">{todayStr}</strong>
              </CardDescription>
            </div>

            {/* Counters & Download Button */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Present: {presentCount}</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-red-700 dark:text-red-400 font-semibold border border-red-500/20">
                <XCircle className="h-3.5 w-3.5" />
                <span>Absent: {absentCount}</span>
              </div>
              {lateCount > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/20">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Leave: {lateCount}</span>
                </div>
              )}
              {unmarkedCount > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-zinc-500/10 px-2.5 py-1 text-zinc-600 dark:text-zinc-400 font-semibold border border-zinc-500/20">
                  <span>Unmarked: {unmarkedCount}</span>
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={downloadingPdf || students.length === 0}
                onClick={() => void handleDownloadPdf()}
                className="hidden md:inline-flex h-7 sm:h-8 text-xs font-semibold gap-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer shadow-2xs ml-1"
                title="Download printable daily student attendance PDF"
              >
                {downloadingPdf ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Download className="size-3 text-blue-500" />
                )}
                <span>Download Daily PDF</span>
              </Button>
            </div>
          </CardHeader>
        )}

        <CardContent className={cn("space-y-4", embedded && "p-0 pt-2")}>
        {/* Active Substitute Teacher Status Banner (Unified cleanly at TOP) */}
        {delegation?.active && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0">
                <UserCheck className="size-3.5" />
              </span>
              <div className="min-w-0 text-xs truncate">
                {isSubstituteForThisClass ? (
                  <>
                    <span className="text-zinc-500 dark:text-zinc-400">Substitute Duty: </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      Covering for {delegation.permanentTeacherName}
                    </span>
                    <span className="text-zinc-400 ml-1.5 hidden sm:inline text-[11px]">
                      • {delegation.reason}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500 dark:text-zinc-400">Substitute Authorized: </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {delegation.substituteTeacherName}
                    </span>
                    <span className="text-zinc-400 ml-1.5 hidden sm:inline text-[11px]">
                      • {delegation.reason} ({delegation.startDate})
                    </span>
                  </>
                )}
              </div>
            </div>
            {!isSubstituteForThisClass && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void openSubstituteModal()}
                className="h-6 px-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 border-blue-400/30 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer shrink-0"
              >
                Manage
              </Button>
            )}
          </div>
        )}

        {effectiveReadOnly ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/10 text-xs">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
              <span className="font-bold text-zinc-800 dark:text-zinc-100">
                {isPast ? `Past Record (${todayStr})` : "View-Only"}:
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {isPast
                  ? alreadySaved
                    ? "Historical attendance is locked in view-only mode. Only today's attendance can be marked or edited."
                    : "No attendance was recorded for this date. All students are unmarked because roll call was not submitted."
                  : "Editing is disabled for this record."}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 self-start sm:self-auto text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-200/80 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">
              Read-Only
            </span>
          </div>
        ) : null}

        {/* Mobile Action Bar: Compact Tools Button + Primary Update & Save Button */}
        {!effectiveReadOnly && (
          <div className="space-y-3 md:hidden">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMobileToolsOpen(true)}
                className="h-10 px-3.5 gap-1.5 border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-white/5 font-semibold text-xs shrink-0 cursor-pointer"
                title="Class Tools & Actions"
              >
                <SlidersHorizontal className="size-4 text-blue-500" />
                <span>Tools</span>
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void saveAttendance()}
                className="flex-1 h-10 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 active:scale-[0.99] cursor-pointer"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>{alreadySaved ? "Update & Save" : "Save Attendance"}</span>
              </Button>
            </div>
            <Separator />
          </div>
        )}

        {/* Desktop Action Bar: Full Horizontal Toolbar */}
        {!effectiveReadOnly && (
          <div className="hidden md:block space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => markAll("present")}
                className="h-8 text-xs gap-1.5 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                Mark All Present
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => markAll("absent")}
                className="h-8 text-xs gap-1.5 hover:border-red-500/50 hover:text-red-600 dark:hover:text-red-400"
              >
                <XCircle className="size-3.5 text-red-500" />
                Mark All Absent
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearAll}
                className="h-8 text-xs gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <RotateCcw className="size-3.5" />
                Clear All
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isSubstituteForThisClass && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void openSubstituteModal()}
                  className={cn(
                    "h-8 gap-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                    delegation?.active
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                      : "border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-200 hover:border-blue-500"
                  )}
                  title="Delegate substitute teacher when on leave"
                >
                  <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                  <span>
                    {delegation?.active
                      ? `Substitute: ${delegation.substituteTeacherName.split(" ")[0]}`
                      : "Substitute Teacher"}
                  </span>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openAddModal}
                className="h-8 gap-1.5 border-dashed border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 text-xs font-semibold"
              >
                <UserPlus className="h-3.5 w-3.5 text-blue-500" />
                Add Student
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void saveAttendance()}
                className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {alreadySaved ? "Update & Save" : "Save Attendance"}
              </Button>
            </div>
          </div>
          <Separator />
        </div>
      )}



        {/* Student list */}
        <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
          {students.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              <p>No students enrolled in this class yet.</p>
              {!effectiveReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openAddModal}
                  className="mt-3 text-xs gap-1.5 text-blue-600 border-blue-500/30"
                >
                  <UserPlus className="size-3.5" /> Add First Student
                </Button>
              )}
            </div>
          ) : (
            students.map((student) => {
              const currentStatus = statusMap[student.id]; // undefined if unmarked
              return (
                <div key={student.id}>
                  {/* MOBILE VIEW: High-Touch Card (md:hidden) */}
                  <div
                    className={cn(
                      "flex flex-col gap-2.5 p-3.5 rounded-2xl border transition-all md:hidden",
                      currentStatus === "present"
                        ? "border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.04]"
                        : currentStatus === "absent"
                        ? "border-red-500/30 bg-red-500/[0.04] dark:bg-red-500/[0.04]"
                        : currentStatus === "late"
                        ? "border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-500/[0.04]"
                        : "border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.02]"
                    )}
                  >
                    {/* Top Row: Roll No, Name, Status Pill & Quick Actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono border",
                            currentStatus === "present"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : currentStatus === "absent"
                              ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                              : currentStatus === "late"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              : "bg-zinc-200/60 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 border-transparent"
                          )}
                        >
                          {student.rollNo}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                            {student.name}
                          </p>
                          {student.parentPhone && (
                            <p className="text-[10px] text-zinc-500 font-mono">
                              Phone: {student.parentPhone}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {currentStatus === "present" ? (
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Present
                          </span>
                        ) : currentStatus === "absent" ? (
                          <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                            Absent
                          </span>
                        ) : currentStatus === "late" ? (
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            Leave
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                            Unmarked
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedStudentForCalendar(student)}
                          title={`View ${student.name}'s calendar`}
                          className="size-7 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 flex items-center justify-center cursor-pointer hover:bg-blue-100"
                        >
                          <Calendar className="size-3.5" />
                        </button>
                        {!effectiveReadOnly && (
                          <button
                            type="button"
                            title={`Remove ${student.name}`}
                            onClick={() => setDeleteStudentTarget(student)}
                            className="size-7 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: 3 Large Attendance Buttons (Present, Absent, Leave) */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 dark:border-white/5">
                      <button
                        type="button"
                        disabled={effectiveReadOnly}
                        onClick={() => setStudentStatus(student.id, "present")}
                        className={cn(
                          "h-9 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border",
                          currentStatus === "present"
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30"
                            : "bg-zinc-50 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:bg-emerald-50 hover:text-emerald-600"
                        )}
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>Present</span>
                      </button>

                      <button
                        type="button"
                        disabled={effectiveReadOnly}
                        onClick={() => setStudentStatus(student.id, "absent")}
                        className={cn(
                          "h-9 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border",
                          currentStatus === "absent"
                            ? "bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30"
                            : "bg-zinc-50 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:bg-red-50 hover:text-red-600"
                        )}
                      >
                        <XCircle className="size-3.5" />
                        <span>Absent</span>
                      </button>

                      <button
                        type="button"
                        disabled={effectiveReadOnly}
                        onClick={() => setStudentStatus(student.id, "late")}
                        className={cn(
                          "h-9 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border",
                          currentStatus === "late"
                            ? "bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-500/30"
                            : "bg-zinc-50 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:bg-amber-50 hover:text-amber-600"
                        )}
                      >
                        <Clock className="size-3.5" />
                        <span>Leave</span>
                      </button>
                    </div>
                  </div>

                  {/* DESKTOP VIEW: Compact Row (hidden md:flex) */}
                  <div
                    className={cn(
                      "hidden md:flex items-center justify-between py-2 px-3 gap-3 rounded-xl border transition-all duration-150",
                      currentStatus === "present"
                        ? "border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.04]"
                        : currentStatus === "absent"
                        ? "border-red-500/25 bg-red-500/[0.04] dark:bg-red-500/[0.04]"
                        : currentStatus === "late"
                        ? "border-amber-500/25 bg-amber-500/[0.04] dark:bg-amber-500/[0.04]"
                        : "border-zinc-200/70 dark:border-white/5 bg-zinc-50/40 dark:bg-white/[0.01] hover:border-zinc-300 dark:hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono transition-colors border",
                          currentStatus === "present"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : currentStatus === "absent"
                            ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                            : currentStatus === "late"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : "bg-zinc-200/60 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 border-transparent"
                        )}
                      >
                        {student.rollNo}
                      </span>
                      <div className="min-w-0 flex items-center gap-2">
                        <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {student.name}
                        </p>
                        {!currentStatus && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5">
                            Unmarked
                          </span>
                        )}
                        {student.parentPhone && (
                          <p className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                            {student.parentPhone}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status Toggle Buttons + Delete */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={effectiveReadOnly}
                        onClick={() => setStudentStatus(student.id, "present")}
                        title={effectiveReadOnly ? "Present (Read-Only)" : "Mark Present"}
                        className={cn(
                          "size-7 rounded-lg text-xs font-bold transition-all border flex items-center justify-center",
                          effectiveReadOnly ? "cursor-default" : "cursor-pointer",
                          currentStatus === "present"
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30 ring-2 ring-emerald-500/30 scale-105"
                            : effectiveReadOnly
                            ? "bg-zinc-100/60 dark:bg-white/5 text-zinc-400 dark:text-zinc-600 border-zinc-200/50 dark:border-white/5 opacity-50"
                            : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/15 hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                        )}
                      >
                        P
                      </button>
                      <button
                        type="button"
                        disabled={effectiveReadOnly}
                        onClick={() => setStudentStatus(student.id, "absent")}
                        title={effectiveReadOnly ? "Absent (Read-Only)" : "Mark Absent"}
                        className={cn(
                          "size-7 rounded-lg text-xs font-bold transition-all border flex items-center justify-center",
                          effectiveReadOnly ? "cursor-default" : "cursor-pointer",
                          currentStatus === "absent"
                            ? "bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/30 ring-2 ring-red-500/30 scale-105"
                            : effectiveReadOnly
                            ? "bg-zinc-100/60 dark:bg-white/5 text-zinc-400 dark:text-zinc-600 border-zinc-200/50 dark:border-white/5 opacity-50"
                            : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/15 hover:border-red-500/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20"
                        )}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        disabled={effectiveReadOnly}
                        onClick={() => setStudentStatus(student.id, "late")}
                        title={effectiveReadOnly ? "Leave (Read-Only)" : "Mark Leave"}
                        className={cn(
                          "size-7 rounded-lg text-xs font-bold transition-all border flex items-center justify-center",
                          effectiveReadOnly ? "cursor-default" : "cursor-pointer",
                          currentStatus === "late"
                            ? "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/30 ring-2 ring-amber-500/30 scale-105"
                            : effectiveReadOnly
                            ? "bg-zinc-100/60 dark:bg-white/5 text-zinc-400 dark:text-zinc-600 border-zinc-200/50 dark:border-white/5 opacity-50"
                            : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/15 hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                        )}
                      >
                        L
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentForCalendar(student)}
                        title={`View ${student.name}'s monthly attendance calendar`}
                        className="size-7 rounded-lg text-xs font-bold transition-all border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center justify-center cursor-pointer ml-0.5"
                      >
                        <Calendar className="size-3.5" />
                      </button>
                      {!effectiveReadOnly && (
                        <button
                          type="button"
                          title={`Remove ${student.name} from class`}
                          onClick={() => setDeleteStudentTarget(student)}
                          className="ml-1 p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>

      {/* MOBILE CLASS TOOLS & ACTIONS BOTTOM SHEET */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {mobileToolsOpen && (
              <div className="fixed inset-0 z-[10020] flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setMobileToolsOpen(false)}
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 280 }}
                  className="relative z-10 w-full max-h-[85dvh] flex flex-col rounded-t-[28px] border-t border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
                >
                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setMobileToolsOpen(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>

                  <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <div className="flex items-center justify-between px-5 py-2.5 pr-14">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        Class Attendance Tools
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        {classId} — {sectionId} • Quick batch actions
                      </p>
                    </div>
                  </div>
                  <Separator />

                  <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Batch Actions
                      </span>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            markAll("present");
                            setMobileToolsOpen(false);
                          }}
                          className="h-11 justify-start gap-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 text-xs font-semibold"
                        >
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          Mark All Present
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            markAll("absent");
                            setMobileToolsOpen(false);
                          }}
                          className="h-11 justify-start gap-2 border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-50 text-xs font-semibold"
                        >
                          <XCircle className="size-4 text-red-500" />
                          Mark All Absent
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          clearAll();
                          setMobileToolsOpen(false);
                        }}
                        className="w-full h-10 gap-2 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 text-xs font-medium"
                      >
                        <RotateCcw className="size-3.5" />
                        Clear All Attendance
                      </Button>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-white/5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Class Management
                      </span>
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setMobileToolsOpen(false);
                            openAddModal();
                          }}
                          className="w-full h-11 justify-start gap-2.5 border-dashed border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs font-semibold"
                        >
                          <UserPlus className="size-4" />
                          Add New Student to Roster
                        </Button>

                        {!isSubstituteForThisClass && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setMobileToolsOpen(false);
                              void openSubstituteModal();
                            }}
                            className="w-full h-11 justify-start gap-2.5 border-zinc-200 dark:border-white/15 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
                          >
                            <UserCheck className="size-4 text-blue-500" />
                            {delegation?.active
                              ? `Manage Substitute (${delegation.substituteTeacherName.split(" ")[0]})`
                              : "Substitute Teacher Delegation"}
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          disabled={downloadingPdf || students.length === 0}
                          onClick={() => {
                            setMobileToolsOpen(false);
                            void handleDownloadPdf();
                          }}
                          className="w-full h-11 justify-start gap-2.5 border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold"
                        >
                          {downloadingPdf ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Download className="size-4" />
                          )}
                          Download Daily PDF Attendance Report
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Add Student Modal / Bottom Sheet */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isAddModalOpen && (
              <div className="fixed inset-0 z-[10020] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setIsAddModalOpen(false)}
                  aria-hidden="true"
                />

                {/* Modal / Bottom Sheet Card */}
                <motion.div
                  initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
                  animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
                  exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
                  transition={
                    isMobile
                      ? { type: "spring", damping: 28, stiffness: 280 }
                      : { duration: 0.15 }
                  }
                  className="relative z-10 w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border-t sm:border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 overflow-hidden max-h-[90dvh] flex flex-col"
                >
                  {/* Top drag handle for mobile */}
                  <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden shrink-0" />

                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>

                  <div className="flex flex-row items-center justify-between p-5 pb-3 pr-14 shrink-0">
                    <div>
                      <h3 className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                        <UserPlus className="size-4 text-blue-500" />
                        Add Student to {classId}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Enter student details for {sectionId}. Will be saved to the permanent roster.
                      </p>
                    </div>
                  </div>
                  <Separator />

                  <form onSubmit={handleAddStudent} className="flex flex-col flex-1 overflow-hidden">
                    <div className="space-y-3.5 p-5 overflow-y-auto">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Roll No. *
                          </label>
                          <Input
                            type="number"
                            min={1}
                            required
                            value={newRollNo}
                            onChange={(e) => setNewRollNo(Number(e.target.value) || 1)}
                            className="h-9 text-xs font-mono font-bold"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Student Full Name *
                          </label>
                          <Input
                            type="text"
                            required
                            placeholder="e.g. Fatima Banoo"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="h-9 text-xs"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Parent / Guardian Phone <span className="font-normal text-zinc-400">(Optional)</span>
                        </label>
                        <Input
                          type="tel"
                          placeholder="e.g. +91 94191..."
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-100 dark:border-white/5 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/40">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAddModalOpen(false)}
                        className="h-9 text-xs cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSubmittingStudent || !newName.trim()}
                        className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 cursor-pointer shadow-xs"
                      >
                        {isSubmittingStudent ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        Save Student
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Substitute Teacher Delegation Modal / Bottom Sheet */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isSubModalOpen && (
              <div className="fixed inset-0 z-[10020] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setIsSubModalOpen(false)}
                  aria-hidden="true"
                />

                {/* Modal / Bottom Sheet Card */}
                <motion.div
                  initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
                  animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
                  exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
                  transition={
                    isMobile
                      ? { type: "spring", damping: 28, stiffness: 280 }
                      : { duration: 0.15 }
                  }
                  className="relative z-10 w-full sm:max-w-lg rounded-t-[28px] sm:rounded-2xl border-t sm:border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 overflow-hidden max-h-[90dvh] flex flex-col"
                >
                  {/* Top drag handle for mobile */}
                  <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden shrink-0" />

                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setIsSubModalOpen(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>

                  <div className="flex items-center justify-between p-5 pr-14 shrink-0">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                        <UserCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Substitute Class Teacher Delegation
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Authorize a colleague to mark student attendance for {classId} ({sectionId}) while on leave.
                      </p>
                    </div>
                  </div>
                  <Separator />

                  <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Existing active delegation status */}
                    {delegation?.active ? (
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-950/20 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              Active Delegation
                            </span>
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                              {delegation.substituteTeacherName}
                            </h4>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                              {delegation.reason}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                            Active
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                          <Calendar className="size-3.5" />
                          <span>
                            {delegation.startDate} {delegation.endDate ? `to ${delegation.endDate}` : "(until revoked)"}
                          </span>
                        </div>
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={revokingDelegation}
                            onClick={() => setRevokeSubConfirmOpen(true)}
                            className="h-8 text-xs font-semibold gap-1.5 w-full cursor-pointer"
                          >
                            {revokingDelegation ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                            Revoke Delegation (Return Access to Me)
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {/* Form to assign or change substitute */}
                    <form onSubmit={(e) => void handleAssignSubstitute(e)} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Select Substitute Colleague / Teacher:
                        </label>
                        {loadingFaculty ? (
                          <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                            <Loader2 className="size-3.5 animate-spin text-blue-600" />
                            Loading school faculty list…
                          </div>
                        ) : (
                          <AppSelect
                            value={substituteTeacherId}
                            onChange={setSubstituteTeacherId}
                            options={facultyList.map((f) => ({
                              value: f.id,
                              label: f.name,
                              sublabel: `${f.designation || "Teacher"}${f.employeeId ? ` • ID: ${f.employeeId}` : ""}`,
                              badge: f.wingId?.toUpperCase(),
                            }))}
                            placeholder="— Choose a faculty member —"
                            searchable={true}
                            searchPlaceholder="Search teacher by name or employee ID..."
                            title="Select Substitute Faculty Member"
                          />
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Reason / Leave Type:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            "On Medical Leave",
                            "On Casual Leave",
                            "Official Out-of-Campus Duty",
                            "Personal Emergency",
                          ].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setDelegationReason(preset)}
                              className={cn(
                                "px-2.5 py-1 text-[11px] rounded-lg border transition-all cursor-pointer",
                                delegationReason === preset
                                  ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold"
                                  : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300"
                              )}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={delegationReason}
                          onChange={(e) => setDelegationReason(e.target.value)}
                          placeholder="e.g. On Medical Leave"
                          className="h-8 text-xs mt-1"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            From Date:
                          </label>
                          <AppDatePicker
                            value={delegationStartDate}
                            onChange={setDelegationStartDate}
                            placeholder="dd/mm/yyyy"
                            title="Delegation From Date"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            Until Date (Optional):
                          </label>
                          <AppDatePicker
                            value={delegationEndDate}
                            onChange={setDelegationEndDate}
                            placeholder="Indefinite if empty"
                            title="Delegation Until Date"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-white/5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsSubModalOpen(false)}
                          className="h-8 text-xs cursor-pointer"
                        >
                          Close
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={submittingDelegation || !substituteTeacherId}
                          className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 cursor-pointer shadow-sm"
                        >
                          {submittingDelegation ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="size-3.5" />
                          )}
                          {delegation?.active ? "Update Substitute Teacher" : "Confirm & Delegate Access"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Student Monthly Attendance Calendar Modal */}
      <StudentAttendanceCalendarModal
        student={selectedStudentForCalendar}
        classId={classId}
        sectionId={sectionId}
        isOpen={!!selectedStudentForCalendar}
        onClose={() => setSelectedStudentForCalendar(null)}
      />

      {/* Danger Zone: Delete Student Modal */}
      <DangerConfirmModal
        open={Boolean(deleteStudentTarget)}
        onClose={() => setDeleteStudentTarget(null)}
        onConfirm={handleConfirmDeleteStudent}
        title="Danger zone"
        subtitle="Remove student from class roster"
        description={
          <span>
            Are you sure you want to remove{" "}
            <strong className="text-white font-semibold">{deleteStudentTarget?.name}</strong>{" "}
            (Roll No. {deleteStudentTarget?.rollNo}) from <strong>{classId} ({sectionId})</strong>?
            This will permanently delete their student record from this class roster.
          </span>
        }
        confirmText="Delete Student"
        cancelText="Cancel"
        loading={deletingStudent}
        variant="danger"
      />

      {/* Danger Zone: Revoke Substitute Modal */}
      <DangerConfirmModal
        open={revokeSubConfirmOpen}
        onClose={() => setRevokeSubConfirmOpen(false)}
        onConfirm={handleRevokeSubstitute}
        title="Danger zone"
        subtitle="Revoke substitute delegation"
        description={
          <span>
            Revoke substitute teacher coverage for <strong>{classId} ({sectionId})</strong>? Attendance access will return only to the permanent class teacher.
          </span>
        }
        confirmText="Revoke Access"
        cancelText="Cancel"
        loading={revokingDelegation}
        variant="danger"
      />
    </Card>
    </>
  );
}
