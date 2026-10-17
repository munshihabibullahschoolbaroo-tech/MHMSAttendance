"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { AppSelect } from "@/components/ui/app-select";
import { DateField } from "@/components/ui/date-field";
import { getBrowserTimeZone } from "@/lib/date/time-zone";
import { Button } from "@/components/ui/button";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Clock,
  Loader2,
  Building,
  ShieldCheck,
  X,
  CheckCircle2,
  XCircle,
  Send,
} from "lucide-react";
import { MissedAttendanceContentSkeleton } from "@/components/client/dashboard-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

type Assignee = { id: string; name: string; email: string; role: string };
type Site = { id: string; name: string };

type ManualPunchRequestItem = {
  id: string;
  date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  segments?: { inHm: string; outHm: string; siteId?: string }[];
  createdAt?: { seconds: number };
  reviewNote?: string;
};

export function EmployeeManualPunchPanel() {
  const [mounted, setMounted] = React.useState(false);
  const [openModal, setOpenModal] = React.useState(false);
  const [openHistoryModal, setOpenHistoryModal] = React.useState(false);

  const [assignees, setAssignees] = React.useState<Assignee[]>([]);
  const [sites, setSites] = React.useState<Site[]>([]);
  const [requests, setRequests] = React.useState<ManualPunchRequestItem[]>([]);
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [loadingRequests, setLoadingRequests] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [date, setDate] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [inTime, setInTime] = React.useState("09:00");
  const [outTime, setOutTime] = React.useState("16:00");

  const tz = React.useMemo(() => getBrowserTimeZone(), []);

  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close modals on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        setOpenModal(false);
        setOpenHistoryModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitting]);

  const adminOptions = React.useMemo(() => {
    return assignees.map((a) => {
      const isSuper = a.role === "super_admin";
      const roleBadge = isSuper ? "👑 Super Admin" : "🛡️ School Admin";
      const displayName = (a.name || a.email.split("@")[0] || "Admin").trim();
      return {
        value: a.id,
        label: `${displayName} — ${roleBadge}`,
      };
    });
  }, [assignees]);

  const fetchRequests = React.useCallback(async () => {
    try {
      setLoadingRequests(true);
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/manual-punch", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { items?: ManualPunchRequestItem[] };
      if (Array.isArray(data.items)) {
        setRequests(data.items);
      }
    } catch {
      // non-critical
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const hdrs = { Authorization: `Bearer ${token}` };

        const [resA, resReqs] = await Promise.all([
          fetch("/api/school/admins", { headers: hdrs }),
          fetch("/api/manual-punch", { headers: hdrs }).catch(() => null),
        ]);

        const dataA = (await resA.json()) as { admins?: { id: string; name: string; email: string; role?: string }[] };
        const dataReqs = resReqs ? ((await resReqs.json()) as { items?: ManualPunchRequestItem[] }) : null;

        if (active) {
          const loadedAdmins = dataA.admins ?? [];
          const adminAssignees: Assignee[] = loadedAdmins.map((t) => ({
            id: t.id,
            name: t.name,
            email: t.email,
            role: t.role || "admin",
          }));
          setAssignees(adminAssignees);
          if (adminAssignees.length > 0) {
            setAssigneeId(adminAssignees[0]!.id);
          }
          setSites([{ id: "main-campus", name: "Main Campus" }]);

          if (dataReqs?.items && Array.isArray(dataReqs.items)) {
            setRequests(dataReqs.items);
          }
        }
      } catch {
        toast.error("Failed to load school administrators");
      } finally {
        if (active) {
          setLoadingInitial(false);
          setLoadingRequests(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return toast.error("Please select the date of your missed attendance.");
    if (!assigneeId) return toast.error("Please select a school admin for approval.");
    if (reason.trim().length < 3) return toast.error("Please provide a reason for the missing punch.");

    const defaultSiteId = sites[0]?.id || "main-campus";

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/manual-punch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date,
          assigneeAdminUid: assigneeId,
          reason: reason.trim(),
          segments: [
            {
              siteId: defaultSiteId,
              inHm: inTime,
              outHm: outTime,
            },
          ],
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.error ?? "Failed to submit missed attendance request");
      }

      toast.success("Missed attendance request submitted for admin approval!");
      setDate("");
      setReason("");
      setOpenModal(false);
      void fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };


  const renderFormFields = (idPrefix: string) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2 min-w-0">
        <div className="min-w-0">
          <DateField
            id={`${idPrefix}-date`}
            label="Date of Missing Attendance"
            value={date}
            onChange={setDate}
            timeZone={tz}
            className="w-full min-w-0"
          />
        </div>
        <div className="min-w-0 flex flex-col justify-end">
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Assign to School Admin <span className="text-red-500">*</span>
          </label>
          <AppSelect
            id={`${idPrefix}-admin`}
            value={assigneeId}
            onChange={setAssigneeId}
            options={adminOptions}
            placeholder="Select school admin..."
            drawerTitle="Assign to School Admin"
            searchable={adminOptions.length > 3}
            searchPlaceholder="Search admin by name..."
            icon={<ShieldCheck className="size-4 text-blue-500 shrink-0" />}
            className="h-11 rounded-xl"
          />
        </div>
      </div>

      {/* In Time and Out Time */}
      <div className="grid gap-3 sm:grid-cols-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 dark:border-white/5 dark:bg-white/[0.02]">
        <div>
          <AppTimePicker
            id={`${idPrefix}-in-time`}
            label="School Arrival Time (Punch In)"
            value={inTime}
            onChange={setInTime}
          />
        </div>
        <div>
          <AppTimePicker
            id={`${idPrefix}-out-time`}
            label="School Departure Time (Punch Out)"
            value={outTime}
            onChange={setOutTime}
          />
        </div>
        <p className="sm:col-span-2 text-[11px] text-zinc-500 flex items-center gap-1.5 pt-0.5">
          <Building className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span>Campus: Munshi Habibullah Mission School (Bemathang Campus)</span>
        </p>
      </div>

      {/* Reason */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Reason for Missing Attendance <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Phone battery ran out upon arrival, or was assigned to special school duty."
          className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-base sm:text-xs text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-zinc-900 dark:text-white resize-none"
        />
      </div>
    </>
  );

  const renderRequestsList = (isModal = false) => {
    if (loadingRequests) {
      return (
        <div className="space-y-3 pb-2 animate-in fade-in duration-200">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <Skeleton className="h-3 w-4/5 rounded" />
              <div className="flex items-center gap-4 pt-1">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (requests.length === 0) {
      return (
        <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-4">
          <p>No missed attendance requests submitted yet.</p>
          {isModal && (
            <button
              type="button"
              onClick={() => {
                setOpenHistoryModal(false);
                setOpenModal(true);
              }}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15 transition-colors cursor-pointer"
            >
              Request &gt;
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3 pb-2">
        {requests.map((r) => {
          const seg = r.segments?.[0];
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] p-4 space-y-2.5 transition-colors hover:border-zinc-300 dark:hover:border-white/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 font-mono">
                    {r.date}
                  </span>
                  {seg ? (
                    <span className="text-xs text-zinc-500 font-mono font-medium">
                      ({seg.inHm} → {seg.outHm})
                    </span>
                  ) : null}
                </div>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                    r.status === "approved"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : r.status === "rejected"
                      ? "bg-red-500/10 text-red-600 border-red-500/20"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  )}
                >
                  {r.status === "approved" ? (
                    <CheckCircle2 className="size-3" />
                  ) : r.status === "rejected" ? (
                    <XCircle className="size-3" />
                  ) : (
                    <Clock className="size-3" />
                  )}
                  <span className="capitalize">{r.status}</span>
                </span>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="text-zinc-500 font-medium">Reason: </span>
                {r.reason}
              </p>

              {r.reviewNote ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 italic bg-zinc-100/80 dark:bg-white/[0.04] p-2 rounded-xl">
                  Admin note: {r.reviewNote}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  if (loadingInitial) {
    return <MissedAttendanceContentSkeleton />;
  }

  return (
    <div className="w-full space-y-6">
      {/* ─────────────────────────────────────────────────────────── */}
      {/* 1. MOBILE TRIGGER CARDS (Exclusively on mobile: md:hidden) */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5 md:hidden">
        {/* Trigger 1: Missed Attendance Request */}
        <motion.div
          role="button"
          tabIndex={0}
          whileTap={{ scale: 0.98 }}
          onClick={() => setOpenModal(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenModal(true);
            }
          }}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition-colors cursor-pointer hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 text-left"
        >
          <div className="min-w-0 flex-1 pr-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Missed Attendance Request
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              Tap to request timeline adjustment
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              Request &gt;
            </span>
          </div>
        </motion.div>

        {/* Trigger 2: My Missed Attendance Requests */}
        <motion.div
          role="button"
          tabIndex={0}
          whileTap={{ scale: 0.98 }}
          onClick={() => setOpenHistoryModal(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenHistoryModal(true);
            }
          }}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition-colors cursor-pointer hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 text-left"
        >
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                My Missed Attendance Requests
              </span>
              {requests.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold">
                  {requests.length}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {requests.length > 0
                ? `${requests.length} request${requests.length > 1 ? "s" : ""} • Tap to view status`
                : "Tap to view submitted requests & status"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              View &gt;
            </span>
          </div>
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* 2. TABLET & DESKTOP VIEW (Direct Cards: hidden md:block) */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm overflow-hidden">
            <CardHeader className="pb-4 border-b border-zinc-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <Clock className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Missed Attendance Details
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                    Request timeline correction for dates you were present at school.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              {renderFormFields("desktop")}
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-[0.99] cursor-pointer"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Missed Attendance Request
          </Button>
        </form>

        {/* Desktop Requests History Card */}
        <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-zinc-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock className="size-4 text-blue-500" />
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  My Missed Attendance Requests
                </CardTitle>
                {requests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono text-[11px] font-bold">
                    {requests.length}
                  </span>
                )}
              </div>
            </div>
            <CardDescription className="text-xs">
              Review status of submitted manual attendance requests and administration notes.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {renderRequestsList(false)}
          </CardContent>
        </Card>
      </div>

      {/* MODAL 1: Request Missed Attendance Modal (Bottom sheet on mobile, popup on desktop) */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {openModal && (
              <div
                className={cn(
                  "fixed inset-0 z-[10000]",
                  isMobile
                    ? "flex flex-col justify-end p-0"
                    : "flex items-center justify-center p-4"
                )}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => !submitting && setOpenModal(false)}
                  aria-hidden="true"
                />

                <motion.div
                  initial={isMobile ? { y: "100%", opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
                  animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={isMobile ? { y: "100%", opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
                  transition={
                    isMobile
                      ? { type: "spring", damping: 28, stiffness: 280 }
                      : { type: "spring", damping: 25, stiffness: 320 }
                  }
                  className={cn(
                    "relative z-10 w-full sm:max-w-xl max-h-[90dvh] flex flex-col border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-zinc-900 dark:text-white shadow-2xl overflow-hidden",
                    isMobile ? "rounded-t-[28px]" : "rounded-3xl"
                  )}
                >
                  {/* Top drag handle for mobile */}
                  {isMobile && (
                    <div className="mx-auto mt-2.5 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
                  )}

                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setOpenModal(false)}
                    disabled={submitting}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Header (Minimalist, no subtext) */}
                  <div className="px-5 py-4 pr-14 border-b border-zinc-100 dark:border-white/5 shrink-0">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      Missed Attendance Details
                    </h2>
                  </div>

                  {/* Scrollable Form Body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
                    <form id="missed-attendance-form" onSubmit={handleSubmit} className="space-y-4">
                      {renderFormFields("modal")}
                    </form>
                  </div>

                  {/* Fixed Bottom Action Button */}
                  <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-white/5 bg-white dark:bg-[#1c1c1e] shrink-0">
                    <Button
                      form="missed-attendance-form"
                      type="submit"
                      disabled={submitting}
                      className="h-12 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-[0.99] cursor-pointer"
                    >
                      {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Submitting...</span>
                        </span>
                      ) : (
                        "Submit Missed Attendance Request"
                      )}
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* MODAL 2: My Missed Attendance Requests List Modal */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {openHistoryModal && (
              <div
                className={cn(
                  "fixed inset-0 z-[10000]",
                  isMobile
                    ? "flex flex-col justify-end p-0"
                    : "flex items-center justify-center p-4"
                )}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setOpenHistoryModal(false)}
                  aria-hidden="true"
                />

                <motion.div
                  initial={isMobile ? { y: "100%", opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
                  animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={isMobile ? { y: "100%", opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
                  transition={
                    isMobile
                      ? { type: "spring", damping: 28, stiffness: 280 }
                      : { type: "spring", damping: 25, stiffness: 320 }
                  }
                  className={cn(
                    "relative z-10 w-full sm:max-w-xl max-h-[85dvh] flex flex-col border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-zinc-900 dark:text-white shadow-2xl overflow-hidden pb-6 sm:pb-4",
                    isMobile ? "rounded-t-[28px]" : "rounded-3xl"
                  )}
                >
                  {/* Top drag handle for mobile */}
                  {isMobile && (
                    <div className="mx-auto mt-2.5 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
                  )}

                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setOpenHistoryModal(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Header */}
                  <div className="px-5 py-4 pr-14 border-b border-zinc-100 dark:border-white/5 shrink-0 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        My Missed Attendance Requests
                      </h2>
                    </div>
                  </div>

                  {/* Scrollable Requests Body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
                    {renderRequestsList(true)}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
