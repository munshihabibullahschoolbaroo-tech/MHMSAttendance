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
  MapPin,
  FileCheck,
  ChevronRight,
  X,
  Compass,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { SchoolCampusMap } from "@/components/client/map/school-campus-map";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { AppDatePicker } from "@/components/ui/app-date-picker";

type TodayPayload = {
  date: string;
  config: {
    name: string;
    campusName: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
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
  };
  session: {
    checkInTime?: { seconds: number };
    checkOutTime?: { seconds: number };
    checkInGps?: { distanceM: number };
    status?: string;
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
  const [data, setData] = React.useState<TodayPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [punching, setPunching] = React.useState(false);
  const [punchOutConfirmOpen, setPunchOutConfirmOpen] = React.useState(false);

  // Mobile Bottom Sheet state: "punch" | "leave" | "map" | null
  const [activeSheet, setActiveSheet] = React.useState<"punch" | "leave" | "map" | null>(null);

  // GPS state
  const [gpsCoords, setGpsCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = React.useState<string | null>(null);

  // Leave Form state
  const [leaveModalOpen, setLeaveModalOpen] = React.useState(false);
  const [leaveType, setLeaveType] = React.useState<"casual" | "medical">("casual");
  const [leaveStart, setLeaveStart] = React.useState("");
  const [leaveEnd, setLeaveEnd] = React.useState("");
  const [leaveReason, setLeaveReason] = React.useState("");
  const [leaveDocUrl, setLeaveDocUrl] = React.useState("");
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const [submittingLeave, setSubmittingLeave] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent background scrolling when mobile bottom sheet or desktop modal is open
  React.useEffect(() => {
    if (activeSheet || leaveModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeSheet, leaveModalOpen]);

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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Punch In Handler
  const handlePunchIn = async () => {
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

      toast.success(resJson.message ?? "Checked in successfully!");
      await refreshStatus();
      setActiveSheet(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to check in");
    } finally {
      setPunching(false);
    }
  };

  // Punch Out Handler
  const handlePunchOut = async () => {
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
          latitude: gpsCoords?.lat,
          longitude: gpsCoords?.lng,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error ?? "Check-out failed");

      toast.success("Punched out from school successfully!");
      setPunchOutConfirmOpen(false);
      await refreshStatus();
      setActiveSheet(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to check out");
    } finally {
      setPunching(false);
    }
  };

  // File upload for Medical Leave certificate
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDoc(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "leave_docs");

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const uploadData = await res.json();
      if (!res.ok) throw new Error(uploadData.error ?? "Failed to upload document");

      setLeaveDocUrl(uploadData.url);
      toast.success("Medical document attached!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  // Submit Leave Application
  const submitLeaveApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leaveType === "medical" && !leaveDocUrl) {
      toast.error("Please upload a medical certificate or doctor note.");
      return;
    }

    if (leaveType === "casual") {
      if (requestedDaysCount > 2) {
        toast.error("Casual leave cannot exceed 2 days in a calendar month.");
        return;
      }
      const used = teacher?.casualLeavesThisMonth ?? 0;
      if (used + requestedDaysCount > 2) {
        toast.error(
          `Casual leave quota exceeded. You already have ${used} day(s) used this month. Max 2 days allowed.`
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
          documentUrl: leaveDocUrl || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Leave request failed");

      toast.success("Leave application submitted to School Admin!");
      setLeaveModalOpen(false);
      setActiveSheet(null);
      setLeaveReason("");
      setLeaveDocUrl("");
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error submitting leave");
    } finally {
      setSubmittingLeave(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
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
            {teacher?.casualLeavesThisMonth ?? 0}/2 used this month
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
            "rounded-lg p-3 text-xs border space-y-1",
            leaveType === "casual" &&
              (requestedDaysCount > 2 ||
                (teacher?.casualLeavesThisMonth ?? 0) + requestedDaysCount > 2)
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
              : "border-blue-500/20 bg-blue-500/10 text-blue-800 dark:text-blue-300"
          )}
        >
          <div className="flex items-center justify-between font-semibold">
            <span>Requested: {requestedDaysCount} calendar day(s)</span>
            {leaveType === "casual" && (
              <span>Monthly Quota: {teacher?.casualLeavesThisMonth ?? 0}/2 used</span>
            )}
          </div>
          {leaveType === "casual" && requestedDaysCount > 2 && (
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              ⚠️ Casual leave cannot exceed 2 days in a calendar month.
            </p>
          )}
          {leaveType === "casual" &&
            requestedDaysCount <= 2 &&
            (teacher?.casualLeavesThisMonth ?? 0) + requestedDaysCount > 2 && (
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                ⚠️ Exceeds quota: You already have {teacher?.casualLeavesThisMonth ?? 0} casual day(s) this month.
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
        <label className="flex flex-col gap-1 text-xs">
          <span className={formFieldLabelClass}>Medical Certificate / Prescription (PDF or Image)</span>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => void handleDocUpload(e)}
              disabled={uploadingDoc}
              className="text-xs"
            />
            {uploadingDoc && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          </div>
          {leaveDocUrl && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
              ✓ Document attached successfully
            </p>
          )}
        </label>
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
              (requestedDaysCount > 2 ||
                (teacher?.casualLeavesThisMonth ?? 0) + requestedDaysCount > 2))
          }
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
        >
          {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit Leave Application
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
                  Daily Teacher Punch
                </span>
                {isCheckedIn && (
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {isCheckedOut
                  ? "Day Completed • Signed out"
                  : isCheckedIn
                  ? "Punched in today • Tap for status"
                  : leave && leave.status === "approved"
                  ? "Excused on Approved Leave"
                  : "Tap to verify GPS and check in"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              {isCheckedOut ? "View >" : isCheckedIn ? "Status >" : "Punch >"}
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
                  : `Casual (${teacher?.casualLeavesThisMonth ?? 0}/2 used) • Medical`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              Apply &gt;
            </span>
          </div>
        </motion.div>

        {/* Card 3: Campus & Geofence Radar Map */}
        <motion.div
          role="button"
          tabIndex={0}
          whileTap={{ scale: 0.98 }}
          onClick={() => setActiveSheet("map")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveSheet("map");
            }
          }}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition-colors cursor-pointer hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <MapPin className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Campus Radar &amp; Map
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {config?.campusName} • {config?.radiusMeters}m Geofence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              Map &gt;
            </span>
          </div>
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* DESKTOP & TABLET VIEW (Permanent 2-Column Grid) */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Attendance Card */}
        <Card className="border-zinc-200 dark:border-white/10 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Daily Teacher Punch
              </CardTitle>
              {isCheckedIn ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Punched In Today
                </span>
              ) : leave && leave.status === "approved" ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                  <FileCheck className="h-3.5 w-3.5" />
                  On Approved Leave
                </span>
              ) : (
                <span className="text-xs font-medium text-zinc-500 px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/5">
                  Not Punched In
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
                    ✓ Your leave is approved by School Administration. Daily punch is excused for today.
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
                      Punch In Anyway (If Present on Campus)
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
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
                    <span>{punching ? "Verifying Geofence…" : "Punch In (Login to School)"}</span>
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
                  You have successfully punched in and signed out for today. See you tomorrow!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-zinc-500">Punch In Recorded:</span>
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                      {data?.session?.checkInTime
                        ? new Date(data.session.checkInTime.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Today"}
                    </p>
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

                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={punching}
                  onClick={() => setPunchOutConfirmOpen(true)}
                  className="h-12 w-full gap-2.5 border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 hover:text-red-800 dark:border-red-500/40 dark:text-red-400 font-semibold text-sm shadow-sm cursor-pointer"
                >
                  {punching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  <span>Sign Out / Punch Out from School</span>
                </Button>
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

        {/* School Campus Geofence Map */}
        {config && (
          <SchoolCampusMap
            schoolLat={config.latitude}
            schoolLng={config.longitude}
            radiusMeters={config.radiusMeters}
            schoolName={config.name}
            campusName={config.campusName}
            userLat={gpsCoords?.lat}
            userLng={gpsCoords?.lng}
          />
        )}
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
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 cursor-pointer shadow-xs transition-colors"
                    aria-label="Close sheet"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Drag Handle Pill */}
                  <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />

                  {/* Sheet Header */}
                  <div className="px-5 py-2.5 pr-14 border-b border-zinc-100 dark:border-white/10">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {activeSheet === "punch" && "Daily Teacher Punch"}
                        {activeSheet === "leave" && "Apply for Leave"}
                        {activeSheet === "map" && "Campus Radar & Geofence"}
                      </h3>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {activeSheet === "punch" && `${config?.name} • ${config?.campusName}`}
                        {activeSheet === "leave" && "Submit an official leave request to administration"}
                        {activeSheet === "map" && `Attendance Geofence (${config?.radiusMeters}m radius)`}
                      </p>
                    </div>
                  </div>

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
                                  Punch In Anyway (If on Campus)
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
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
                                <span>{punching ? "Verifying Geofence…" : "Punch In Now"}</span>
                              </Button>
                              <p className="text-center text-[11px] text-zinc-500">
                                Validates your live GPS location inside {config?.radiusMeters}m of campus premises.
                              </p>
                            </div>
                          )
                        ) : isCheckedOut ? (
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto mb-1.5" />
                            <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                              Day Completed!
                            </h4>
                            <p className="text-xs text-zinc-500 mt-1">
                              You have successfully punched in and signed out for today. Have a restful evening!
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-zinc-500">Punch In Recorded:</span>
                                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                                  {data?.session?.checkInTime
                                    ? new Date(data.session.checkInTime.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                    : "Today"}
                                </p>
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

                            <Button
                              type="button"
                              size="lg"
                              variant="outline"
                              disabled={punching}
                              onClick={() => setPunchOutConfirmOpen(true)}
                              className="h-12 w-full gap-2.5 border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:border-red-500/40 dark:text-red-400 font-semibold text-sm shadow-sm cursor-pointer"
                            >
                              {punching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                              <span>Sign Out / Punch Out from School</span>
                            </Button>
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

                    {/* 3. Map Sheet Content */}
                    {activeSheet === "map" && config && (
                      <div className="space-y-3">
                        <SchoolCampusMap
                          schoolLat={config.latitude}
                          schoolLng={config.longitude}
                          radiusMeters={config.radiusMeters}
                          schoolName={config.name}
                          campusName={config.campusName}
                          userLat={gpsCoords?.lat}
                          userLng={gpsCoords?.lng}
                        />
                        <p className="text-[11px] text-zinc-500 text-center">
                          Campus: {config.name} ({config.campusName}) • Kargil, UT Ladakh
                        </p>
                      </div>
                    )}
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
                      className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 cursor-pointer shadow-xs transition-colors"
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

      {/* Punch Out Danger Confirmation Modal */}
      <DangerConfirmModal
        open={punchOutConfirmOpen}
        onClose={() => setPunchOutConfirmOpen(false)}
        onConfirm={handlePunchOut}
        title="School Punch Out"
        subtitle="End school working day"
        description="Are you sure you want to punch out / sign out from MHMS for today? Your checkout timestamp and today's total working hours will be logged."
        confirmText="Confirm Punch Out"
        cancelText="Cancel"
        loading={punching}
        variant="warning"
      />
    </div>
  );
}
