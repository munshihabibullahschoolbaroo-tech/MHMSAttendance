"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  LogIn,
  LogOut,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FilePlus2,
  FileCheck,
  ChevronRight,
  X,
  FileText,
  Trash2,
  Briefcase,
  Send,
  Building,
  Moon,
  Sunrise,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { toast } from "sonner";
import { cn, resolveDocumentViewUrl } from "@/lib/utils";
import { compressImageForUpload } from "@/lib/client/compress-image";
import { motion, AnimatePresence } from "framer-motion";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import { AppSelect } from "@/components/ui/app-select";
import { Separator } from "@/components/ui/separator";
import { MediaPreviewModal } from "@/components/ui/media-preview-modal";
import { isPastLateCutoff, checkSignOutTiming } from "@/lib/date/late-check";
import { TeacherHomeSkeleton } from "@/components/client/dashboard-skeletons";

function formatCheckInTime(raw: any): string {
  if (!raw) return "Today";
  let ms: number | null = null;
  if (typeof raw === "number") {
    ms = raw > 1e11 ? raw : raw * 1000;
  } else if (typeof raw === "string") {
    const p = Date.parse(raw);
    if (!isNaN(p)) ms = p;
  } else if (typeof raw === "object") {
    if (typeof raw.seconds === "number") ms = raw.seconds * 1000;
    else if (typeof raw._seconds === "number") ms = raw._seconds * 1000;
    else if (typeof raw.toMillis === "function") ms = raw.toMillis();
    else if (typeof raw.toDate === "function") ms = raw.toDate().getTime();
  }
  if (!ms || isNaN(ms)) return "Today";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCheckInDate(raw: any): string | null {
  if (!raw) return null;
  let ms: number | null = null;
  if (typeof raw === "number") {
    ms = raw > 1e11 ? raw : raw * 1000;
  } else if (typeof raw === "string") {
    const p = Date.parse(raw);
    if (!isNaN(p)) ms = p;
  } else if (typeof raw === "object") {
    if (typeof raw.seconds === "number") ms = raw.seconds * 1000;
    else if (typeof raw._seconds === "number") ms = raw._seconds * 1000;
    else if (typeof raw.toMillis === "function") ms = raw.toMillis();
    else if (typeof raw.toDate === "function") ms = raw.toDate().getTime();
  }
  if (!ms || isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

type TodayPayload = {
  date: string;
  config: {
    name: string;
    campusName: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    schoolOpenTime?: string;
    teacherLateTime?: string;
    schoolCloseTime?: string;
    schoolSignOutDeadline?: string;
    signOutGraceHours?: number;
  };
  teacher: {
    name: string;
    wingId: string;
    position: string;
    designation: string;
    isClassTeacher: boolean;
    schoolClassId: string | null;
    schoolSectionId: string | null;
    casualLeavesThisMonth: number;
    maxCasualLeavesAllowed: number;
    carriedForwardCasualLeaves?: number;
    remainingCasualLeaves?: number;
  };
  session: {
    checkInTime?: { seconds?: number; _seconds?: number } | string | number | null;
    checkOutTime?: { seconds?: number; _seconds?: number } | string | number | null;
    checkInGps?: { distanceM: number };
    status?: string;
    isLate?: boolean;
    lateSignOutRequest?: {
      isLate: boolean;
      minutesLate: number;
      reason: string;
      status: "pending" | "approved" | "rejected";
      timeFormatted?: string;
    } | null;
    emergencyLeave?: {
      active: boolean;
      type: "school_duty" | "emergency";
      departureTime: string;
      willReturn: boolean;
      returnTime?: string | null;
      reason: string;
      status: "pending" | "approved" | "rejected";
    } | null;
  } | null;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  leave: {
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
  } | null;
};

export function TeacherAttendanceHome() {
  const { user } = useDashboardUser();
  const [mounted, setMounted] = React.useState(false);
  const [data, setData] = React.useState<TodayPayload | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("mhms_today_state_v1");
        if (raw) return JSON.parse(raw) as TodayPayload;
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = React.useState(() => {
    if (typeof window !== "undefined") {
      try {
        if (sessionStorage.getItem("mhms_today_state_v1")) return false;
      } catch {}
    }
    return true;
  });
  const [punching, setPunching] = React.useState(false);
  const [punchOutConfirmOpen, setPunchOutConfirmOpen] = React.useState(false);
  const [lateWarningModalOpen, setLateWarningModalOpen] = React.useState(false);
  const [lateCheckData, setLateCheckData] = React.useState<{
    currentFormatted: string;
    cutoffFormatted: string;
    openWindowStartFormatted?: string;
    minutesLate: number;
    minutesUntilOpen?: number;
    reason?: "before_open" | "morning_cutoff" | "after_closing";
    openFormatted?: string;
    closeFormatted?: string;
    isBeforeOpen?: boolean;
    isClosed?: boolean;
  } | null>(null);

  // Late Sign-Out state (After 7:00 PM requires reason / admin approval)
  const [lateSignOutModalOpen, setLateSignOutModalOpen] = React.useState(false);
  const [lateSignOutReason, setLateSignOutReason] = React.useState("");
  const [lateSignOutTimingInfo, setLateSignOutTimingInfo] = React.useState<{
    isLateSignOut: boolean;
    minutesLate: number;
    currentFormatted: string;
    signOutDeadlineFormatted: string;
  } | null>(null);

  // Mobile Bottom Sheet state: "punch" | "leave" | "emergency" | null
  const [activeSheet, setActiveSheet] = React.useState<"punch" | "leave" | "emergency" | null>(null);

  // GPS state
  const [gpsCoords, setGpsCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = React.useState<string | null>(null);

  // Leave Form state
  const [leaveModalOpen, setLeaveModalOpen] = React.useState(false);
  const [leaveType, setLeaveType] = React.useState<"casual" | "medical">("casual");
  const [leaveStart, setLeaveStart] = React.useState("");
  const [leaveEnd, setLeaveEnd] = React.useState("");
  const [leaveReason, setLeaveReason] = React.useState("");
  const [leaveDocs, setLeaveDocs] = React.useState<Array<{ url: string; name: string; sizeFormatted?: string }>>([]);
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const [submittingLeave, setSubmittingLeave] = React.useState(false);
  const [previewTarget, setPreviewTarget] = React.useState<{ url: string; title: string } | null>(null);

  // Emergency Leave / On-Duty Departure state
  const [emergencyModalOpen, setEmergencyModalOpen] = React.useState(false);
  const [emergencyType, setEmergencyType] = React.useState<"school_duty" | "emergency">("school_duty");
  const [emergencyDepartureTime, setEmergencyDepartureTime] = React.useState("10:30");
  const [emergencyWillReturn, setEmergencyWillReturn] = React.useState(true);
  const [emergencyReturnTime, setEmergencyReturnTime] = React.useState("14:00");
  const [emergencyReason, setEmergencyReason] = React.useState("");
  const [emergencyAdminUid, setEmergencyAdminUid] = React.useState("");
  const [submittingEmergency, setSubmittingEmergency] = React.useState(false);
  const [adminsList, setAdminsList] = React.useState<
    Array<{ id: string; name: string; email: string; role?: string }>
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("mhms_admins_list_v1");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    async function loadAdmins() {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const res = await fetch("/api/school/admins", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const list = json.admins ?? [];
          setAdminsList(list);
          try {
            sessionStorage.setItem("mhms_admins_list_v1", JSON.stringify(list));
          } catch {}
          if (list.length > 0) {
            setEmergencyAdminUid(list[0].id);
          }
        }
      } catch (err) {
        console.warn("Could not fetch admins:", err);
      }
    }
    void loadAdmins();
  }, []);

  // Prevent background scrolling when mobile bottom sheet or desktop modal is open
  React.useEffect(() => {
    if (activeSheet || leaveModalOpen || lateWarningModalOpen || emergencyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeSheet, leaveModalOpen, lateWarningModalOpen, emergencyModalOpen]);

  // Exact dates requested in modal
  const requestedDates = React.useMemo(() => {
    if (!leaveStart || !leaveEnd) return [];
    const d1 = new Date(leaveStart + "T00:00:00Z");
    const d2 = new Date(leaveEnd + "T00:00:00Z");
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d1 > d2) return [];
    const dates: string[] = [];
    const curr = new Date(d1);
    while (curr <= d2) {
      const yyyy = curr.getUTCFullYear();
      const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(curr.getUTCDate()).padStart(2, "0");
      dates.push(`${yyyy}-${mm}-${dd}`);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return dates;
  }, [leaveStart, leaveEnd]);

  const requestedDaysCount = requestedDates.length;

  // Fetch status
  const refreshStatus = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/school/attendance/today", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as TodayPayload;
        setData(json);
        try {
          sessionStorage.setItem("mhms_today_state_v1", JSON.stringify(json));
        } catch {}
        if (!leaveStart) setLeaveStart(json.date);
        if (!leaveEnd) setLeaveEnd(json.date);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [leaveStart, leaveEnd]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Live clock updated every 30 seconds
  const [currentTime, setCurrentTime] = React.useState<Date>(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Real-time evaluation of check-in opening (2 hours prior), late cutoff, and school closing
  const lateCheckInfo = React.useMemo(() => {
    return isPastLateCutoff(
      currentTime,
      data?.config?.teacherLateTime || "09:00 AM",
      "Asia/Kolkata",
      data?.config?.schoolCloseTime || "05:00 PM",
      data?.config?.schoolOpenTime || "08:00 AM"
    );
  }, [currentTime, data?.config?.teacherLateTime, data?.config?.schoolCloseTime, data?.config?.schoolOpenTime]);

  // Track calendar day rollover (Asia/Kolkata) so after 12:00 AM midnight, it refreshes to the new day automatically
  React.useEffect(() => {
    const checkDayRollover = () => {
      const todayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      if (data?.date && data.date !== todayKey) {
        // Midnight has passed! Reset modal and refetch fresh session for the new day
        setLateWarningModalOpen(false);
        setLateCheckData(null);
        void refreshStatus();
      }
    };

    // Check periodically
    const interval = setInterval(checkDayRollover, 15000);

    // Also check on tab focus and visibility change (e.g. phone unlocked in morning)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDayRollover();
        void refreshStatus();
      }
    };
    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [data?.date, refreshStatus]);

  // Request browser GPS position
  React.useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => {
        setGpsError(err.message || "Could not acquire GPS position.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Close drawer or modal on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveSheet(null);
        setLeaveModalOpen(false);
        setLateWarningModalOpen(false);
        setEmergencyModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Submit Emergency Leave / On-Duty Departure
  const handleSubmitEmergencyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyReason.trim()) {
      toast.error("Please describe the official errand or emergency reason.");
      return;
    }
    setSubmittingEmergency(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/attendance/emergency-leave", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: emergencyType,
          departureTime: emergencyDepartureTime,
          willReturn: emergencyWillReturn,
          returnTime: emergencyWillReturn ? emergencyReturnTime : null,
          reason: emergencyReason.trim(),
          assigneeAdminUid: emergencyAdminUid || null,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error ?? "Failed to submit departure request");

      toast.success(resJson.message ?? "Departure request submitted!");
      setEmergencyModalOpen(false);
      setActiveSheet(null);
      setEmergencyReason("");
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit departure request");
    } finally {
      setSubmittingEmergency(false);
    }
  };

  // Core execution of Punch In
  const executePunchIn = async () => {
    if (!gpsCoords) {
      toast.error("Waiting for GPS location fix. Please allow location access.");
      return;
    }
    setPunching(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/attendance/check-in", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: gpsCoords.lat,
          longitude: gpsCoords.lng,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error ?? "Check-in failed");

      if (resJson.isLate) {
        toast.warning(resJson.message ?? "Checked in. Late arrival logged.");
      } else {
        toast.success(resJson.message ?? "Checked in successfully!");
      }
      setLateWarningModalOpen(false);
      await refreshStatus();
      setActiveSheet(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to check in");
    } finally {
      setPunching(false);
    }
  };

  // Punch In Handler with early arrival window, late arrival detection and school closed enforcement
  const handlePunchIn = () => {
    const cutoffStr = data?.config?.teacherLateTime || "09:00 AM";
    const closeStr = data?.config?.schoolCloseTime || "05:00 PM";
    const openStr = data?.config?.schoolOpenTime || "08:00 AM";
    const check = isPastLateCutoff(new Date(), cutoffStr, "Asia/Kolkata", closeStr, openStr);

    if (check.isBeforeOpen) {
      setLateCheckData({
        currentFormatted: check.currentFormatted,
        cutoffFormatted: check.cutoffFormatted,
        openWindowStartFormatted: check.openWindowStartFormatted,
        minutesLate: 0,
        minutesUntilOpen: check.minutesUntilOpen,
        reason: "before_open",
        openFormatted: check.openFormatted,
        closeFormatted: check.closeFormatted,
        isBeforeOpen: true,
        isClosed: false,
      });
      setActiveSheet(null);
      setLateWarningModalOpen(true);
      return;
    }

    if (check.isClosed) {
      setLateCheckData({
        currentFormatted: check.currentFormatted,
        cutoffFormatted: check.cutoffFormatted,
        openWindowStartFormatted: check.openWindowStartFormatted,
        minutesLate: check.minutesLate,
        reason: "after_closing",
        openFormatted: check.openFormatted,
        closeFormatted: check.closeFormatted,
        isBeforeOpen: false,
        isClosed: true,
      });
      setActiveSheet(null);
      setLateWarningModalOpen(true);
      return;
    }

    if (check.isLate) {
      setLateCheckData({
        currentFormatted: check.currentFormatted,
        cutoffFormatted: check.cutoffFormatted,
        openWindowStartFormatted: check.openWindowStartFormatted,
        minutesLate: check.minutesLate,
        reason: "morning_cutoff",
        openFormatted: check.openFormatted,
        closeFormatted: check.closeFormatted,
        isBeforeOpen: false,
        isClosed: false,
      });
      setActiveSheet(null);
      setLateWarningModalOpen(true);
      return;
    }

    void executePunchIn();
  };

  // Initiate Punch Out — checks if past sign-out deadline (e.g. 07:00 PM)
  const initiatePunchOut = () => {
    const deadline = data?.config?.schoolSignOutDeadline || "07:00 PM";
    const closeTime = data?.config?.schoolCloseTime || "05:00 PM";
    const check = checkSignOutTiming(new Date(), deadline, "Asia/Kolkata", closeTime);

    if (check.isLateSignOut) {
      setLateSignOutTimingInfo(check);
      setActiveSheet(null);
      setPunchOutConfirmOpen(false);
      setLateSignOutModalOpen(true);
      return;
    }

    setActiveSheet(null);
    setPunchOutConfirmOpen(true);
  };

  // Punch Out Handler (On-time, requires campus GPS geofence validation)
  const handlePunchOut = async () => {
    if (!gpsCoords) {
      toast.error("Waiting for GPS location fix. You must be inside school campus to check out.");
      return;
    }
    setPunching(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/attendance/check-out", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: gpsCoords.lat,
          longitude: gpsCoords.lng,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error ?? "Check-out failed");

      toast.success(resJson.message ?? "Checked out from school successfully!");
      setPunchOutConfirmOpen(false);
      await refreshStatus();
      setActiveSheet(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to check out");
    } finally {
      setPunching(false);
    }
  };

  // Late Sign-Out submission handler (allows remote sign-out, requires reason, sends for admin approval)
  const submitLateSignOut = async () => {
    if (!lateSignOutReason.trim() || lateSignOutReason.trim().length < 3) {
      toast.error("Please provide a reason explaining why you are signing out late.");
      return;
    }

    setPunching(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/attendance/check-out", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: gpsCoords?.lat ?? null,
          longitude: gpsCoords?.lng ?? null,
          reason: lateSignOutReason.trim(),
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error ?? "Submission failed");

      toast.success(resJson.message ?? "Late sign-out request submitted for administration approval!");
      setLateSignOutModalOpen(false);
      setLateSignOutReason("");
      await refreshStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit late sign-out request");
    } finally {
      setPunching(false);
    }
  };

  // File upload for Medical Leave certificate(s)
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    for (const f of files) {
      const isImage = f.type.startsWith("image/") && !f.name.toLowerCase().endsWith(".pdf");
      if (!isImage) {
        toast.error(`"${f.name}" is not an image. Only photo/image files (JPG, PNG, WebP) are allowed.`);
        e.target.value = "";
        return;
      }
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds 8MB limit`);
        return;
      }
    }

    setUploadingDoc(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const uploadedList: Array<{ url: string; name: string; sizeFormatted?: string }> = [];

      for (const file of files) {
        // Optimize & compress image file client-side (reduces 3-8MB phone camera photos to ~35-85KB WebP)
        const uploadFile = await compressImageForUpload(file);

        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("folder", "leave_docs");

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const uploadData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(uploadData.error ?? `Failed to upload "${file.name}"`);

        const sizeKb = Math.round(uploadFile.size / 1024);
        uploadedList.push({
          url: uploadData.url,
          name: file.name,
          sizeFormatted: `${sizeKb} KB`,
        });
      }

      setLeaveDocs((prev) => [...prev, ...uploadedList]);
      toast.success(
        uploadedList.length === 1
          ? "Medical photo attached!"
          : `${uploadedList.length} medical photos attached!`
      );
      e.target.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeLeaveDoc = async (indexToRemove: number) => {
    const docToRemove = leaveDocs[indexToRemove];
    setLeaveDocs((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (docToRemove?.url) {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (u) {
          const token = await u.getIdToken();
          await fetch("/api/upload", {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: docToRemove.url }),
          });
        }
      } catch (err) {
        console.warn("Failed to delete blob from storage:", err);
      }
    }
    toast.info("Document removed and deleted from storage");
  };

  // Submit Leave Application
  const submitLeaveApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leaveType === "medical" && leaveDocs.length === 0) {
      toast.error("Please upload at least one medical certificate or doctor note.");
      return;
    }

    const maxAllowed = teacher?.maxCasualLeavesAllowed ?? 2;
    if (leaveType === "casual") {
      if (requestedDaysCount > maxAllowed) {
        toast.error(`Casual leave cannot exceed ${maxAllowed} day(s) for this month (including carried forward days).`);
        return;
      }
      const used = teacher?.casualLeavesThisMonth ?? 0;
      if (used + requestedDaysCount > maxAllowed) {
        toast.error(
          `Casual leave quota exceeded. You already have ${used} day(s) used this month. Max ${maxAllowed} days allowed.`
        );
        return;
      }
    }

    setSubmittingLeave(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const docUrls = leaveDocs.map((d) => d.url);

      const res = await fetch("/api/school/leave", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: leaveType,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: leaveReason.trim(),
          documentUrl: docUrls[0] || undefined,
          documentUrls: docUrls,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Leave request failed");

      toast.success("Leave application submitted to School Admin!");
      setLeaveModalOpen(false);
      setActiveSheet(null);
      setLeaveReason("");
      setLeaveDocs([]);
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error submitting leave");
    } finally {
      setSubmittingLeave(false);
    }
  };

  if (loading) {
    return <TeacherHomeSkeleton />;
  }

  const isCheckedIn = data?.isCheckedIn ?? false;
  const isCheckedOut = data?.isCheckedOut ?? false;
  const leave = data?.leave ?? null;
  const teacher = data?.teacher;
  const config = data?.config;

  // Render leave form content (reused in desktop modal and mobile bottom sheet)
  const renderLeaveForm = () => (
    <form onSubmit={(e) => void submitLeaveApplication(e)} className="space-y-4">
      {/* Leave Type Toggle */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setLeaveType("casual")}
          className={cn(
            "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all",
            leaveType === "casual"
              ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
              : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
          )}
        >
          <span className="font-semibold text-xs">Casual / Regular</span>
          <span className="text-[10px] text-zinc-500 mt-0.5">
            {teacher?.casualLeavesThisMonth ?? 0}/{teacher?.maxCasualLeavesAllowed ?? 2} used this month
          </span>
        </button>

        <button
          type="button"
          onClick={() => setLeaveType("medical")}
          className={cn(
            "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all",
            leaveType === "medical"
              ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
          )}
        >
          <span className="font-semibold text-xs">Medical Leave</span>
          <span className="text-[10px] text-zinc-500 mt-0.5">Requires doctor certificate</span>
        </button>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 text-xs">
          <span className={formFieldLabelClass}>Start Date</span>
          <AppDatePicker
            value={leaveStart}
            onChange={(d) => setLeaveStart(d)}
            drawerTitle="Select Start Date"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <span className={formFieldLabelClass}>End Date</span>
          <AppDatePicker
            value={leaveEnd}
            onChange={(d) => setLeaveEnd(d)}
            drawerTitle="Select End Date"
          />
        </div>
      </div>

      {/* Day Count & Quota Info */}
      {requestedDaysCount > 0 && (
        <div
          className={cn(
            "rounded-lg p-3 text-xs border space-y-1.5",
            leaveType === "casual" &&
              (requestedDaysCount > (teacher?.maxCasualLeavesAllowed ?? 2) ||
                (teacher?.casualLeavesThisMonth ?? 0) + requestedDaysCount > (teacher?.maxCasualLeavesAllowed ?? 2))
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
              : "border-blue-500/20 bg-blue-500/10 text-blue-800 dark:text-blue-300"
          )}
        >
          <div className="flex items-center justify-between font-semibold">
            <span>Requested: {requestedDaysCount} calendar day(s)</span>
            {leaveType === "casual" && (
              <span>Monthly Quota: {teacher?.casualLeavesThisMonth ?? 0}/{teacher?.maxCasualLeavesAllowed ?? 2} used</span>
            )}
          </div>
          {leaveType === "casual" && (teacher?.carriedForwardCasualLeaves ?? 0) > 0 && (
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              ✨ 2 regular + {teacher?.carriedForwardCasualLeaves} carried forward from prior months = {teacher?.maxCasualLeavesAllowed ?? 2} days available
            </p>
          )}
          {leaveType === "casual" && requestedDaysCount > (teacher?.maxCasualLeavesAllowed ?? 2) && (
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              ⚠️ Casual leave cannot exceed {teacher?.maxCasualLeavesAllowed ?? 2} days for this month.
            </p>
          )}
          {leaveType === "casual" &&
            requestedDaysCount <= (teacher?.maxCasualLeavesAllowed ?? 2) &&
            (teacher?.casualLeavesThisMonth ?? 0) + requestedDaysCount > (teacher?.maxCasualLeavesAllowed ?? 2) && (
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                ⚠️ Exceeds quota: You already have {teacher?.casualLeavesThisMonth ?? 0} casual day(s) this month (maximum {teacher?.maxCasualLeavesAllowed ?? 2} allowed).
              </p>
            )}
        </div>
      )}

      {/* Reason */}
      <label className="flex flex-col gap-1 text-xs">
        <span className={formFieldLabelClass}>Reason for Leave</span>
        <textarea
          required
          rows={3}
          value={leaveReason}
          onChange={(e) => setLeaveReason(e.target.value)}
          placeholder="Briefly state the reason for your absence…"
          className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {/* Medical Certificate Upload */}
      {leaveType === "medical" && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className={formFieldLabelClass}>
              Medical Certificate / Prescription (Photos / Images only)
            </span>
            {leaveDocs.length > 0 && (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {leaveDocs.length} attached
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={(e) => void handleDocUpload(e)}
              disabled={uploadingDoc}
              className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950/40 dark:file:text-blue-300"
            />
            {uploadingDoc && (
              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 shrink-0">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[11px]">Uploading...</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Upload doctor prescription, medical certificate or report photos (JPG, PNG, WebP).
          </p>

          {/* Attached Documents Preview & Remove List */}
          {leaveDocs.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Attached Files ({leaveDocs.length}):
              </span>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                {leaveDocs.map((doc, idx) => (
                  <div
                    key={doc.url + idx}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <span className="truncate font-medium text-zinc-800 dark:text-zinc-200" title={doc.name}>
                        {doc.name}
                      </span>
                      {doc.sizeFormatted && (
                        <span className="shrink-0 text-[10px] text-zinc-400 font-mono">
                          ({doc.sizeFormatted})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewTarget({
                            url: resolveDocumentViewUrl(doc.url),
                            title: doc.name,
                          })
                        }
                        className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLeaveDoc(idx)}
                        className="p-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Remove document"
                        aria-label={`Remove ${doc.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLeaveModalOpen(false);
            setActiveSheet(null);
          }}
          disabled={submittingLeave}
          className="text-xs"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            submittingLeave ||
            uploadingDoc ||
            (leaveType === "casual" &&
              (requestedDaysCount > (teacher?.maxCasualLeavesAllowed ?? 2) ||
                (teacher?.casualLeavesThisMonth ?? 0) + requestedDaysCount > (teacher?.maxCasualLeavesAllowed ?? 2)))
          }
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
        >
          {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit Leave Application
        </Button>
      </div>
    </form>
  );

  // Render emergency leave / on-duty form (reused in desktop modal and mobile bottom sheet)
  const renderEmergencyForm = (isBottomSheet: boolean = false) => (
    <form onSubmit={handleSubmitEmergencyLeave} className="flex flex-col flex-1 overflow-y-auto p-4 space-y-4">
      {/* Category Selector */}
      <div className="space-y-1.5">
        <span className={formFieldLabelClass}>Departure Category</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setEmergencyType("school_duty")}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer",
              emergencyType === "school_duty"
                ? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold shadow-sm"
                : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20 text-zinc-600 dark:text-zinc-400"
            )}
          >
            <Building className="size-4 mb-1 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold">Official School Duty</span>
            <span className="text-[10px] opacity-75 mt-0.5">Bank / Board / Dept work</span>
          </button>

          <button
            type="button"
            onClick={() => setEmergencyType("emergency")}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer",
              emergencyType === "emergency"
                ? "border-red-500 bg-red-500/10 text-red-900 dark:text-red-200 font-semibold shadow-sm"
                : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20 text-zinc-600 dark:text-zinc-400"
            )}
          >
            <AlertTriangle className="size-4 mb-1 text-red-500" />
            <span className="text-xs font-semibold">Emergency Departure</span>
            <span className="text-[10px] opacity-75 mt-0.5">Sudden personal / urgent</span>
          </button>
        </div>
      </div>

      {/* Time fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <AppTimePicker
            label="Departure Time *"
            value={emergencyDepartureTime}
            onChange={setEmergencyDepartureTime}
          />
        </div>

        <div className="space-y-1.5">
          <span className={formFieldLabelClass}>Will Return Today?</span>
          <div className="flex h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/50 p-1">
            <button
              type="button"
              onClick={() => setEmergencyWillReturn(true)}
              className={cn(
                "flex-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                emergencyWillReturn
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              Yes, Returning
            </button>
            <button
              type="button"
              onClick={() => setEmergencyWillReturn(false)}
              className={cn(
                "flex-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                !emergencyWillReturn
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              No, For Day
            </button>
          </div>
        </div>
      </div>

      {emergencyWillReturn && (
        <div>
          <AppTimePicker
            label="Expected Return Time"
            value={emergencyReturnTime}
            onChange={setEmergencyReturnTime}
          />
        </div>
      )}

      {/* Assign to Administrator */}
      <div className="space-y-1.5">
        <span className={formFieldLabelClass}>Notify / Assign to Admin</span>
        <AppSelect
          value={emergencyAdminUid}
          onChange={setEmergencyAdminUid}
          placeholder="Select Administrator..."
          options={adminsList.map((a) => {
            const isSuper = a.role === "super_admin";
            const roleLabel = isSuper ? "👑 Super Admin" : "🛡️ School Admin";
            return {
              value: a.id,
              label: a.name
                ? `${a.name} (${a.email}) — ${roleLabel}`
                : `${a.email} — ${roleLabel}`,
              sublabel: isSuper ? "Full administrative authority" : "School administrator",
              badge: isSuper ? "Super Admin" : "Admin",
            };
          })}
        />
      </div>

      {/* Detailed Reason */}
      <label className="flex flex-col gap-1 text-xs">
        <span className={formFieldLabelClass}>Reason & Destination *</span>
        <textarea
          required
          rows={3}
          value={emergencyReason}
          onChange={(e) => setEmergencyReason(e.target.value)}
          placeholder={
            emergencyType === "school_duty"
              ? "Specify location (e.g., J&K Bank Main Branch for payroll processing, or CEO office for registration documents)..."
              : "Briefly explain the emergency reason for early departure..."
          }
          className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
      </label>

      {/* Footer Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-white/10">
        <Button
          type="button"
          variant="outline"
          disabled={submittingEmergency}
          onClick={() => {
            if (isBottomSheet) {
              setActiveSheet(null);
            } else {
              setEmergencyModalOpen(false);
            }
          }}
          className="h-10 px-4 rounded-xl text-xs cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submittingEmergency}
          className="h-10 px-5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white gap-2 cursor-pointer shadow-md shadow-amber-600/20"
        >
          {submittingEmergency ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Submitting…</span>
            </>
          ) : (
            <>
              <Send className="size-3.5" />
              <span>Submit Departure Request</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      {/* Teacher Profile & Today Header Banner */}
      <div className="rounded-2xl border border-zinc-200/90 bg-gradient-to-r from-blue-900/10 via-blue-500/5 to-transparent p-4 md:p-6 shadow-sm dark:border-white/10 dark:from-blue-950/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {teacher?.wingId.replace(/_/g, " ").toUpperCase()}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-xs text-zinc-500">{data?.date}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-1">
              Welcome, {teacher?.name}
            </h1>
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Role: <strong className="font-semibold text-zinc-700 dark:text-zinc-300">{teacher?.designation}</strong>
              {teacher?.isClassTeacher && (
                <span>
                  {" "}• Class Incharge: <strong className="text-blue-600 dark:text-blue-400">{teacher.schoolClassId} ({teacher.schoolSectionId})</strong>
                </span>
              )}
            </p>
          </div>

          {/* Quick Leave Button (Desktop) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLeaveModalOpen(true)}
            className="hidden md:inline-flex gap-2 border-zinc-300 dark:border-white/15 text-xs font-medium self-start md:self-auto shadow-sm"
          >
            <FilePlus2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Apply for Leave
          </Button>
        </div>
      </div>

      {/* Active Leave Notification if any */}
      {leave && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-xs md:text-sm">
            <p className="font-bold">
              {leave.status === "approved" ? "On Approved Leave" : "Leave Application Pending"} ({leave.type.toUpperCase()})
            </p>
            <p className="text-xs mt-0.5 opacity-90">
              Period: {leave.startDate} to {leave.endDate} • Reason: {leave.reason}
            </p>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* MOBILE ACTION CARDS (3 Buttons - Full Card Clickable with Framer Motion) */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3 md:hidden">
        {/* Card 1: Daily Teacher Punch */}
        <motion.div
          role="button"
          tabIndex={0}
          whileTap={{ scale: 0.98 }}
          onClick={() => setActiveSheet("punch")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveSheet("punch");
            }
          }}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition-colors cursor-pointer hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Clock className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                  Daily Attendance (Check In / Out)
                </span>
                {isCheckedIn && (
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {isCheckedOut
                  ? "Day Completed • Checked out"
                  : isCheckedIn
                  ? "Checked in today • Tap for status"
                  : leave && leave.status === "approved"
                  ? "Excused on Approved Leave"
                  : "Tap to verify GPS and check in"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              {isCheckedOut ? "View >" : isCheckedIn ? "Status >" : "Check In >"}
            </span>
          </div>
        </motion.div>

        {/* Card 2: Apply for Leave */}
        <motion.div
          role="button"
          tabIndex={0}
          whileTap={{ scale: 0.98 }}
          onClick={() => setActiveSheet("leave")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveSheet("leave");
            }
          }}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition-colors cursor-pointer hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <FilePlus2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Apply for Leave
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {leave
                  ? `Active (${leave.type.toUpperCase()}) • ${leave.status}`
                  : `Casual (${teacher?.casualLeavesThisMonth ?? 0}/${teacher?.maxCasualLeavesAllowed ?? 2} used) • Medical`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              Apply &gt;
            </span>
          </div>
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* DESKTOP & TABLET VIEW */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="hidden md:block max-w-2xl mx-auto w-full">
        {/* Attendance Card */}
        <Card className="border-zinc-200 dark:border-white/10 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Daily Attendance (Check In / Out)
              </CardTitle>
              {isCheckedIn ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Checked In Today
                </span>
              ) : leave && leave.status === "approved" ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                  <FileCheck className="h-3.5 w-3.5" />
                  On Approved Leave
                </span>
              ) : lateCheckInfo.isBeforeOpen ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                  <Sunrise className="h-3.5 w-3.5 text-sky-500" />
                  Opens at {lateCheckInfo.openWindowStartFormatted}
                </span>
              ) : lateCheckInfo.isClosed ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                  <Moon className="h-3.5 w-3.5 text-indigo-500" />
                  School Closed
                </span>
              ) : (
                <span className="text-xs font-medium text-zinc-500 px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/5">
                  Not Checked In
                </span>
              )}
            </div>
            <CardDescription className="text-xs">
              Campus: {config?.name} ({config?.campusName})
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-1">
            {!isCheckedIn ? (
              leave && leave.status === "approved" ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 text-center dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                    <FileCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                      On Approved {leave.type.toUpperCase()} Leave
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      Period: <strong>{leave.startDate}</strong> to <strong>{leave.endDate}</strong>
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Reason: &ldquo;{leave.reason}&rdquo;
                    </p>
                  </div>
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 p-2.5 rounded-lg border border-blue-200/50 dark:border-blue-800/40">
                    ✓ Your leave is approved by School Administration. Daily attendance is excused for today.
                  </p>
                  <div className="pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={punching}
                      onClick={() => void handlePunchIn()}
                      className="text-xs text-zinc-600 border-zinc-300 dark:border-white/10"
                    >
                      {punching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                      Check In Anyway (If Present on Campus)
                    </Button>
                  </div>
                </div>
              ) : lateCheckInfo.isBeforeOpen ? (
                <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent p-6 text-center space-y-3.5">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 shadow-inner">
                    <Sunrise className="size-6 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                      Check-in Opens at {lateCheckInfo.openWindowStartFormatted}
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
                      Morning check-in begins strictly 2 hours before school opening ({data?.config?.schoolOpenTime || "08:00 AM"}). Current time is {lateCheckInfo.currentFormatted}.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100/70 dark:bg-sky-950/40 text-[11px] font-semibold text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40">
                    <Clock className="size-3.5 text-sky-500" />
                    <span>Check-in window: {lateCheckInfo.openWindowStartFormatted} – {data?.config?.teacherLateTime || "09:00 AM"}</span>
                  </div>
                </div>
              ) : lateCheckInfo.isClosed ? (
                <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-6 text-center space-y-3.5">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-500 dark:text-indigo-400 shadow-inner">
                    <Moon className="size-6 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                      School is Closed for Today
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
                      Campus hours officially closed at {data?.config?.schoolCloseTime || "05:00 PM"}. Attendance cannot be marked at this time. Enjoy your evening and have a wonderful rest!
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/10 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10">
                    <Clock className="size-3.5 text-indigo-500" />
                    <span>Doors reopen tomorrow morning at {data?.config?.schoolOpenTime || "08:00 AM"}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {lateCheckInfo.isLate && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                      <span>
                        Past morning cutoff ({data?.config?.teacherLateTime || "09:00 AM"}). Check-in will be recorded as late arrival.
                      </span>
                    </div>
                  )}

                  <Button
                    type="button"
                    size="lg"
                    disabled={punching}
                    onClick={() => void handlePunchIn()}
                    className="h-14 w-full gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg shadow-blue-500/20 transition-all active:scale-[0.99]"
                  >
                    {punching ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <LogIn className="h-5 w-5" />
                    )}
                    <span>{punching ? "Verifying Geofence…" : "Check In (School Arrival)"}</span>
                  </Button>
                  <p className="text-center text-[11px] text-zinc-500">
                    Validates your GPS within {config?.radiusMeters}m of school premises.
                  </p>
                </div>
              )
            ) : isCheckedOut ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Day Completed!
                </h4>
                <p className="text-xs text-zinc-500 mt-1">
                  You have successfully checked in and checked out for today. See you tomorrow!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-zinc-500">Check In Recorded:</span>
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                      {formatCheckInTime(data?.session?.checkInTime)}
                    </p>
                    {formatCheckInDate(data?.session?.checkInTime) && (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                        {formatCheckInDate(data?.session?.checkInTime)}
                      </span>
                    )}
                  </div>
                  {data?.session?.checkInGps?.distanceM !== undefined && (
                    <div className="text-right">
                      <span className="text-zinc-500">Distance:</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {data.session.checkInGps.distanceM}m to school
                      </p>
                    </div>
                  )}
                </div>

                {/* Emergency Leave / On-Duty Departure Status or Trigger */}
                {data?.session?.emergencyLeave?.active ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                        <Briefcase className="size-3.5" />
                        <span>
                          {data.session.emergencyLeave.type === "school_duty"
                            ? "🏛️ Official School Duty (OD)"
                            : "🚨 Emergency Departure"}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          data.session.emergencyLeave.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            : data.session.emergencyLeave.status === "rejected"
                            ? "bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30"
                            : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        )}
                      >
                        {data.session.emergencyLeave.status}
                      </span>
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-300 text-[11px] space-y-0.5">
                      <p>
                        <strong>Departing at:</strong> {data.session.emergencyLeave.departureTime}
                        {data.session.emergencyLeave.returnTime && (
                          <> · <strong>Expected Return:</strong> {data.session.emergencyLeave.returnTime}</>
                        )}
                      </p>
                      <p className="italic text-zinc-500 dark:text-zinc-400">
                        &quot;{data.session.emergencyLeave.reason}&quot;
                      </p>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const now = new Date();
                      const hh = String(now.getHours()).padStart(2, "0");
                      const mm = String(now.getMinutes()).padStart(2, "0");
                      setEmergencyDepartureTime(`${hh}:${mm}`);
                      setEmergencyModalOpen(true);
                    }}
                    className="w-full h-10 gap-2 border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300 font-semibold text-xs cursor-pointer rounded-xl transition-all"
                  >
                    <Briefcase className="size-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Emergency Leave / On-Duty Departure</span>
                  </Button>
                )}

                {/* Late Sign-Out Status Card: If submitted, replace Punch Out button with completion/approval card */}
                {data?.session?.lateSignOutRequest ? (
                  data.session.lateSignOutRequest.status === "approved" || isCheckedOut ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        Day Completed!
                      </h4>
                      <p className="text-xs text-zinc-500 mt-1">
                        Your late sign-out has been approved by administration. See you tomorrow!
                      </p>
                    </div>
                  ) : data.session.lateSignOutRequest.status === "rejected" ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center space-y-2">
                      <div className="flex items-center justify-center gap-1.5 text-red-600 dark:text-red-400 font-bold text-sm">
                        <AlertTriangle className="size-5" />
                        <span>Late Sign-Out Not Approved</span>
                      </div>
                      <p className="text-xs text-red-600/90 dark:text-red-400/90">
                        Administration did not approve your late sign-out request. Your attendance for today is marked as <strong>Absent</strong>. Please reach out to the school administration office if you need this reviewed.
                      </p>
                    </div>
                  ) : (
                    /* PENDING APPROVAL */
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-center space-y-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <Clock className="size-5 text-amber-600 animate-pulse" />
                        <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                          Sign-Out Submitted — Awaiting Admin Approval
                        </h4>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
                        Your late sign-out was submitted successfully. <strong>School administration will review and approve your attendance completion.</strong> Please reach out to administration once if you need immediate verification.
                      </p>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                        <span>Submitted at {data.session.lateSignOutRequest.timeFormatted || "Late Evening"}</span>
                        <span>•</span>
                        <span className="capitalize">{data.session.lateSignOutRequest.status}</span>
                      </div>
                      {data.session.lateSignOutRequest.reason && (
                        <p className="text-[11px] text-zinc-500 italic">
                          &quot;{data.session.lateSignOutRequest.reason}&quot;
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    disabled={punching}
                    onClick={initiatePunchOut}
                    className="h-12 w-full gap-2.5 border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 hover:text-red-800 dark:border-red-500/40 dark:text-red-400 font-semibold text-sm shadow-sm cursor-pointer"
                  >
                    {punching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    <span>Check Out (Sign Out from School)</span>
                  </Button>
                )}
              </div>
            )}

            {gpsError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400 border border-red-500/20">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{gpsError}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* MOBILE BOTTOM SHEETS (Slide up with Framer Motion spring physics) */}
      {/* ─────────────────────────────────────────────────────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {activeSheet && (
              <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/65 backdrop-blur-sm"
                  onClick={() => setActiveSheet(null)}
                  aria-hidden="true"
                />

                {/* Bottom Sheet Drawer */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 280 }}
                  className="relative z-10 w-full max-h-[90dvh] flex flex-col rounded-t-[28px] border-t border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
                >
                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setActiveSheet(null)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    aria-label="Close sheet"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Drag Handle Pill */}
                  <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />

                  {/* Sheet Header */}
                  <div className="px-5 py-2.5 pr-14">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {activeSheet === "punch" && "Daily Attendance (Check In / Out)"}
                        {activeSheet === "leave" && "Apply for Leave"}
                        {activeSheet === "emergency" && "Emergency Leave / On-Duty Departure"}
                      </h3>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {activeSheet === "punch" && `${config?.name} • ${config?.campusName}`}
                        {activeSheet === "leave" && "Submit an official leave request to administration"}
                        {activeSheet === "emergency" && "Leaving school campus after morning check-in"}
                      </p>
                    </div>
                  </div>
                  <Separator />

                  {/* Sheet Content (Keyboard-Safe Scrollable Viewport) */}
                  <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-4 overscroll-contain">
                    {/* 1. Punch Sheet Content */}
                    {activeSheet === "punch" && (
                      <div className="space-y-4">
                        {!isCheckedIn ? (
                          leave && leave.status === "approved" ? (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-center dark:border-blue-900/40 dark:bg-blue-950/20 space-y-2.5">
                              <FileCheck className="h-7 w-7 text-blue-600 dark:text-blue-400 mx-auto" />
                              <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                                On Approved {leave.type.toUpperCase()} Leave
                              </h4>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                Period: <strong>{leave.startDate}</strong> to <strong>{leave.endDate}</strong>
                              </p>
                              <div className="pt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={punching}
                                  onClick={() => void handlePunchIn()}
                                  className="w-full text-xs"
                                >
                                  {punching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                                  Check In Anyway (If on Campus)
                                </Button>
                              </div>
                            </div>
                          ) : (() => {
                            const check = isPastLateCutoff(
                              currentTime,
                              data?.config?.teacherLateTime || "09:00 AM",
                              "Asia/Kolkata",
                              data?.config?.schoolCloseTime || "05:00 PM",
                              data?.config?.schoolOpenTime || "08:00 AM"
                            );

                            if (check.isBeforeOpen) {
                              return (
                                <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent p-6 text-center space-y-3.5">
                                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 shadow-inner">
                                    <Sunrise className="size-6 animate-pulse" />
                                  </div>
                                  <div>
                                    <h4 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                                      Check-in Opens at {check.openWindowStartFormatted}
                                    </h4>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
                                      Morning login begins strictly 2 hours before school opening ({data?.config?.schoolOpenTime || "08:00 AM"}). Current time is {check.currentFormatted}.
                                    </p>
                                  </div>
                                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100/70 dark:bg-sky-950/40 text-[11px] font-semibold text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40">
                                    <Clock className="size-3.5 text-sky-500" />
                                    <span>Check-in window: {check.openWindowStartFormatted} – {data?.config?.teacherLateTime || "09:00 AM"}</span>
                                  </div>
                                </div>
                              );
                            }

                            if (check.isClosed) {
                              return (
                                <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-6 text-center space-y-3.5">
                                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-500 dark:text-indigo-400 shadow-inner">
                                    <Moon className="size-6 animate-pulse" />
                                  </div>
                                  <div>
                                    <h4 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                                      School is Closed for Today
                                    </h4>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
                                      Campus hours officially closed at {data?.config?.schoolCloseTime || "05:00 PM"}. Attendance cannot be marked at this time. Enjoy your evening and have a wonderful rest!
                                    </p>
                                  </div>
                                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/10 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10">
                                    <Clock className="size-3.5 text-indigo-500" />
                                    <span>Doors reopen tomorrow morning at {data?.config?.schoolOpenTime || "08:00 AM"}</span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="space-y-3">
                                {/* Amber notice if past late cutoff */}
                                {check.isLate && (
                                  <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                                    <span>
                                      Past morning cutoff ({data?.config?.teacherLateTime || "09:00 AM"}). Check-in will be recorded as late arrival.
                                    </span>
                                  </div>
                                )}

                                <Button
                                  type="button"
                                  size="lg"
                                  disabled={punching}
                                  onClick={() => void handlePunchIn()}
                                  className="h-14 w-full gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg shadow-blue-500/20 active:scale-[0.99]"
                                >
                                  {punching ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                  ) : (
                                    <LogIn className="h-5 w-5" />
                                  )}
                                  <span>{punching ? "Verifying Geofence…" : "Check In Now"}</span>
                                </Button>
                                <p className="text-center text-[11px] text-zinc-500">
                                  Validates your live GPS location inside {config?.radiusMeters}m of campus premises.
                                </p>
                              </div>
                            );
                          })()
                        ) : isCheckedOut ? (
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto mb-1.5" />
                            <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                              Day Completed!
                            </h4>
                            <p className="text-xs text-zinc-500 mt-1">
                              You have successfully checked in and checked out for today. Have a restful evening!
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-zinc-500">Check In Recorded:</span>
                                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                                  {formatCheckInTime(data?.session?.checkInTime)}
                                </p>
                                {formatCheckInDate(data?.session?.checkInTime) && (
                                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                                    {formatCheckInDate(data?.session?.checkInTime)}
                                  </span>
                                )}
                              </div>
                              {data?.session?.checkInGps?.distanceM !== undefined && (
                                <div className="text-right">
                                  <span className="text-zinc-500">Distance:</span>
                                  <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                                    {data.session.checkInGps.distanceM}m to school
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Emergency Leave / On-Duty Departure Status or Trigger */}
                            {data?.session?.emergencyLeave?.active ? (
                              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                                    <Briefcase className="size-3.5" />
                                    <span>
                                      {data.session.emergencyLeave.type === "school_duty"
                                        ? "🏛️ Official School Duty (OD)"
                                        : "🚨 Emergency Departure"}
                                    </span>
                                  </div>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                      data.session.emergencyLeave.status === "approved"
                                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                        : data.session.emergencyLeave.status === "rejected"
                                        ? "bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30"
                                        : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                    )}
                                  >
                                    {data.session.emergencyLeave.status}
                                  </span>
                                </div>
                                <div className="text-zinc-600 dark:text-zinc-300 text-[11px] space-y-0.5">
                                  <p>
                                    <strong>Departing at:</strong> {data.session.emergencyLeave.departureTime}
                                    {data.session.emergencyLeave.returnTime && (
                                      <> · <strong>Expected Return:</strong> {data.session.emergencyLeave.returnTime}</>
                                    )}
                                  </p>
                                  <p className="italic text-zinc-500 dark:text-zinc-400">
                                    &quot;{data.session.emergencyLeave.reason}&quot;
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const now = new Date();
                                  const hh = String(now.getHours()).padStart(2, "0");
                                  const mm = String(now.getMinutes()).padStart(2, "0");
                                  setEmergencyDepartureTime(`${hh}:${mm}`);
                                  setActiveSheet("emergency");
                                }}
                                className="w-full h-10 gap-2 border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300 font-semibold text-xs cursor-pointer rounded-xl transition-all"
                              >
                                <Briefcase className="size-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Emergency Leave / On-Duty Departure</span>
                              </Button>
                            )}

                            {/* Late Sign-Out Status Card: If submitted, replace Punch Out button with completion/approval card */}
                            {data?.session?.lateSignOutRequest ? (
                              data.session.lateSignOutRequest.status === "approved" || isCheckedOut ? (
                                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
                                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
                                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                                    Day Completed!
                                  </h4>
                                  <p className="text-xs text-zinc-500 mt-1">
                                    Your late sign-out has been approved by administration. See you tomorrow!
                                  </p>
                                </div>
                              ) : data.session.lateSignOutRequest.status === "rejected" ? (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center space-y-2">
                                  <div className="flex items-center justify-center gap-1.5 text-red-600 dark:text-red-400 font-bold text-sm">
                                    <AlertTriangle className="size-5" />
                                    <span>Late Sign-Out Not Approved</span>
                                  </div>
                                  <p className="text-xs text-red-600/90 dark:text-red-400/90">
                                    Administration did not approve your late sign-out request. Your attendance for today is marked as <strong>Absent</strong>. Please reach out to the school administration office if you need this reviewed.
                                  </p>
                                </div>
                              ) : (
                                /* PENDING APPROVAL */
                                <div className="rounded-2xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-center space-y-2.5">
                                  <div className="flex items-center justify-center gap-2">
                                    <Clock className="size-5 text-amber-600 animate-pulse" />
                                    <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                                      Sign-Out Submitted — Awaiting Admin Approval
                                    </h4>
                                  </div>
                                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
                                    Your late sign-out was submitted successfully. <strong>School administration will review and approve your attendance completion.</strong> Please reach out to administration once if you need immediate verification.
                                  </p>
                                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                                    <span>Submitted at {data.session.lateSignOutRequest.timeFormatted || "Late Evening"}</span>
                                    <span>•</span>
                                    <span className="capitalize">{data.session.lateSignOutRequest.status}</span>
                                  </div>
                                  {data.session.lateSignOutRequest.reason && (
                                    <p className="text-[11px] text-zinc-500 italic">
                                      &quot;{data.session.lateSignOutRequest.reason}&quot;
                                    </p>
                                  )}
                                </div>
                              )
                            ) : (
                              <div className="space-y-2">
                                <Button
                                  type="button"
                                  size="lg"
                                  variant="outline"
                                  disabled={punching}
                                  onClick={initiatePunchOut}
                                  className="h-12 w-full gap-2.5 border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:border-red-500/40 dark:text-red-400 font-semibold text-sm shadow-sm cursor-pointer"
                                >
                                  {punching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                                  <span>Check Out (Sign Out from School)</span>
                                </Button>
                                <p className="text-center text-[11px] text-zinc-500">
                                  Validates your live GPS location inside {config?.radiusMeters}m of campus to sign out.
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {gpsError && (
                          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400 border border-red-500/20">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{gpsError}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 2. Leave Sheet Content (Form with Keyboard-Safe Scroll) */}
                    {activeSheet === "leave" && renderLeaveForm()}

                    {/* 3. Emergency Sheet Content (Form with Keyboard-Safe Scroll) */}
                    {activeSheet === "emergency" && renderEmergencyForm(true)}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* DESKTOP LEAVE MODAL (Centered Modal for Large Screens) */}
      {/* ─────────────────────────────────────────────────────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {leaveModalOpen && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setLeaveModalOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="relative z-10 w-full max-w-lg"
                >
                  <Card className="relative border-zinc-200 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
                    {/* Top Right Close Button */}
                    <button
                      type="button"
                      onClick={() => setLeaveModalOpen(false)}
                      className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </button>
                    <CardHeader className="pb-3 pr-14">
                      <div>
                        <CardTitle className="text-lg font-bold">Apply for Leave</CardTitle>
                        <CardDescription className="text-xs">
                          Submit an official leave request to the School Administration.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>{renderLeaveForm()}</CardContent>
                  </Card>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* "You are late, sir!" Warning Popup Card */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {lateWarningModalOpen && (
              <div className="fixed inset-0 z-[100100] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !punching && setLateWarningModalOpen(false)}
                  className="fixed inset-0 bg-black/70 backdrop-blur-md"
                />

                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 12 }}
                  transition={{ duration: 0.2 }}
                  className="relative z-10 w-full max-w-md"
                >
                  <Card
                    className={cn(
                      "relative overflow-hidden shadow-2xl transition-all",
                      lateCheckData?.isBeforeOpen
                        ? "border-sky-500/40 shadow-sky-950/20 dark:border-sky-500/40 dark:bg-zinc-950"
                        : lateCheckData?.isClosed
                        ? "border-indigo-500/40 shadow-indigo-950/20 dark:border-indigo-500/40 dark:bg-zinc-950"
                        : "border-amber-500/40 shadow-amber-950/20 dark:border-amber-500/40 dark:bg-zinc-950"
                    )}
                  >
                    {/* Top ambient glow strip */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 right-0 h-1.5",
                        lateCheckData?.isBeforeOpen
                          ? "bg-gradient-to-r from-sky-500 via-blue-500 to-sky-500"
                          : lateCheckData?.isClosed
                          ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"
                          : "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500"
                      )}
                    />

                    {/* Top Right Close Button */}
                    <button
                      type="button"
                      disabled={punching}
                      onClick={() => setLateWarningModalOpen(false)}
                      className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </button>

                    <CardHeader className="pb-3 pr-12 pt-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner",
                            lateCheckData?.isBeforeOpen
                              ? "bg-sky-500/15 border-sky-500/30 text-sky-500"
                              : lateCheckData?.isClosed
                              ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                              : "bg-amber-500/15 border-amber-500/30 text-amber-500"
                          )}
                        >
                          {lateCheckData?.isBeforeOpen ? (
                            <Sunrise className="size-6 animate-pulse" />
                          ) : lateCheckData?.isClosed ? (
                            <Moon className="size-6 animate-pulse" />
                          ) : (
                            <AlertTriangle className="size-6 animate-pulse" />
                          )}
                        </div>
                        <div>
                          <CardTitle
                            className={cn(
                              "text-lg font-black tracking-tight",
                              lateCheckData?.isBeforeOpen
                                ? "text-sky-600 dark:text-sky-400"
                                : lateCheckData?.isClosed
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {lateCheckData?.isBeforeOpen
                              ? "Check-in Not Open Yet"
                              : lateCheckData?.isClosed
                              ? "School is Closed for Today"
                              : "You are late, sir!"}
                          </CardTitle>
                          <CardDescription className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {lateCheckData?.isBeforeOpen
                              ? `Morning Check-in Starts at ${lateCheckData.openWindowStartFormatted || "06:00 AM"}`
                              : lateCheckData?.isClosed
                              ? `Campus Hours Ended at ${lateCheckData.closeFormatted || "05:00 PM"}`
                              : "Morning School Arrival Cutoff Exceeded"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-1">
                      {/* Breakdown card */}
                      <div
                        className={cn(
                          "rounded-2xl border p-3.5 space-y-2.5 text-xs",
                          lateCheckData?.isBeforeOpen
                            ? "border-sky-500/20 bg-sky-50/60 dark:bg-sky-950/20"
                            : lateCheckData?.isClosed
                            ? "border-indigo-500/20 bg-indigo-50/60 dark:bg-indigo-950/20"
                            : "border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/20"
                        )}
                      >
                        {lateCheckData?.isBeforeOpen ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-600 dark:text-zinc-400">School Opening Time:</span>
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-white/10">
                                {lateCheckData.openFormatted || "08:00 AM"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-600 dark:text-zinc-400">Check-in Window Begins:</span>
                              <span className="font-mono font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                                {lateCheckData.openWindowStartFormatted || "06:00 AM"} (2 hrs before open)
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-600 dark:text-zinc-400">Your Current Time:</span>
                              <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-white/10">
                                {lateCheckData.currentFormatted}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-600 dark:text-zinc-400">Window Status:</span>
                              <span className="font-bold text-sky-600 dark:text-sky-400">
                                Not Open Yet (Wait until {lateCheckData.openWindowStartFormatted || "06:00 AM"})
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-600 dark:text-zinc-400">
                                {lateCheckData?.isClosed ? "School Closing Time:" : "Scheduled Cutoff:"}
                              </span>
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-white/10">
                                {lateCheckData?.isClosed
                                  ? lateCheckData.closeFormatted || "05:00 PM"
                                  : lateCheckData?.cutoffFormatted || "09:00 AM"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-600 dark:text-zinc-400">Your Current Time:</span>
                              <span
                                className={cn(
                                  "font-mono font-bold px-2 py-0.5 rounded-md border",
                                  lateCheckData?.isClosed
                                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
                                    : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                                )}
                              >
                                {lateCheckData?.currentFormatted}
                              </span>
                            </div>
                            {lateCheckData?.isClosed ? (
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-600 dark:text-zinc-400">Campus Status:</span>
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                  Closed for Today (No Attendance)
                                </span>
                              </div>
                            ) : lateCheckData?.minutesLate ? (
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-600 dark:text-zinc-400">Delayed By:</span>
                                <span className="font-bold text-red-600 dark:text-red-400">
                                  +{lateCheckData.minutesLate} minutes late
                                </span>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {lateCheckData?.isBeforeOpen
                          ? `School rules permit daily check-in starting strictly 2 hours before school opening time. For today, check-in begins at ${lateCheckData.openWindowStartFormatted || "06:00 AM"}. Attendance cannot be marked earlier.`
                          : lateCheckData?.isClosed
                          ? `School hours officially closed at ${lateCheckData.closeFormatted || "05:00 PM"}. Attendance can no longer be recorded for today. Please enjoy your evening and have a wonderful rest! Doors reopen tomorrow morning at ${lateCheckData.openFormatted || "08:00 AM"}.`
                          : `School rules require daily check-in before the morning cutoff (${lateCheckData?.cutoffFormatted || "09:00 AM"}). Punching in now will record your attendance as Late Arrival in official school administration records.`}
                      </p>

                      {/* Modal Action Buttons */}
                      {lateCheckData?.isBeforeOpen || lateCheckData?.isClosed ? (
                        <div className="pt-2">
                          <Button
                            type="button"
                            onClick={() => setLateWarningModalOpen(false)}
                            className={cn(
                              "w-full h-11 rounded-xl font-bold text-xs text-white shadow-md cursor-pointer transition-all active:scale-[0.98]",
                              lateCheckData?.isBeforeOpen
                                ? "bg-sky-600 hover:bg-sky-500 shadow-sky-600/25"
                                : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25"
                            )}
                          >
                            Understood / Close
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                          <Button
                            type="button"
                            disabled={punching}
                            onClick={() => void executePunchIn()}
                            className="w-full sm:flex-1 h-10 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/25 gap-2 cursor-pointer transition-all active:scale-[0.98]"
                          >
                            {punching ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                <span>Verifying & Checking In…</span>
                              </>
                            ) : (
                              <>
                                <LogIn className="size-4" />
                                <span>Check In as Late (Confirm)</span>
                              </>
                            )}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            disabled={punching}
                            onClick={() => setLateWarningModalOpen(false)}
                            className="w-full sm:w-auto h-10 rounded-xl text-xs font-semibold border-zinc-200 dark:border-white/10"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Emergency Leave / On-Duty Departure Modal */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {emergencyModalOpen && (
              <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => !submittingEmergency && setEmergencyModalOpen(false)}
                />

                <motion.div
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0 }}
                  transition={{ type: "spring", damping: 28, stiffness: 280 }}
                  className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-[28px] sm:rounded-2xl border-t sm:border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 sm:dark:bg-zinc-900 flex flex-col max-h-[90dvh] sm:max-h-[90vh]"
                >
                  {/* Drag handle pill on mobile */}
                  <div className="sm:hidden mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />

                  <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Briefcase className="size-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          Emergency Leave / On-Duty Departure
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          Leaving school campus after morning punch-in
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submittingEmergency}
                      onClick={() => setEmergencyModalOpen(false)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {renderEmergencyForm(false)}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Late Sign-Out Approval Request Modal (Past 7:00 PM) */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {lateSignOutModalOpen && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => !punching && setLateSignOutModalOpen(false)}
                />

                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 12 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 12 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/30 bg-white shadow-2xl dark:border-rose-500/25 dark:bg-zinc-950 flex flex-col"
                >
                  <Card className="border-0 shadow-none bg-transparent">
                    <button
                      type="button"
                      disabled={punching}
                      onClick={() => setLateSignOutModalOpen(false)}
                      className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </button>

                    <CardHeader className="pb-3 pr-12 pt-6">
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/15 text-rose-500 shadow-inner">
                          <Moon className="size-6 animate-pulse" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-black tracking-tight text-rose-600 dark:text-rose-400">
                            Late School Sign-Out
                          </CardTitle>
                          <CardDescription className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Official Sign-Out Deadline Exceeded
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-1">
                      {/* Breakdown card */}
                      <div className="rounded-2xl border border-rose-500/20 bg-rose-50/60 dark:bg-rose-950/20 p-3.5 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-600 dark:text-zinc-400">Sign-Out Deadline:</span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-white/10">
                            {lateSignOutTimingInfo?.signOutDeadlineFormatted || "07:00 PM"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-600 dark:text-zinc-400">Your Current Time:</span>
                          <span className="font-mono font-bold px-2 py-0.5 rounded-md border text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20">
                            {lateSignOutTimingInfo?.currentFormatted || "Late evening"}
                          </span>
                        </div>
                        {lateSignOutTimingInfo?.minutesLate ? (
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">Delayed By:</span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              +{lateSignOutTimingInfo.minutesLate} minutes late
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        It is past the standard sign-out cutoff ({lateSignOutTimingInfo?.signOutDeadlineFormatted || "07:00 PM"}). You can sign out from campus or remotely, but this requires a reason and must be approved by school administration.
                      </p>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Reason for Late Sign-Out: <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          value={lateSignOutReason}
                          onChange={(e) => setLateSignOutReason(e.target.value)}
                          placeholder="e.g. Extra coaching class, checking test papers, parent meeting, forgot to sign out before leaving..."
                          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                        <Button
                          type="button"
                          disabled={punching || !lateSignOutReason.trim()}
                          onClick={() => void submitLateSignOut()}
                          className="w-full sm:flex-1 h-10 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/25 gap-2 cursor-pointer transition-all active:scale-[0.98]"
                        >
                          {punching ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              <span>Submitting Request…</span>
                            </>
                          ) : (
                            <>
                              <LogOut className="size-4" />
                              <span>Submit Late Sign-Out for Approval</span>
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          disabled={punching}
                          onClick={() => setLateSignOutModalOpen(false)}
                          className="w-full sm:w-auto h-10 rounded-xl text-xs font-semibold border-zinc-200 dark:border-white/10"
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Punch Out Danger Confirmation Modal */}
      <DangerConfirmModal
        open={punchOutConfirmOpen}
        onClose={() => setPunchOutConfirmOpen(false)}
        onConfirm={handlePunchOut}
        title="School Check Out"
        subtitle="End school working day"
        description={`Are you sure you want to check out / sign out from ${config?.name || "MHMS"} for today? Your live GPS coordinates will be verified to ensure you are within the school campus premises (${config?.radiusMeters || 250}m boundary).`}
        confirmText="Confirm Check Out"
        cancelText="Cancel"
        loading={punching}
        variant="warning"
      />

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
