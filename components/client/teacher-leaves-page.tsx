"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  FileCheck,
  FilePlus2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  UploadCloud,
  ChevronRight,
  X,
  FileText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { cn, resolveDocumentViewUrl } from "@/lib/utils";
import { compressImageForUpload } from "@/lib/client/compress-image";
import { motion, AnimatePresence } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { calculateCasualLeaveQuota } from "@/lib/school/leave-quota";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { MediaPreviewModal } from "@/components/ui/media-preview-modal";
import { StaffLeavesSkeleton } from "@/components/client/dashboard-skeletons";

type LeaveRecord = {
  id: string;
  type: "casual" | "medical";
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  documentUrl?: string;
  documentUrls?: string[];
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt?: { seconds: number };
};

type AttachedDoc = {
  url: string;
  name: string;
  sizeFormatted?: string;
};

export function TeacherLeavesPage() {
  const { user } = useDashboardUser();
  const [leaves, setLeaves] = React.useState<LeaveRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openModal, setOpenModal] = React.useState(false);
  const [openHistoryModal, setOpenHistoryModal] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Form state
  const [leaveType, setLeaveType] = React.useState<"casual" | "medical">("casual");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [documents, setDocuments] = React.useState<AttachedDoc[]>([]);
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [previewTarget, setPreviewTarget] = React.useState<{ url: string; title: string } | null>(null);

  // Close modal/drawer on Escape key
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

  // Helper to calculate exact days requested
  const requestedDates = React.useMemo(() => {
    if (!startDate || !endDate) return [];
    const d1 = new Date(startDate + "T00:00:00Z");
    const d2 = new Date(endDate + "T00:00:00Z");
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
  }, [startDate, endDate]);

  const requestedDaysCount = requestedDates.length;

  const userFirstActive = user?.firstLoginAt || user?.createdAt || user?.onboardingCompletedAt || null;

  // Calculate casual leave quota with rollover / carry-forward from prior months starting from join month
  const casualQuota = React.useMemo(() => {
    const targetMonth = startDate ? startDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const dates = new Set<string>();
    leaves.forEach((l) => {
      if (l.type === "casual" && (l.status === "approved" || l.status === "pending")) {
        const d1 = new Date(l.startDate + "T00:00:00Z");
        const d2 = new Date(l.endDate + "T00:00:00Z");
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1 <= d2) {
          const cur = new Date(d1);
          while (cur <= d2) {
            const y = cur.getUTCFullYear();
            const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
            const d = String(cur.getUTCDate()).padStart(2, "0");
            dates.add(`${y}-${m}-${d}`);
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
        }
      }
    });
    return calculateCasualLeaveQuota(targetMonth, dates, userFirstActive);
  }, [leaves, startDate, userFirstActive]);

  const usedCasualDaysThisMonth = casualQuota.usedThisMonth;
  const maxCasualLeavesAllowed = casualQuota.maxCasualLeavesAllowed;
  const carriedForwardCasualLeaves = casualQuota.carriedForward;

  const fetchLeaves = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/school/leave", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { leaves?: LeaveRecord[] };
        setLeaves(data.leaves ?? []);
      }
    } catch (e) {
      console.error("[TeacherLeavesPage] error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchLeaves();
  }, [fetchLeaves]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        toast.error(`"${f.name}" exceeds the 8MB limit`);
        return;
      }
    }

    setUploadingDoc(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const uploadedList: AttachedDoc[] = [];

      for (const file of files) {
        // Optimize & compress image file client-side (reduces 3-8MB phone camera photos to ~35-85KB WebP)
        const uploadFile = await compressImageForUpload(file);

        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("category", "medical_certificate");

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Failed to upload "${file.name}"`);

        const sizeKb = Math.round(uploadFile.size / 1024);
        uploadedList.push({
          url: data.url,
          name: file.name,
          sizeFormatted: `${sizeKb} KB`,
        });
      }

      setDocuments((prev) => [...prev, ...uploadedList]);
      toast.success(
        uploadedList.length === 1
          ? "Medical photo attached successfully!"
          : `${uploadedList.length} medical photos attached successfully!`
      );
      // Reset input value so user can upload more files or re-select
      e.target.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error uploading file(s)");
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeDocument = async (indexToRemove: number) => {
    const docToRemove = documents[indexToRemove];
    setDocuments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
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

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leaveType === "medical" && documents.length === 0) {
      toast.error("Please attach at least one doctor's certificate or prescription for medical leave.");
      return;
    }

    if (leaveType === "casual") {
      if (requestedDaysCount > maxCasualLeavesAllowed) {
        toast.error(`Casual leave cannot exceed ${maxCasualLeavesAllowed} day(s) for this month (including carried forward days).`);
        return;
      }
      if (usedCasualDaysThisMonth + requestedDaysCount > maxCasualLeavesAllowed) {
        toast.error(
          `Casual leave quota exceeded. You already have ${usedCasualDaysThisMonth} day(s) this month. Max ${maxCasualLeavesAllowed} days allowed.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const docUrls = documents.map((d) => d.url);

      const res = await fetch("/api/school/leave", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: leaveType,
          startDate,
          endDate,
          reason,
          documentUrl: docUrls[0] || undefined,
          documentUrls: docUrls,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to submit leave");

      toast.success("Leave application submitted to School Administration!");
      setOpenModal(false);
      setReason("");
      setDocuments([]);
      setStartDate("");
      setEndDate("");
      void fetchLeaves();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error submitting leave");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <StaffLeavesSkeleton />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-3 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Leave Applications</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Apply for official leaves and check application approval status from School Administration.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setOpenModal(true)}
          className="hidden md:inline-flex gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm"
        >
          <FilePlus2 className="size-4" />
          Apply for Leave
        </Button>
      </div>

      {/* Mobile Reference-Style Action Card & Quota Indicator */}
      <div className="md:hidden space-y-3">
        {/* Top Quota Pill Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium shrink-0">
            Casual Used: <strong className="font-bold">{usedCasualDaysThisMonth}/2</strong> this month
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
            Medical: Certificate needed
          </span>
        </div>

        {/* 1. Action Card: Apply for Leave */}
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
          <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <FilePlus2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Apply for Leave
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                Casual &amp; Medical requests
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              Apply &gt;
            </span>
          </div>
        </motion.div>

        {/* 2. Action Card: My Leave Records */}
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
          <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <FileCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                  My Leave Records
                </span>
                {leaves.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold">
                    {leaves.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {leaves.length > 0
                  ? `${leaves.length} record${leaves.length > 1 ? "s" : ""} • Tap to view status`
                  : "Tap to review submitted leave records"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2 pointer-events-none">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              View &gt;
            </span>
          </div>
        </motion.div>
      </div>

      {/* Desktop View: Leave Application History Card */}
      <div className="hidden md:block">
        <Card className="border-zinc-200 dark:border-white/10 shadow-sm">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileCheck className="size-4 text-blue-500" />
              My Leave Records
            </CardTitle>
            <CardDescription className="text-xs">
              Review submitted leave requests, approval status, and remarks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-40 items-center justify-center text-zinc-400">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : leaves.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                <p>No leave applications submitted yet.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenModal(true)}
                  className="mt-3 text-xs gap-1.5 text-blue-600 border-blue-500/30"
                >
                  <FilePlus2 className="size-3.5" /> Submit First Leave
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {leaves.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] p-4 space-y-2.5 transition-colors hover:border-zinc-300 dark:hover:border-white/20"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm capitalize text-zinc-900 dark:text-zinc-100">
                          {l.type} Leave
                        </span>
                        <span className="text-xs text-zinc-500 font-mono font-medium">
                          ({l.startDate} → {l.endDate})
                        </span>
                      </div>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                          l.status === "approved"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : l.status === "rejected"
                            ? "bg-red-500/10 text-red-600 border-red-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        )}
                      >
                        {l.status === "approved" ? (
                          <CheckCircle2 className="size-3" />
                        ) : l.status === "rejected" ? (
                          <XCircle className="size-3" />
                        ) : (
                          <Clock className="size-3" />
                        )}
                        <span className="capitalize">{l.status}</span>
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="text-zinc-500 font-medium">Reason: </span>
                      {l.reason}
                    </p>

                    {(() => {
                      const docs = (Array.isArray(l.documentUrls) && l.documentUrls.length > 0)
                        ? l.documentUrls
                        : (l.documentUrl ? [l.documentUrl] : []);
                      if (docs.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {docs.map((url, idx) => (
                            <button
                              key={url + idx}
                              type="button"
                              onClick={() =>
                                setPreviewTarget({
                                  url: resolveDocumentViewUrl(url),
                                  title: docs.length > 1 ? `Medical Doc ${idx + 1}` : "Medical Certificate / Document",
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 cursor-pointer"
                            >
                              <FileText className="size-3" />
                              <span>{docs.length > 1 ? `Medical Doc ${idx + 1}` : "View Attached Certificate / Document"}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {l.reviewNotes && (
                      <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.04] text-xs text-zinc-700 dark:text-zinc-300 border border-zinc-200/50 dark:border-white/5">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">Administration Note: </span>
                        {l.reviewNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leave Application Modal & Mobile Bottom Sheet Drawer */}
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
                {/* Backdrop click to dismiss */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => !submitting && setOpenModal(false)}
                  aria-hidden="true"
                />

                {/* Container: Bottom sheet on mobile with spring physics, normal centered popup on tablets & desktop */}
                <motion.div
                  initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 16 }}
                  animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 16 }}
                  transition={
                    isMobile
                      ? { type: "spring", damping: 28, stiffness: 280 }
                      : { type: "spring", damping: 25, stiffness: 320 }
                  }
                  className={cn(
                    "relative z-10 w-full max-h-[90dvh] flex flex-col border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden",
                    isMobile
                      ? "rounded-t-[28px]"
                      : "md:max-w-lg rounded-3xl"
                  )}
                >
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

                  {/* Drag handle for mobile */}
                  {isMobile && (
                    <div className="flex justify-center pt-3 pb-1">
                      <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                    </div>
                  )}

              {/* Modal Header */}
              <div className="px-5 py-3 pr-14">
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Apply for Leave
                  </h2>
                  <p className="text-[11px] text-zinc-500 truncate">
                    Munshi Habibullah Mission School Administration
                  </p>
                </div>
              </div>
              <Separator />

              {/* Scrollable Form Body (keyboard safe) */}
              <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
                <form id="leave-modal-form" onSubmit={handleSubmitLeave} className="space-y-4 pb-2">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setLeaveType("casual")}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all",
                        leaveType === "casual"
                          ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200 font-semibold"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
                      )}
                    >
                      <span className="font-semibold text-xs">Casual / Regular</span>
                      <span className="text-[10px] text-zinc-500 mt-0.5">2 days/mo quota</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLeaveType("medical")}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all",
                        leaveType === "medical"
                          ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-200 font-semibold"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
                      )}
                    >
                      <span className="font-semibold text-xs">Medical Leave</span>
                      <span className="text-[10px] text-zinc-500 mt-0.5">Doctor certificate</span>
                    </button>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className={formFieldLabelClass}>Start Date</span>
                      <AppDatePicker
                        value={startDate}
                        onChange={setStartDate}
                        placeholder="dd/mm/yyyy"
                        title="Leave Start Date"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className={formFieldLabelClass}>End Date</span>
                      <AppDatePicker
                        value={endDate}
                        onChange={setEndDate}
                        placeholder="dd/mm/yyyy"
                        title="Leave End Date"
                      />
                    </label>
                  </div>

                  {/* Day Count & Quota Info */}
                  {requestedDaysCount > 0 && (
                    <div
                      className={cn(
                        "rounded-xl p-3 text-xs border space-y-1.5",
                        leaveType === "casual" &&
                          (requestedDaysCount > maxCasualLeavesAllowed || usedCasualDaysThisMonth + requestedDaysCount > maxCasualLeavesAllowed)
                          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                          : "border-blue-500/20 bg-blue-500/10 text-blue-800 dark:text-blue-300"
                      )}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>Requested: {requestedDaysCount} calendar day(s)</span>
                        {leaveType === "casual" && (
                          <span>
                            Monthly Quota: {usedCasualDaysThisMonth}/{maxCasualLeavesAllowed} used
                          </span>
                        )}
                      </div>
                      {leaveType === "casual" && carriedForwardCasualLeaves > 0 && (
                        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          ✨ 2 regular + {carriedForwardCasualLeaves} carried forward from prior months = {maxCasualLeavesAllowed} days available
                        </p>
                      )}
                      {leaveType === "casual" && requestedDaysCount > maxCasualLeavesAllowed && (
                        <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                          ⚠️ Casual leave is restricted to a maximum of {maxCasualLeavesAllowed} day(s) for this month.
                        </p>
                      )}
                      {leaveType === "casual" &&
                        requestedDaysCount <= maxCasualLeavesAllowed &&
                        usedCasualDaysThisMonth + requestedDaysCount > maxCasualLeavesAllowed && (
                          <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                            ⚠️ Exceeds quota: You have already used {usedCasualDaysThisMonth} casual day(s) this month (maximum {maxCasualLeavesAllowed} allowed).
                          </p>
                        )}
                    </div>
                  )}

                  <label className="flex flex-col gap-1 text-xs">
                    <span className={formFieldLabelClass}>Reason for Leave</span>
                    <textarea
                      required
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Briefly state the reason for your absence…"
                      className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-base sm:text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>

                  {leaveType === "medical" && (
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className={formFieldLabelClass}>
                          Medical Certificate / Prescription (Photos / Images only)
                        </span>
                        {documents.length > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {documents.length} attached
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/jpg"
                          onChange={(e) => void handleFileUpload(e)}
                          disabled={uploadingDoc}
                          className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950/40 dark:file:text-blue-300"
                        />
                        {uploadingDoc && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 shrink-0">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-[11px]">Optimizing & uploading...</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Upload doctor prescription, medical certificate or report photos (JPG, PNG, WebP). Ultra-compressed automatically.
                      </p>

                      {/* Attached Documents Preview & Remove List */}
                      {documents.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                            Attached Files ({documents.length}):
                          </span>
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {documents.map((doc, idx) => (
                              <div
                                key={doc.url + idx}
                                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-xs transition-colors"
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
                                    onClick={() => removeDocument(idx)}
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
                </form>
              </div>

              {/* Bottom Sticky Action Bar */}
              <Separator />
              <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-end gap-2 pb-6 md:pb-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenModal(false)}
                  disabled={submitting}
                  className="text-xs rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="leave-modal-form"
                  disabled={
                    submitting ||
                    uploadingDoc ||
                    (leaveType === "casual" &&
                      (requestedDaysCount > maxCasualLeavesAllowed || usedCasualDaysThisMonth + requestedDaysCount > maxCasualLeavesAllowed))
                  }
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl px-4"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Submit Leave Application
                </Button>
              </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* MODAL 2: My Leave Records Bottom Sheet Modal */}
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
                    "relative z-10 w-full md:max-w-xl max-h-[85dvh] flex flex-col border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-zinc-900 dark:text-white shadow-2xl overflow-hidden pb-6 md:pb-4",
                    isMobile
                      ? "rounded-t-[28px]"
                      : "rounded-3xl"
                  )}
                >
                  {/* Top Right Close Button */}
                  <button
                    type="button"
                    onClick={() => setOpenHistoryModal(false)}
                    className="absolute top-3.5 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-100 cursor-pointer shadow-xs transition-colors"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>

                  {/* Drag Handle Pill for mobile */}
                  {isMobile && (
                    <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  )}

                  {/* Modal Header */}
                  <div className="px-5 py-3 pr-14 border-b border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <FileCheck className="size-4 text-blue-500" />
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        My Leave Records
                      </h3>
                      {leaves.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono text-[11px] font-bold">
                          {leaves.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Review submitted leave requests, approval status, and remarks.
                    </p>
                  </div>

                  {/* Modal Body */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar">
                    {loading ? (
                      <div className="flex h-40 items-center justify-center text-zinc-400">
                        <Loader2 className="size-6 animate-spin" />
                      </div>
                    ) : leaves.length === 0 ? (
                      <div className="p-8 text-center text-sm text-zinc-500">
                        <p>No leave applications submitted yet.</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOpenHistoryModal(false);
                            setOpenModal(true);
                          }}
                          className="mt-3 text-xs gap-1.5 text-blue-600 border-blue-500/30"
                        >
                          <FilePlus2 className="size-3.5" /> Submit First Leave
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {leaves.map((l) => (
                          <div
                            key={l.id}
                            className="rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02] p-4 space-y-2.5 transition-colors hover:border-zinc-300 dark:hover:border-white/20"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm capitalize text-zinc-900 dark:text-zinc-100">
                                  {l.type} Leave
                                </span>
                                <span className="text-xs text-zinc-500 font-mono font-medium">
                                  ({l.startDate} → {l.endDate})
                                </span>
                              </div>

                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                                  l.status === "approved"
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                    : l.status === "rejected"
                                    ? "bg-red-500/10 text-red-600 border-red-500/20"
                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                )}
                              >
                                {l.status === "approved" ? (
                                  <CheckCircle2 className="size-3" />
                                ) : l.status === "rejected" ? (
                                  <XCircle className="size-3" />
                                ) : (
                                  <Clock className="size-3" />
                                )}
                                <span className="capitalize">{l.status}</span>
                              </span>
                            </div>

                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                              <span className="text-zinc-500 font-medium">Reason: </span>
                              {l.reason}
                            </p>

                            {(() => {
                              const docs = (Array.isArray(l.documentUrls) && l.documentUrls.length > 0)
                                ? l.documentUrls
                                : (l.documentUrl ? [l.documentUrl] : []);
                              if (docs.length === 0) return null;
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  {docs.map((url, idx) => (
                                    <button
                                      key={url + idx}
                                      type="button"
                                      onClick={() =>
                                        setPreviewTarget({
                                          url: resolveDocumentViewUrl(url),
                                          title: docs.length > 1 ? `Medical Doc ${idx + 1}` : "Medical Certificate / Document",
                                        })
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 cursor-pointer"
                                    >
                                      <FileText className="size-3" />
                                      <span>{docs.length > 1 ? `Medical Doc ${idx + 1}` : "View Attached Certificate / Document"}</span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}

                            {l.reviewNotes && (
                              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.04] text-xs text-zinc-700 dark:text-zinc-300 border border-zinc-200/50 dark:border-white/5">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">Administration Note: </span>
                                {l.reviewNotes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

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
