"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  SlidersHorizontal,
  X,
  Shuffle,
  Send,
  Loader2,
  AlertTriangle,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentAttendanceBoard } from "@/components/client/student-attendance-board";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppSelect } from "@/components/ui/app-select";
import { SchoolConfig, DEFAULT_SCHOOL_CONFIG, getSectionsForClass } from "@/lib/school/config";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

type MonthAttendanceSummary = {
  date: string;
  summary: {
    total: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    presentPercent: number;
  };
};

export function TeacherStudentsManager() {
  const { user } = useDashboardUser();
  const [config, setConfig] = React.useState<SchoolConfig>(DEFAULT_SCHOOL_CONFIG);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // Determine teacher's category / wing
  const teacherWing = React.useMemo(() => {
    if (user?.schoolWingId) return user.schoolWingId;
    if (user?.schoolClassId && config.wings) {
      const match = config.wings.find((w) => w.classes.includes(user.schoolClassId!));
      if (match) return match.id;
    }
    return "lower";
  }, [user?.schoolWingId, user?.schoolClassId, config.wings]);

  // Defaults: Use teacher's assigned class & section from onboarding/profile
  const defaultClass = user?.schoolClassId || "Pre-Nursery";
  const defaultSection = user?.schoolSectionId || "Section A";
  const defaultWing = teacherWing;

  const [selectedWing, setSelectedWing] = React.useState<string>(defaultWing);
  const [selectedClass, setSelectedClass] = React.useState<string>(defaultClass);
  const [selectedSection, setSelectedSection] = React.useState<string>(defaultSection);

  // Synchronize state when user profile or school config loads
  React.useEffect(() => {
    if (!user) return;
    const targetWing = isAdmin ? (selectedWing || teacherWing) : teacherWing;
    setSelectedWing(targetWing);

    const wingObj = config.wings.find((w) => w.id === targetWing) || config.wings[0];
    const validClasses = wingObj?.classes || [];

    if (user.schoolClassId && validClasses.includes(user.schoolClassId)) {
      setSelectedClass(user.schoolClassId);
    } else if (validClasses.length > 0 && !validClasses.includes(selectedClass)) {
      setSelectedClass(validClasses[0]!);
    }

    if (user.schoolSectionId) {
      setSelectedSection(user.schoolSectionId);
    }
  }, [user?.uid, user?.schoolWingId, user?.schoolClassId, user?.schoolSectionId, teacherWing, config, isAdmin]);

  // Date selection
  const todayStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDate, setSelectedDate] = React.useState<string>(todayStr);
  const [activeView, setActiveView] = React.useState<"rollcall" | "month_calendar">("rollcall");

  // Mobile Bottom Sheet States
  const [mounted, setMounted] = React.useState(false);
  const [mobileRollCallOpen, setMobileRollCallOpen] = React.useState(false);
  const [mobileCalendarOpen, setMobileCalendarOpen] = React.useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false);
  const [isRollCallSubmitted, setIsRollCallSubmitted] = React.useState(false);

  // Unassign & Self-Assign States
  const [unassigning, setUnassigning] = React.useState(false);
  const [unassignConfirmOpen, setUnassignConfirmOpen] = React.useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [assignWing, setAssignWing] = React.useState<string>(defaultWing);
  const [assignClass, setAssignClass] = React.useState<string>(defaultClass);
  const [assignSection, setAssignSection] = React.useState<string>(defaultSection);
  const [assignReason, setAssignReason] = React.useState<string>("");
  const [submittingAssign, setSubmittingAssign] = React.useState(false);

  // Class switch requests state for this teacher
  const [switchRequests, setSwitchRequests] = React.useState<
    Array<{
      id: string;
      teacherId: string;
      wingId: string;
      assignedClass: string;
      assignedSection: string;
      requestedClass: string;
      requestedSection: string;
      reason: string;
      date: string;
      status: "pending" | "approved" | "consumed" | "rejected";
    }>
  >([]);

  // School-wide assigned classes to filter out already assigned classes from switch requests
  const [assignedClassesList, setAssignedClassesList] = React.useState<
    Array<{ classId: string; sectionId: string; wingId?: string; teacherName?: string }>
  >([]);

  const fetchAssignedClasses = React.useCallback(async () => {
    try {
      const res = await fetch("/api/school/positions-status");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.assignedClasses)) {
        setAssignedClassesList(data.assignedClasses);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void fetchAssignedClasses();
    const onDelegationChanged = () => {
      void fetchAssignedClasses();
    };
    window.addEventListener("substitute-delegation-changed", onDelegationChanged);
    return () => window.removeEventListener("substitute-delegation-changed", onDelegationChanged);
  }, [fetchAssignedClasses]);

  const isSectionAssigned = React.useCallback(
    (classId: string, section: string) => {
      const normCls = classId.trim().toLowerCase();
      const normSec = section.replace(/^section\s+/i, "").trim().toLowerCase();
      return assignedClassesList.some(
        (a) =>
          a.classId.trim().toLowerCase() === normCls &&
          a.sectionId.replace(/^section\s+/i, "").trim().toLowerCase() === normSec
      );
    },
    [assignedClassesList]
  );

  // Active substitute delegations where this teacher is assigned to cover
  const [myCoverages, setMyCoverages] = React.useState<
    Array<{
      classId: string;
      sectionId: string;
      permanentTeacherName: string;
      reason: string;
      startDate: string;
      endDate?: string | null;
    }>
  >([]);

  const fetchCoverages = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/school/students/substitute?mine=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.delegations)) {
        setMyCoverages(data.delegations);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void fetchCoverages();
    const handleSubChange = () => {
      void fetchCoverages();
    };
    window.addEventListener("substitute-delegation-changed", handleSubChange);
    return () => window.removeEventListener("substitute-delegation-changed", handleSubChange);
  }, [fetchCoverages]);

  const approvedSwitch = React.useMemo(() => {
    return switchRequests.find((r) => r.status === "approved");
  }, [switchRequests]);

  const pendingSwitch = React.useMemo(() => {
    return switchRequests.find((r) => r.status === "pending");
  }, [switchRequests]);

  // Overall class teacher or authorized access check
  const hasAssignedClass =
    isAdmin ||
    Boolean(user?.isClassTeacher && user?.schoolClassId) ||
    Boolean(myCoverages.length > 0) ||
    Boolean(approvedSwitch);

  // Switch request modal state
  const [isSwitchModalOpen, setIsSwitchModalOpen] = React.useState(false);
  const [targetClass, setTargetClass] = React.useState("");
  const [targetSection, setTargetSection] = React.useState("");
  const [switchReason, setSwitchReason] = React.useState("");
  const [submittingSwitch, setSubmittingSwitch] = React.useState(false);

  // Refetch live assigned and requested classes whenever appointment or switch modal opens
  React.useEffect(() => {
    if (isAssignModalOpen || isSwitchModalOpen) {
      void fetchAssignedClasses();
    }
  }, [isAssignModalOpen, isSwitchModalOpen, fetchAssignedClasses]);

  const fetchSwitchRequests = React.useCallback(async () => {
    // If user has no class assigned, they cannot switch classes
    if (!isAdmin && !user?.isClassTeacher) return;
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch(`/api/school/students/switch-request?mine=true&date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.requests)) {
        setSwitchRequests(data.requests);
      }
    } catch {
      /* ignore */
    }
  }, [isAdmin, user?.isClassTeacher, selectedDate]);

  React.useEffect(() => {
    void fetchSwitchRequests();
  }, [fetchSwitchRequests]);

  const handleSendSwitchRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClass || !targetSection || !switchReason.trim()) {
      toast.error("Please fill in target class, section, and reason.");
      return;
    }
    if (isSectionAssigned(targetClass, targetSection)) {
      toast.error(`${targetClass} ${targetSection} is already assigned or requested by another teacher.`);
      return;
    }
    setSubmittingSwitch(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/students/switch-request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestedClass: targetClass,
          requestedSection: targetSection,
          reason: switchReason.trim(),
          date: selectedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");

      toast.success("Class switch request submitted! Waiting for Admin approval.");
      setIsSwitchModalOpen(false);
      setSwitchReason("");
      void fetchSwitchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error submitting switch request");
    } finally {
      setSubmittingSwitch(false);
    }
  };

  const [applyingSwitch, setApplyingSwitch] = React.useState(false);

  const handleApplySwitch = async (reqId: string, targetCls: string, targetSec: string) => {
    setApplyingSwitch(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/students/switch-request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "apply_approved_switch",
          requestId: reqId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch class");
      toast.success(data.message || `Switched to ${targetCls} (${targetSec})! Previous class has been unassigned.`);
      setSelectedClass(targetCls);
      setSelectedSection(targetSec);
      void fetchSwitchRequests();
      void fetchAssignedClasses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error switching class");
    } finally {
      setApplyingSwitch(false);
    }
  };

  const handleSwitchConsumed = () => {
    void fetchSwitchRequests();
  };

  // Auto-apply approved switch and set new class active so it acts identically to direct assign
  React.useEffect(() => {
    if (!approvedSwitch || approvedSwitch.status !== "approved") return;
    if (approvedSwitch.requestedClass && selectedClass !== approvedSwitch.requestedClass) {
      setSelectedClass(approvedSwitch.requestedClass);
    }
    if (approvedSwitch.requestedSection && selectedSection !== approvedSwitch.requestedSection) {
      setSelectedSection(approvedSwitch.requestedSection);
    }
    if (user?.schoolClassId !== approvedSwitch.requestedClass || user?.schoolSectionId !== approvedSwitch.requestedSection) {
      void handleApplySwitch(approvedSwitch.id, approvedSwitch.requestedClass, approvedSwitch.requestedSection);
    }
  }, [approvedSwitch, user?.schoolClassId, user?.schoolSectionId]);

  const handleUnassignSelf = async () => {
    setUnassigning(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/teachers/manage-role", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "unassign_self" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unassign");
      toast.success(data.message || "Unassigned successfully");
      setUnassignConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error unassigning");
    } finally {
      setUnassigning(false);
    }
  };

  // Proactively prefetch roster and attendance in background for instant open (only if class is assigned)
  React.useEffect(() => {
    if (!hasAssignedClass) return;
    if (!selectedClass || !selectedSection) return;
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) return;
    void u.getIdToken().then((token) => {
      void fetch(
        `/api/school/students?classId=${encodeURIComponent(selectedClass)}&sectionId=${encodeURIComponent(selectedSection)}&wingId=${selectedWing}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      void fetch(
        `/api/school/students/attendance?date=${selectedDate}&classId=${encodeURIComponent(selectedClass)}&sectionId=${encodeURIComponent(selectedSection)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    });
  }, [hasAssignedClass, selectedClass, selectedSection, selectedWing, selectedDate]);

  const [cancellingRequest, setCancellingRequest] = React.useState(false);

  const handleCancelRequest = async () => {
    setCancellingRequest(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/teachers/manage-role", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel_assignment_request",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel request");
      toast.success(data.message || "Assignment request cancelled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error cancelling request");
    } finally {
      setCancellingRequest(false);
    }
  };

  const handleAssignMe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignClass || !assignSection) {
      toast.error("Please choose a class and section");
      return;
    }
    if (isSectionAssigned(assignClass, assignSection)) {
      toast.error(`${assignClass} ${assignSection} is already assigned or requested by another teacher.`);
      return;
    }
    setSubmittingAssign(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/teachers/manage-role", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "request_assignment",
          wingId: assignWing,
          classId: assignClass,
          sectionId: assignSection,
          reason: assignReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit assignment request");
      toast.success(data.message || "Assignment request submitted for admin approval!");
      setIsAssignModalOpen(false);
      setAssignReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error submitting request");
    } finally {
      setSubmittingAssign(false);
    }
  };


  const handleBackToMyClass = () => {
    if (user?.schoolClassId) {
      setSelectedClass(user.schoolClassId);
    }
    if (user?.schoolSectionId) {
      setSelectedSection(user.schoolSectionId);
    }
    if (user?.schoolWingId) {
      setSelectedWing(user.schoolWingId);
    }
  };

  React.useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileRollCallOpen(false);
        setMobileCalendarOpen(false);
        setMobileToolsOpen(false);
        setIsSwitchModalOpen(false);
        setIsAssignModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Monthly calendar state
  const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date());
  const [monthSummaries, setMonthSummaries] = React.useState<Record<string, MonthAttendanceSummary["summary"]>>({});
  const [loadingMonth, setLoadingMonth] = React.useState(false);

  const monthStr = React.useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [currentMonth]);

  const monthLabel = React.useMemo(() => {
    return currentMonth.toLocaleString("default", { month: "long", year: "numeric" });
  }, [currentMonth]);

  // Load school config
  React.useEffect(() => {
    fetch("/api/school/config")
      .then((r) => r.json())
      .then((data: SchoolConfig) => {
        if (data && data.wings) {
          setConfig(data);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch monthly class summaries (only if class is assigned)
  React.useEffect(() => {
    if (!hasAssignedClass) return;
    let cancelled = false;
    const fetchMonth = async () => {
      setLoadingMonth(true);
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();

        const res = await fetch(
          `/api/school/students/attendance?classId=${encodeURIComponent(selectedClass)}&sectionId=${encodeURIComponent(selectedSection)}&month=${monthStr}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;

        if (Array.isArray(json.days)) {
          const map: Record<string, MonthAttendanceSummary["summary"]> = {};
          json.days.forEach((d: MonthAttendanceSummary) => {
            if (d.date && d.summary) {
              map[d.date] = d.summary;
            }
          });
          setMonthSummaries(map);
        }
      } catch (err) {
        console.error("Error loading monthly student attendance:", err);
      } finally {
        if (!cancelled) setLoadingMonth(false);
      }
    };

    void fetchMonth();
    return () => {
      cancelled = true;
    };
  }, [hasAssignedClass, selectedClass, selectedSection, monthStr]);

  // Available classes & sections
  const availableClasses = React.useMemo(() => {
    const wing = config.wings.find((w) => w.id === selectedWing) || config.wings[0];
    return wing ? wing.classes : ["Class 1"];
  }, [config, selectedWing]);

  const availableSections = React.useMemo(() => {
    return getSectionsForClass(config, selectedClass);
  }, [config, selectedClass]);

  // Accessible classes: Admins see all classes.
  // Teachers ONLY see classes they have access to:
  // 1. Their main assigned class (main assigne)
  // 2. Shared access / substitute coverage classes (myCoverages) - across ANY wing
  // 3. Approved temporary class switch (approvedSwitch) - across ANY wing
  const accessibleClasses = React.useMemo(() => {
    if (isAdmin) {
      return availableClasses;
    }
    const list: string[] = [];
    if (user?.schoolClassId && !list.includes(user.schoolClassId)) {
      list.push(user.schoolClassId);
    }
    myCoverages.forEach((cov) => {
      if (cov.classId && !list.includes(cov.classId)) {
        list.push(cov.classId);
      }
    });
    if (approvedSwitch?.requestedClass && !list.includes(approvedSwitch.requestedClass)) {
      list.push(approvedSwitch.requestedClass);
    }

    return list;
  }, [isAdmin, availableClasses, user?.schoolClassId, myCoverages, approvedSwitch]);

  // Switch: Available classes in user's category that have at least one unassigned section
  const switchAvailableClasses = React.useMemo(() => {
    return availableClasses.filter((c) => {
      const secs = getSectionsForClass(config, c);
      return secs.some(
        (s) =>
          !(c === user?.schoolClassId && s === user?.schoolSectionId) &&
          !isSectionAssigned(c, s)
      );
    });
  }, [availableClasses, config, user?.schoolClassId, user?.schoolSectionId, isSectionAssigned]);

  // Switch: Available unassigned sections for targetClass
  const switchAvailableSections = React.useMemo(() => {
    const cls = targetClass || switchAvailableClasses[0] || availableClasses[0];
    if (!cls) return [];
    const secs = getSectionsForClass(config, cls);
    return secs.filter(
      (s) =>
        !(cls === user?.schoolClassId && s === user?.schoolSectionId) &&
        !isSectionAssigned(cls, s)
    );
  }, [config, targetClass, switchAvailableClasses, availableClasses, user?.schoolClassId, user?.schoolSectionId, isSectionAssigned]);

  // Appointment: Available classes in assignWing that have at least one unassigned section
  const assignAvailableClasses = React.useMemo(() => {
    const wingClasses = config.wings.find((w) => w.id === assignWing)?.classes || [];
    return wingClasses.filter((c) => {
      const secs = getSectionsForClass(config, c);
      return secs.some((s) => !isSectionAssigned(c, s));
    });
  }, [config, assignWing, isSectionAssigned]);

  // Appointment: Available unassigned sections for assignClass
  const assignAvailableSections = React.useMemo(() => {
    const cls = assignClass || assignAvailableClasses[0];
    if (!cls) return [];
    const secs = getSectionsForClass(config, cls);
    return secs.filter((s) => !isSectionAssigned(cls, s));
  }, [config, assignClass, assignAvailableClasses, isSectionAssigned]);

  const handleOpenSwitchModal = React.useCallback(
    (c?: string, s?: string) => {
      const getValidSecs = (cls: string) => {
        return getSectionsForClass(config, cls).filter(
          (sec) =>
            !(cls === user?.schoolClassId && sec === user?.schoolSectionId) &&
            !isSectionAssigned(cls, sec)
        );
      };

      let chosenClass =
        c && switchAvailableClasses.includes(c)
          ? c
          : (switchAvailableClasses[0] || c || availableClasses[0] || "Class 1");

      let chosenSecs = getValidSecs(chosenClass);
      if (chosenSecs.length === 0 && switchAvailableClasses.length > 0) {
        chosenClass = switchAvailableClasses[0];
        chosenSecs = getValidSecs(chosenClass);
      }
      const chosenSec = s && chosenSecs.includes(s) ? s : (chosenSecs[0] || "");

      setTargetClass(chosenClass);
      setTargetSection(chosenSec);
      setIsSwitchModalOpen(true);
    },
    [config, switchAvailableClasses, availableClasses, user?.schoolClassId, user?.schoolSectionId, isSectionAssigned]
  );

  const getAllowedSectionsForClass = React.useCallback(
    (cls: string) => {
      const allSecs = getSectionsForClass(config, cls);
      if (isAdmin) return allSecs;

      const set = new Set<string>();
      if (user?.schoolClassId === cls && user?.schoolSectionId) {
        set.add(user.schoolSectionId);
      }
      myCoverages.forEach((cov) => {
        if (cov.classId === cls && cov.sectionId) {
          set.add(cov.sectionId);
        }
      });
      if (approvedSwitch?.requestedClass === cls && approvedSwitch?.requestedSection) {
        set.add(approvedSwitch.requestedSection);
      }

      const filtered = allSecs.filter((s) => set.has(s));
      return filtered.length > 0 ? filtered : allSecs;
    },
    [config, isAdmin, user?.schoolClassId, user?.schoolSectionId, myCoverages, approvedSwitch]
  );

  const accessibleSections = React.useMemo(() => {
    return getAllowedSectionsForClass(selectedClass);
  }, [getAllowedSectionsForClass, selectedClass]);

  const handleSelectClass = React.useCallback(
    (nextClass: string, nextSection?: string) => {
      const targetWing = config.wings.find((w) => w.classes.includes(nextClass))?.id;
      if (targetWing) setSelectedWing(targetWing);
      setSelectedClass(nextClass);
      if (nextSection) {
        setSelectedSection(nextSection);
      } else {
        const allowedSecs = getAllowedSectionsForClass(nextClass);
        if (allowedSecs[0]) setSelectedSection(allowedSecs[0]);
      }
    },
    [config.wings, getAllowedSectionsForClass]
  );

  // Keep selectedClass synchronized to an accessible class
  React.useEffect(() => {
    if (!isAdmin && accessibleClasses.length > 0 && !accessibleClasses.includes(selectedClass)) {
      const first = accessibleClasses[0]!;
      handleSelectClass(first);
    }
  }, [isAdmin, accessibleClasses, selectedClass, handleSelectClass]);

  // Keep selectedSection synchronized to an accessible section
  React.useEffect(() => {
    if (!isAdmin && accessibleSections.length > 0 && !accessibleSections.includes(selectedSection)) {
      setSelectedSection(accessibleSections[0]!);
    }
  }, [isAdmin, accessibleSections, selectedSection]);

  // Calendar math for monthly view
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    dayCells.push({ empty: true, key: `empty-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${monthStr}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(year, month, d);
    const isSunday = dateObj.getDay() === 0;
    const isToday = dStr === todayStr;
    const isSelected = dStr === selectedDate;
    const summary = monthSummaries[dStr] || null;

    dayCells.push({
      empty: false,
      dayNum: d,
      dStr,
      isSunday,
      isToday,
      isSelected,
      summary,
      key: `day-${d}`,
    });
  }

  const handlePrevMonth = () => {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="rounded-2xl border border-zinc-200/90 bg-gradient-to-r from-blue-900/10 via-blue-500/5 to-transparent p-4 md:p-6 shadow-sm dark:border-white/10 dark:from-blue-950/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <GraduationCap className="size-4" />
                Attendance Portal
              </span>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {config.wings.find((w) => w.id === selectedWing)?.name || selectedWing}
              </span>

              {/* Show only ONE context-relevant role badge for the active class */}
              {myCoverages.some((cov) => cov.classId === selectedClass && cov.sectionId === selectedSection) ? (
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Substitute Teacher ({myCoverages.find((cov) => cov.classId === selectedClass && cov.sectionId === selectedSection)?.permanentTeacherName})
                  </span>
                  {user?.schoolClassId && (
                    <button
                      type="button"
                      onClick={handleBackToMyClass}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-200/60 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                      title="Back to my assigned class"
                    >
                      <RotateCcw className="size-2.5" />
                      <span>My Class</span>
                    </button>
                  )}
                </div>
              ) : (user?.isClassTeacher && (selectedClass === user?.schoolClassId || (approvedSwitch && selectedClass === approvedSwitch.requestedClass))) ||
                  (approvedSwitch && selectedClass === approvedSwitch.requestedClass) ? (
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Class Incharge
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnassignConfirmOpen(true)}
                    disabled={unassigning}
                    className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer"
                    title="Remove myself as Class Teacher"
                  >
                    {unassigning ? <Loader2 className="size-3 animate-spin" /> : <UserX className="size-3" />}
                    <span>Unassign</span>
                  </button>
                </div>
              ) : !isAdmin && !user?.isClassTeacher && user?.pendingClassAssignment?.status === "pending" ? (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Clock className="size-3 animate-pulse" />
                    Assignment Pending
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCancelRequest()}
                    disabled={cancellingRequest}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-200/60 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    title="Cancel Assignment Request"
                  >
                    {cancellingRequest ? <Loader2 className="size-2.5 animate-spin" /> : <X className="size-2.5" />}
                    <span>Cancel</span>
                  </button>
                </div>
              ) : null}
            </div>

            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              {!hasAssignedClass ? (
                user?.pendingClassAssignment?.status === "pending"
                  ? `${user.pendingClassAssignment.classId} — ${user.pendingClassAssignment.sectionId} (Pending Approval)`
                  : "Student Attendance"
              ) : (
                `${selectedClass} — ${selectedSection}`
              )}
            </h1>
          </div>

          {/* Quick Date Jumper: Clean and concise */}
          <div className="flex items-center gap-2">
            {!isAdmin && !user?.isClassTeacher && user?.pendingClassAssignment?.status !== "pending" && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setAssignWing(teacherWing);
                  const w = config.wings.find((x) => x.id === teacherWing) || config.wings[0];
                  if (w?.classes[0]) {
                    setAssignClass(w.classes[0]);
                    const secs = getSectionsForClass(config, w.classes[0]);
                    if (secs[0]) setAssignSection(secs[0]);
                  }
                  setIsAssignModalOpen(true);
                }}
                className="h-9 rounded-xl text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
              >
                <UserCheck className="size-3.5" />
                <span>Assign Me</span>
              </Button>
            )}

            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={cn(
                "px-3 py-2 text-xs font-semibold rounded-xl border transition-all h-9 shrink-0 cursor-pointer",
                selectedDate === todayStr
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/30"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5"
              )}
            >
              Today
            </button>
            <div className="w-36">
              <AppDatePicker
                value={selectedDate}
                max={todayStr}
                onChange={(val) => {
                  if (!val) return;
                  if (val > todayStr) {
                    toast.error(`Cannot select ${val} because it is in the future.`);
                    return;
                  }
                  setSelectedDate(val);
                }}
              />
            </div>
          </div>
        </div>


        {/* Pending Switch Request Banner */}
        {pendingSwitch && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                <Clock className="size-4" />
              </span>
              <div>
                <p className="font-bold text-amber-950 dark:text-amber-200">
                  Switch Request Pending Administration Approval
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Requested access for <strong>{pendingSwitch.requestedClass} ({pendingSwitch.requestedSection})</strong>. Waiting for school admin approval.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* View Switcher Tabs (Desktop Only) - ONLY shown when class is assigned */}
        {hasAssignedClass && (
          <div className="hidden md:flex mt-5 items-center justify-between border-t border-zinc-200/70 pt-4 dark:border-white/10 flex-wrap gap-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100/90 p-1 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setActiveView("rollcall")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  activeView === "rollcall"
                    ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                )}
              >
                Daily Roll Call ({selectedDate})
              </button>
              <button
                type="button"
                onClick={() => setActiveView("month_calendar")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeView === "month_calendar"
                    ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                )}
              >
                <CalendarIcon className="size-3.5 text-blue-500" />
                Monthly Class Calendar
              </button>
            </div>

            {/* Class & Section selector */}
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <div className="flex items-center gap-1.5 mr-1">
                  <span className="text-xs text-zinc-400 font-medium hidden lg:inline">Category:</span>
                  <div className="w-36">
                    <AppSelect
                      value={selectedWing}
                      onChange={(nextWing) => {
                        setSelectedWing(nextWing);
                        const w = config.wings.find((x) => x.id === nextWing);
                        if (w?.classes[0]) {
                          setSelectedClass(w.classes[0]);
                          const secs = getSectionsForClass(config, w.classes[0]);
                          if (secs[0]) setSelectedSection(secs[0]);
                        }
                      }}
                      options={config.wings.map((w) => ({ value: w.id, label: w.name }))}
                      title="Select School Category"
                    />
                  </div>
                </div>
              )}
              <span className="text-xs text-zinc-400 font-medium hidden sm:inline">Class:</span>
              <div className="w-40">
                <AppSelect
                  value={selectedClass}
                  onChange={(nextClass) => handleSelectClass(nextClass)}
                  options={accessibleClasses.map((c) => {
                    const isMyClass = c === user?.schoolClassId || c === approvedSwitch?.requestedClass;
                    const isSubstitute = myCoverages.some((cov) => cov.classId === c);
                    return {
                      value: c,
                      label: c,
                      badge: isMyClass ? "Assigned" : isSubstitute ? "Substitute" : undefined,
                    };
                  })}
                  title="Select Class"
                />
              </div>

              <div className="w-32">
                <AppSelect
                  value={selectedSection}
                  onChange={setSelectedSection}
                  options={accessibleSections.map((s) => ({ value: s, label: s }))}
                  title="Select Section"
                />
              </div>

              {!isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenSwitchModal()}
                  className="h-10 text-xs font-bold gap-1 px-3 rounded-xl border-blue-200 text-blue-700 dark:border-blue-900/50 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 shadow-xs cursor-pointer"
                  title="Request class switch approval from administration"
                >
                  <Shuffle className="size-3.5" />
                  Switch
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* If teacher is not assigned to any class, show empty state prompt */}
      {!hasAssignedClass ? (
        !isAdmin && user?.pendingClassAssignment?.status === "pending" ? (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.04] p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 my-8 shadow-sm backdrop-blur-sm animate-in fade-in duration-200">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-8 ring-amber-500/5">
              <Clock className="size-8 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <span className="size-2 rounded-full bg-amber-500 animate-ping" />
                Assignment Request Pending Admin Approval
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
                {user.pendingClassAssignment.classId} — {user.pendingClassAssignment.sectionId}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                Your request to be appointed as Class Teacher for <strong>{user.pendingClassAssignment.classId} ({user.pendingClassAssignment.sectionId})</strong> has been submitted to School Administration.
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                You will automatically gain full access to view and take daily student attendance once an administrator approves your request.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={cancellingRequest}
                onClick={() => void handleCancelRequest()}
                className="text-xs font-bold h-9 px-4 rounded-xl border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
              >
                {cancellingRequest && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                Cancel Request
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-zinc-300 dark:border-white/15 bg-white/70 dark:bg-zinc-900/50 p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 my-8 shadow-sm backdrop-blur-sm">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-8 ring-blue-500/5">
              <GraduationCap className="size-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
                No Class Assigned Yet
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                You are currently not assigned as a Class Teacher of any class. Submit an assignment request to School Administration to be appointed as Class Teacher.
              </p>
            </div>
            <div className="pt-2">
              <Button
                type="button"
                onClick={() => {
                  setAssignWing(teacherWing);
                  const w = config.wings.find((x) => x.id === teacherWing) || config.wings[0];
                  if (w?.classes[0]) {
                    setAssignClass(w.classes[0]);
                    const secs = getSectionsForClass(config, w.classes[0]);
                    if (secs[0]) setAssignSection(secs[0]);
                  }
                  setIsAssignModalOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm h-11 px-6 rounded-xl shadow-md gap-2 cursor-pointer"
              >
                <UserCheck className="size-4" />
                Assign Me as Class Teacher
              </Button>
            </div>
          </div>
        )
      ) : (
        <>
          {/* MOBILE 3-BUTTON ACTION CARDS (Entire card clickable with Framer Motion) */}
          <div className="md:hidden space-y-3">
            {/* Card 1: Student Daily Roll Call */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => setMobileRollCallOpen(true)}
              className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between shadow-sm hover:border-zinc-300 dark:hover:border-white/20 transition-all cursor-pointer select-none active:bg-zinc-50 dark:active:bg-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <Users className="size-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Daily Student Roll Call
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {selectedClass} ({selectedSection}) • {selectedDate}
                  </p>
                </div>
              </div>
              <div className="h-8 rounded-full bg-zinc-900 text-white dark:bg-white/10 dark:text-white text-xs font-semibold px-4 flex items-center justify-center pointer-events-none">
                Roll Call &gt;
              </div>
            </motion.div>

            {/* Card 2: Monthly Class Calendar */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => setMobileCalendarOpen(true)}
              className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between shadow-sm hover:border-zinc-300 dark:hover:border-white/20 transition-all cursor-pointer select-none active:bg-zinc-50 dark:active:bg-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CalendarIcon className="size-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Monthly Class Calendar
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {monthLabel} • Attendance overview
                  </p>
                </div>
              </div>
              <div className="h-8 rounded-full bg-zinc-900 text-white dark:bg-white/10 dark:text-white text-xs font-semibold px-4 flex items-center justify-center pointer-events-none">
                Calendar &gt;
              </div>
            </motion.div>

            {/* Card 3: Class Tools & Settings */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => setMobileToolsOpen(true)}
              className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between shadow-sm hover:border-zinc-300 dark:hover:border-white/20 transition-all cursor-pointer select-none active:bg-zinc-50 dark:active:bg-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <SlidersHorizontal className="size-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Class Tools &amp; Settings
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Switch class, substitute, PDF download
                  </p>
                </div>
              </div>
              <div className="h-8 rounded-full bg-zinc-900 text-white dark:bg-white/10 dark:text-white text-xs font-semibold px-4 flex items-center justify-center pointer-events-none">
                Tools &gt;
              </div>
            </motion.div>

            {/* Mobile Class & Section Selector at the bottom */}
            <div className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="size-3.5 text-blue-500" />
                  Select Class &amp; Section
                </span>
                {!isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenSwitchModal()}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Shuffle className="size-3" />
                    Request Switch
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <AppSelect
                  value={selectedClass}
                  onChange={(nextClass) => handleSelectClass(nextClass)}
                  options={accessibleClasses.map((c) => {
                    const isMyClass = c === user?.schoolClassId || c === approvedSwitch?.requestedClass;
                    const isSubstitute = myCoverages.some((cov) => cov.classId === c);
                    return {
                      value: c,
                      label: c,
                      badge: isMyClass ? "Assigned" : isSubstitute ? "Substitute" : undefined,
                    };
                  })}
                  title="Select Class"
                />
                <AppSelect
                  value={selectedSection}
                  onChange={setSelectedSection}
                  options={accessibleSections.map((s) => ({ value: s, label: s }))}
                  title="Select Section"
                />
              </div>
            </div>
          </div>

          {/* DESKTOP VIEWS (Hidden on Mobile) */}
          <div className="hidden md:block space-y-6">
            {/* VIEW 1: Daily Roll Call */}
            {activeView === "rollcall" && (
              <div className="space-y-4">
                <StudentAttendanceBoard
                  classId={selectedClass}
                  sectionId={selectedSection}
                  wingId={selectedWing}
                  dateStr={selectedDate}
                  onSwitchConsumed={handleSwitchConsumed}
                  onRequestSwitch={handleOpenSwitchModal}
                  onBackToMyClass={handleBackToMyClass}
                />
              </div>
            )}

        {/* VIEW 2: Monthly Class Attendance Calendar */}
        {activeView === "month_calendar" && (
          <Card className="border-zinc-200/90 dark:border-white/10 shadow-sm bg-white dark:bg-zinc-950">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-zinc-200/80 dark:border-white/10">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <CalendarIcon className="size-4.5 text-blue-500" />
                  {selectedClass} ({selectedSection}) — {monthLabel}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Click any day to immediately access, review, or update that day&apos;s attendance roll call.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Weekdays */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-zinc-400 mb-2">
                <span className="text-red-500/80">Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {dayCells.map((cell) => {
                  if (cell.empty || !cell.dStr) {
                    return (
                      <div
                        key={cell.key}
                        className="min-h-[76px] rounded-xl bg-zinc-50/30 dark:bg-white/[0.01]"
                      />
                    );
                  }

                  const { dayNum, dStr, isSunday, isToday, isSelected, summary } = cell;
                  const isFuture = dStr > todayStr;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={isFuture}
                      onClick={() => {
                        if (isFuture) {
                          toast.error(`Cannot access ${dStr} because it is in the future.`);
                          return;
                        }
                        setSelectedDate(dStr);
                        setActiveView("rollcall");
                      }}
                      className={cn(
                        "min-h-[76px] rounded-xl p-2 border text-left flex flex-col justify-between transition-all group",
                        isFuture
                          ? "border-zinc-200/40 bg-zinc-100/40 dark:border-white/5 dark:bg-white/[0.01] opacity-40 cursor-not-allowed"
                          : isSelected
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/20 cursor-pointer"
                          : summary
                          ? "border-emerald-500/30 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.03] cursor-pointer hover:border-emerald-500/60 hover:shadow-sm"
                          : isSunday
                          ? "border-zinc-200/40 bg-zinc-100/40 dark:border-white/5 dark:bg-white/[0.02] cursor-pointer hover:border-zinc-300 dark:hover:border-white/10"
                          : "border-zinc-200/70 bg-white dark:border-white/10 dark:bg-zinc-900/40 cursor-pointer hover:border-blue-500/60 hover:shadow-sm"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={cn(
                            "size-5 rounded-full flex items-center justify-center text-xs font-bold font-mono",
                            isToday
                              ? "bg-blue-600 text-white"
                              : isFuture
                              ? "text-zinc-400 dark:text-zinc-600"
                              : isSunday
                              ? "text-red-500/80"
                              : "text-zinc-700 dark:text-zinc-300"
                          )}
                        >
                          {dayNum}
                        </span>
                        {summary && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {summary.presentPercent}%
                          </span>
                        )}
                      </div>

                      <div className="w-full mt-1">
                        {isFuture ? (
                          <p className="text-[10px] text-zinc-400 font-medium">Future</p>
                        ) : summary ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <span>P: {summary.presentCount}</span>
                              {summary.absentCount > 0 && (
                                <span className="text-red-500">A: {summary.absentCount}</span>
                              )}
                            </div>
                            <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${summary.presentPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : isSunday ? (
                          <p className="text-[10px] text-zinc-400 font-medium">Off</p>
                        ) : (
                          <p className="text-[10px] text-zinc-300 dark:text-zinc-600 group-hover:text-blue-500 transition-colors">
                            View &gt;
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )}

      {/* 1. MOBILE STUDENT DAILY ROLL CALL BOTTOM SHEET */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {mobileRollCallOpen && (
              <div className="md:hidden fixed inset-0 z-[10000] flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setMobileRollCallOpen(false)}
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 280 }}
                  className="relative z-10 w-full max-h-[92dvh] flex flex-col rounded-t-[28px] border-t border-zinc-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
                >
                  {/* Pinned Top-Right Corner Close Button */}
                  <button
                    type="button"
                    onClick={() => setMobileRollCallOpen(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Drag Handle */}
                  <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 pr-14">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                          {selectedClass} — {selectedSection}
                        </h3>
                        {isRollCallSubmitted && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 shadow-2xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Submitted
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Student Roll Call for {selectedDate}
                      </p>
                    </div>
                  </div>
                  <Separator />

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-12">
                    <StudentAttendanceBoard
                      classId={selectedClass}
                      sectionId={selectedSection}
                      wingId={selectedWing}
                      dateStr={selectedDate}
                      embedded={true}
                      onSubmittedChange={setIsRollCallSubmitted}
                      onSwitchConsumed={handleSwitchConsumed}
                      onRequestSwitch={handleOpenSwitchModal}
                      onBackToMyClass={handleBackToMyClass}
                    />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 2. MOBILE MONTHLY CLASS CALENDAR BOTTOM SHEET */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {mobileCalendarOpen && (
              <div className="md:hidden fixed inset-0 z-[10000] flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setMobileCalendarOpen(false)}
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 280 }}
                  className="relative z-10 w-full max-h-[92dvh] flex flex-col rounded-t-[28px] border-t border-zinc-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
                >
                  {/* Pinned Top-Right Corner Close Button */}
                  <button
                    type="button"
                    onClick={() => setMobileCalendarOpen(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Drag Handle */}
                  <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 pr-14">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <CalendarIcon className="size-4 text-blue-500" />
                        {selectedClass} ({selectedSection})
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        {monthLabel} • Tap any day to open roll call
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mr-1">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                  <Separator />

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-12">
                    {/* Weekdays */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-400 mb-2">
                      <span className="text-red-500/80">Sun</span>
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {dayCells.map((cell) => {
                        if (cell.empty || !cell.dStr) {
                          return (
                            <div
                              key={cell.key}
                              className="min-h-[64px] rounded-xl bg-zinc-50/30 dark:bg-white/[0.01]"
                            />
                          );
                        }

                        const { dayNum, dStr, isSunday, isToday, isSelected, summary } = cell;
                        const isFuture = dStr > todayStr;

                        return (
                          <button
                            key={cell.key}
                            type="button"
                            disabled={isFuture}
                            onClick={() => {
                              if (isFuture) {
                                toast.error(`Cannot access ${dStr} because it is in the future.`);
                                return;
                              }
                              setSelectedDate(dStr);
                              setMobileCalendarOpen(false);
                              setMobileRollCallOpen(true);
                            }}
                            className={cn(
                              "min-h-[64px] rounded-xl p-1.5 border text-left flex flex-col justify-between transition-all active:scale-95",
                              isFuture
                                ? "border-zinc-200/40 bg-zinc-100/40 dark:border-white/5 dark:bg-white/[0.01] opacity-40"
                                : isSelected
                                ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/20"
                                : summary
                                ? "border-emerald-500/30 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.03]"
                                : isSunday
                                ? "border-zinc-200/40 bg-zinc-100/40 dark:border-white/5 dark:bg-white/[0.02]"
                                : "border-zinc-200/70 bg-white dark:border-white/10 dark:bg-zinc-900/40"
                            )}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span
                                className={cn(
                                  "size-4 rounded-full flex items-center justify-center text-[10px] font-bold font-mono",
                                  isToday
                                    ? "bg-blue-600 text-white"
                                    : isFuture
                                    ? "text-zinc-400 dark:text-zinc-600"
                                    : isSunday
                                    ? "text-red-500/80"
                                    : "text-zinc-700 dark:text-zinc-300"
                                )}
                              >
                                {dayNum}
                              </span>
                              {summary && (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                                  {summary.presentPercent}%
                                </span>
                              )}
                            </div>

                            <div className="w-full mt-1">
                              {isFuture ? (
                                <p className="text-[9px] text-zinc-400 font-medium">Future</p>
                              ) : summary ? (
                                <div className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <span>P:{summary.presentCount}</span>
                                  {summary.absentCount > 0 && (
                                    <span className="text-red-500 ml-1">A:{summary.absentCount}</span>
                                  )}
                                </div>
                              ) : isSunday ? (
                                <p className="text-[9px] text-zinc-400 font-medium">Off</p>
                              ) : (
                                <p className="text-[9px] text-zinc-400">View &gt;</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 3. MOBILE CLASS TOOLS & ROSTER BOTTOM SHEET */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {mobileToolsOpen && (
              <div className="md:hidden fixed inset-0 z-[10000] flex flex-col justify-end">
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
                  className="relative z-10 w-full max-h-[85dvh] flex flex-col rounded-t-[28px] border-t border-zinc-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
                >
                  {/* Pinned Top-Right Corner Close Button */}
                  <button
                    type="button"
                    onClick={() => setMobileToolsOpen(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Drag Handle */}
                  <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 pr-14">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <SlidersHorizontal className="size-4 text-amber-500" />
                        Class Tools &amp; Settings
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        Roll call date selection &amp; shortcuts
                      </p>
                    </div>
                  </div>
                  <Separator />

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4 pb-12">


                    {/* Date Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                        Roll Call Date
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDate(todayStr)}
                          className={cn(
                            "h-11 px-4 text-xs font-bold rounded-xl border transition-all",
                            selectedDate === todayStr
                              ? "bg-blue-600 text-white border-blue-600"
                              : "border-zinc-300 dark:border-white/15"
                          )}
                        >
                          Today
                        </button>
                        <div className="flex-1">
                          <AppDatePicker
                            value={selectedDate}
                            max={todayStr}
                            onChange={(val) => {
                              if (!val) return;
                              if (val > todayStr) {
                                toast.error(`Cannot access ${val} because it is in the future.`);
                                return;
                              }
                              setSelectedDate(val);
                            }}
                            title="Roll Call Date"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Navigation Buttons */}
                    <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-white/10">
                      <Button
                        type="button"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          setMobileRollCallOpen(true);
                        }}
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl gap-2 shadow-sm"
                      >
                        <Users className="size-4" />
                        Open Daily Roll Call for {selectedDate}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          setMobileCalendarOpen(true);
                        }}
                        className="w-full h-11 border-zinc-200 dark:border-white/15 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-xl gap-2"
                      >
                        <CalendarIcon className="size-4 text-blue-500" />
                        Open Monthly Class Calendar
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
      {/* 4. CLASS SWITCH REQUEST MODAL (Admin Approval Required) */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isSwitchModalOpen && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => !submittingSwitch && setIsSwitchModalOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="relative z-10 w-full max-w-lg rounded-3xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-zinc-950 p-6 shadow-2xl space-y-5"
                >
                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setIsSwitchModalOpen(false)}
                    disabled={submittingSwitch}
                    className="absolute top-4 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>

                  <div className="pr-10 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Shuffle className="size-5" />
                      </span>
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        Request Class Switch
                      </h2>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Submit a temporary 1-time attendance marking request to school administration for another class in your category.
                    </p>
                  </div>

                  {/* Category Read-only Badge */}
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs flex items-center justify-between">
                    <span className="text-zinc-500">Your Category:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {config.wings.find((w) => w.id === selectedWing)?.name || selectedWing}
                    </span>
                  </div>

                  <form onSubmit={handleSendSwitchRequest} className="space-y-4">
                    {switchAvailableClasses.length === 0 ? (
                      <div className="p-3 text-xs rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                        All classes and sections in your category are currently assigned to teachers. There are no available unassigned classes to switch to.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            Target Class
                          </label>
                          <AppSelect
                            value={targetClass || switchAvailableClasses[0] || ""}
                            onChange={(nextClass) => {
                              setTargetClass(nextClass);
                              const secs = getSectionsForClass(config, nextClass).filter(
                                (s) =>
                                  !(nextClass === user?.schoolClassId && s === user?.schoolSectionId) &&
                                  !isSectionAssigned(nextClass, s)
                              );
                              if (secs[0]) setTargetSection(secs[0]);
                            }}
                            options={switchAvailableClasses.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                            title="Select Target Class"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            Target Section
                          </label>
                          <AppSelect
                            value={targetSection || (switchAvailableSections[0] ?? "")}
                            onChange={setTargetSection}
                            options={switchAvailableSections.map((s) => ({ value: s, label: s }))}
                            title="Select Target Section"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Why do you need to switch? (Reason for Admin)
                      </label>
                      <textarea
                        value={switchReason}
                        onChange={(e) => setSwitchReason(e.target.value)}
                        required
                        rows={3}
                        placeholder="e.g. Primary teacher is on leave today, need to take roll call for Class 2"
                        className="w-full rounded-xl border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={submittingSwitch}
                        onClick={() => setIsSwitchModalOpen(false)}
                        className="text-xs font-bold"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          submittingSwitch ||
                          !switchReason.trim() ||
                          switchAvailableClasses.length === 0 ||
                          !targetClass ||
                          !targetSection
                        }
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1.5"
                      >
                        {submittingSwitch ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" /> Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="size-3.5" /> Submit Request to Admin
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 5. ASSIGN ME AS CLASS TEACHER MODAL */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isAssignModalOpen && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => !submittingAssign && setIsAssignModalOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="relative z-10 w-full max-w-lg rounded-3xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-zinc-950 p-6 shadow-2xl space-y-5"
                >
                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    disabled={submittingAssign}
                    className="absolute top-4 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>

                  <div className="pr-10 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <UserCheck className="size-5" />
                      </span>
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        Request Class Teacher Appointment
                      </h2>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Choose the wing, class, and section you are appointed to teach. Your request will be sent to School Administration for review and approval before access is granted.
                    </p>
                  </div>

                  <form onSubmit={handleAssignMe} className="space-y-4">
                    {/* Category / Wing Selection */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        School Wing / Category
                      </label>
                      <AppSelect
                        value={assignWing}
                        onChange={(wId) => {
                          setAssignWing(wId);
                          const w = config.wings.find((x) => x.id === wId);
                          const unassignedClasses = (w?.classes || []).filter((c) => {
                            const secs = getSectionsForClass(config, c);
                            return secs.some((s) => !isSectionAssigned(c, s));
                          });
                          if (unassignedClasses[0]) {
                            setAssignClass(unassignedClasses[0]);
                            const secs = getSectionsForClass(config, unassignedClasses[0]).filter(
                              (s) => !isSectionAssigned(unassignedClasses[0], s)
                            );
                            if (secs[0]) setAssignSection(secs[0]);
                          } else {
                            setAssignClass("");
                            setAssignSection("");
                          }
                        }}
                        options={config.wings.map((w) => ({ value: w.id, label: w.name }))}
                        title="Select School Category"
                      />
                    </div>

                    {assignAvailableClasses.length === 0 ? (
                      <div className="p-3 text-xs rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                        All classes and sections in this category are currently assigned to teachers.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            Class
                          </label>
                          <AppSelect
                            value={assignClass || assignAvailableClasses[0] || ""}
                            onChange={(c) => {
                              setAssignClass(c);
                              const secs = getSectionsForClass(config, c).filter((s) => !isSectionAssigned(c, s));
                              if (secs[0]) setAssignSection(secs[0]);
                            }}
                            options={assignAvailableClasses.map((c) => ({
                              value: c,
                              label: c,
                            }))}
                            title="Select Class"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            Section
                          </label>
                          <AppSelect
                            value={assignSection || assignAvailableSections[0] || ""}
                            onChange={setAssignSection}
                            options={assignAvailableSections.map((s) => ({ value: s, label: s }))}
                            title="Select Section"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Optional Notes (for Administration)
                      </label>
                      <textarea
                        value={assignReason}
                        onChange={(e) => setAssignReason(e.target.value)}
                        rows={2}
                        placeholder="e.g. Appointed as Class Incharge for the new session"
                        className="w-full rounded-xl border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={submittingAssign}
                        onClick={() => setIsAssignModalOpen(false)}
                        className="text-xs font-bold"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={submittingAssign || !assignClass || !assignSection}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1.5"
                      >
                        {submittingAssign ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" /> Submitting Request...
                          </>
                        ) : (
                          <>
                            <Send className="size-3.5" /> Submit Request to Admin
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 6. DANGER ZONE CONFIRMATION MODAL (FOR UNASSIGN SELF) */}
      <DangerConfirmModal
        open={unassignConfirmOpen}
        onClose={() => setUnassignConfirmOpen(false)}
        onConfirm={handleUnassignSelf}
        title="Danger zone"
        subtitle="Remove yourself as Class Teacher"
        description={
          <span>
            Are you sure you want to remove yourself as Class Teacher for{" "}
            <strong className="text-white font-semibold">
              {user?.schoolClassId ?? "your class"} ({user?.schoolSectionId ?? "Section"})
            </strong>
            ? You will immediately lose access to this class&apos;s daily attendance roster until you assign yourself to a class again.
          </span>
        }
        confirmText="Remove myself as Class Teacher"
        cancelText="Cancel"
        loading={unassigning}
        variant="danger"
      />
    </div>
  );
}
