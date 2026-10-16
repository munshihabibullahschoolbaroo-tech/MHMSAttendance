"use client";

import * as React from "react";
import {
  FileText,
  Check,
  X,
  ExternalLink,
  Loader2,
  Calendar,
  AlertCircle,
  FileCheck,
  Phone,
  User,
  Clock,
  Filter,
  CheckSquare,
  Square,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { cn, resolveDocumentViewUrl } from "@/lib/utils";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { MediaPreviewModal } from "@/components/ui/media-preview-modal";

type LeaveRequest = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  teacherPhone?: string | null;
  wingId: string;
  position: string;
  designation: string;
  type: "casual" | "medical" | "emergency" | "on_duty" | string;
  isEmergencyDeparture?: boolean;
  departureTime?: string;
  willReturn?: boolean;
  returnTime?: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  documentUrl?: string | null;
  documentUrls?: string[] | null;
  status: "pending" | "approved" | "rejected";
  createdAt?: { _seconds?: number; seconds?: number };
  adminNotes?: string | null;
};

export function AdminLeaveQueue() {
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // In-app custom rejection modal state (replacing window.prompt)
  const [rejectTarget, setRejectTarget] = React.useState<{
    id: string;
    teacherName: string;
  } | null>(null);
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [previewTarget, setPreviewTarget] = React.useState<{ url: string; title: string } | null>(null);

  const fetchLeaves = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();

      const res = await fetch("/api/school/leave/review", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setLeaves(json.leaves ?? []);
      }
    } catch {
      toast.error("Failed to load leave requests");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchLeaves();
  }, [fetchLeaves]);

  const handleReview = async (leaveId: string, action: "approve" | "reject", notes = "") => {
    setProcessingId(leaveId);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/leave/review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leaveId, action, notes }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to process leave");

      toast.success(action === "approve" ? "Leave request approved!" : "Leave request rejected");
      setSelectedIds((prev) => prev.filter((id) => id !== leaveId));
      await fetchLeaves();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error processing request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmSingleReject = async () => {
    if (!rejectTarget) return;
    const { id } = rejectTarget;
    const notes = rejectNotes.trim();
    setRejectTarget(null);
    await handleReview(id, "reject", notes);
  };

  const [bulkActionTarget, setBulkActionTarget] = React.useState<{
    ids: string[];
    action: "approve" | "reject";
  } | null>(null);
  const [bulkNotes, setBulkNotes] = React.useState("");

  const handleBatchReview = (ids: string[], action: "approve" | "reject") => {
    if (ids.length === 0) return;
    setBulkNotes("");
    setBulkActionTarget({ ids, action });
  };

  const handleConfirmBatchReview = async () => {
    if (!bulkActionTarget || bulkActionTarget.ids.length === 0) return;
    const { ids, action } = bulkActionTarget;
    setBulkBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/leave/review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leaveIds: ids, action, notes: bulkNotes.trim() }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to process leaves");

      toast.success(
        action === "approve"
          ? `Successfully approved ${ids.length} leave application(s)!`
          : `Rejected ${ids.length} leave application(s)`
      );
      setSelectedIds([]);
      setBulkActionTarget(null);
      setBulkNotes("");
      await fetchLeaves();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error processing bulk review");
    } finally {
      setBulkBusy(false);
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "pending");
  const pendingCount = pendingLeaves.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllPending = () => {
    setSelectedIds(pendingLeaves.map((l) => l.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const filteredLeaves = leaves.filter((l) => {
    if (filter === "all") return true;
    return l.status === filter;
  });

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Teacher Leave Applications
            </h1>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-500/20">
                {pendingCount} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Review and grant casual & medical leave requests for Munshi Habibullah Mission School staff.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-white/5 self-start sm:self-auto">
          {(["pending", "approved", "rejected", "all"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all",
                filter === tab
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Approval & Quick Selection Toolbar */}
      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-4 shadow-xs dark:border-blue-500/20 dark:bg-blue-950/30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => (selectedIds.length === pendingCount ? clearSelection() : selectAllPending())}
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {selectedIds.length > 0 && selectedIds.length === pendingCount ? (
                <CheckSquare className="h-4 w-4 text-blue-600" />
              ) : (
                <Square className="h-4 w-4 text-zinc-400" />
              )}
              <span>
                {selectedIds.length > 0
                  ? `${selectedIds.length} of ${pendingCount} selected`
                  : "Select all pending"}
              </span>
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 underline"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() => void handleBatchReview(selectedIds, "reject")}
                  className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/20 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject Selected ({selectedIds.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => void handleBatchReview(selectedIds, "approve")}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
                >
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                  Approve Selected ({selectedIds.length})
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={bulkBusy}
                onClick={() => void handleBatchReview(pendingLeaves.map((l) => l.id), "approve")}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm"
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                Approve All Pending ({pendingCount})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Leave List */}
      {filteredLeaves.length === 0 ? (
        <Card className="border-dashed border-zinc-300 dark:border-white/10">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileCheck className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              No {filter !== "all" ? filter : ""} leave applications found
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Any new requests submitted by teachers will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredLeaves.map((leave) => {
            const isPending = leave.status === "pending";
            const isMedical = leave.type === "medical";
            const isEmergency = leave.type === "emergency" || leave.isEmergencyDeparture === true;
            const isOnDuty = leave.type === "on_duty";
            const isLateSignOut = leave.type === "late_sign_out" || (leave as any).isLateSignOut === true;
            const isSelected = selectedIds.includes(leave.id);

            return (
              <Card
                key={leave.id}
                className={cn(
                  "border-zinc-200 shadow-sm transition-all dark:border-white/10",
                  isPending &&
                    (isLateSignOut
                      ? "border-l-4 border-l-rose-500"
                      : isEmergency
                      ? "border-l-4 border-l-red-500"
                      : isOnDuty
                      ? "border-l-4 border-l-purple-500"
                      : "border-l-4 border-l-amber-500"),
                  isSelected && "ring-2 ring-blue-500/70 border-blue-400 bg-blue-50/10"
                )}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Checkbox + Teacher Info & Leave Details */}
                    <div className="flex items-start gap-3">
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => toggleSelect(leave.id)}
                          className="mt-0.5 shrink-0 text-zinc-400 hover:text-blue-600 transition-colors"
                          aria-label={isSelected ? "Deselect" : "Select"}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            {leave.teacherName}
                          </span>
                          <span className="text-xs text-zinc-400">•</span>
                          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {leave.designation} ({leave.wingId.replace(/_/g, " ")})
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                              isLateSignOut
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                                : isEmergency
                                ? "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
                                : isOnDuty
                                ? "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                                : isMedical
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                            )}
                          >
                            {isLateSignOut ? "🌙 Late Sign-Out" : isEmergency ? "🚨 Emergency Departure" : isOnDuty ? "🏛️ On-Duty (OD)" : `${leave.type} Leave`}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-semibold capitalize",
                              leave.status === "pending"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                : leave.status === "approved"
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-700 dark:text-red-400"
                            )}
                          >
                            {leave.status}
                          </span>
                        </div>

                        {/* Contact & Date info */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                          <span className="flex items-center gap-1 font-mono">
                            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                            <strong>{leave.startDate}</strong> to <strong>{leave.endDate}</strong>
                          </span>
                          {leave.teacherPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5 text-zinc-400" />
                              {leave.teacherPhone}
                            </span>
                          )}
                          <span className="text-zinc-400">{leave.teacherEmail}</span>
                        </div>

                        {/* Reason */}
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-white/[0.02] p-2.5 rounded-lg border border-zinc-200/60 dark:border-white/5">
                          <strong className="text-zinc-900 dark:text-zinc-100">Reason:</strong>{" "}
                          {leave.reason}
                        </p>

                        {/* Admin Notes if any */}
                        {leave.adminNotes && (
                          <p className="text-[11px] text-zinc-500 italic">
                            Admin note: {leave.adminNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions & Document Preview */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-2.5 shrink-0 pt-2 lg:pt-0">
                      {/* Attached Documents (Doctor notes/prescriptions/lab tests) */}
                      {(() => {
                        const docs = Array.isArray(leave.documentUrls) && leave.documentUrls.length > 0
                          ? leave.documentUrls
                          : (leave.documentUrl ? [leave.documentUrl] : []);

                        if (docs.length === 0) return null;

                        return (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {docs.map((url, idx) => (
                              <button
                                key={url + idx}
                                type="button"
                                onClick={() =>
                                  setPreviewTarget({
                                    url: resolveDocumentViewUrl(url),
                                    title: docs.length > 1 ? `${leave.teacherName} - Medical Doc ${idx + 1}` : `${leave.teacherName} - Medical Doc`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shadow-xs cursor-pointer"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>{docs.length > 1 ? `Medical Doc ${idx + 1}` : "View Medical Doc"}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Individual Approval Buttons */}
                      {isPending && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={processingId === leave.id || bulkBusy}
                            onClick={() => {
                              setRejectNotes("");
                              setRejectTarget({ id: leave.id, teacherName: leave.teacherName });
                            }}
                            className="gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/20 dark:hover:bg-red-950/20 text-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={processingId === leave.id || bulkBusy}
                            onClick={() => void handleReview(leave.id, "approve")}
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                          >
                            {processingId === leave.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* DangerConfirmModal for Single Leave Rejection */}
      <DangerConfirmModal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleConfirmSingleReject}
        title="Reject Leave Request"
        subtitle={rejectTarget ? `Staff Member: ${rejectTarget.teacherName}` : undefined}
        description={
          <div className="space-y-3">
            <p className="text-xs text-zinc-300">
              Are you sure you want to reject this leave request? You can provide an explanation note below for the staff member.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Reason for rejection (optional)..."
              rows={3}
              className="w-full rounded-xl border border-red-500/30 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none resize-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
        }
        confirmText="Reject Leave"
        cancelText="Cancel"
        loading={Boolean(processingId)}
        variant="danger"
      />

      {/* DangerConfirmModal for Bulk Leave Review */}
      <DangerConfirmModal
        open={Boolean(bulkActionTarget)}
        onClose={() => setBulkActionTarget(null)}
        onConfirm={handleConfirmBatchReview}
        title={bulkActionTarget?.action === "approve" ? "Approve Leaves" : "Reject Leaves"}
        subtitle={
          bulkActionTarget
            ? `Bulk ${bulkActionTarget.action} for ${bulkActionTarget.ids.length} application(s)`
            : undefined
        }
        description={
          <div className="space-y-3">
            <p className="text-xs text-zinc-300">
              {bulkActionTarget?.action === "approve"
                ? `Are you sure you want to approve ${bulkActionTarget?.ids.length} selected employee leave request(s)? Attendance records will automatically reflect approved leave status.`
                : `Are you sure you want to reject ${bulkActionTarget?.ids.length} selected leave request(s)? You can provide an optional rejection explanation below.`}
            </p>
            {bulkActionTarget?.action === "reject" && (
              <textarea
                value={bulkNotes}
                onChange={(e) => setBulkNotes(e.target.value)}
                placeholder="Reason for rejection (optional)..."
                rows={2}
                className="w-full rounded-xl border border-red-500/30 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none resize-none focus:border-red-500"
              />
            )}
          </div>
        }
        confirmText={
          bulkActionTarget?.action === "approve" ? "Approve Leaves" : "Reject Leaves"
        }
        cancelText="Cancel"
        loading={bulkBusy}
        variant={bulkActionTarget?.action === "approve" ? "warning" : "danger"}
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
