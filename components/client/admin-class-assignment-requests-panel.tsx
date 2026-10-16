"use client";

import * as React from "react";
import { Check, X, Clock, AlertCircle, Sparkles, User, RefreshCw, UserCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";

type AssignmentRequest = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  employeeId?: string;
  wingId: string;
  requestedClass: string;
  requestedSection: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt?: { seconds?: number; _seconds?: number };
  reviewedByEmail?: string;
  reviewedAt?: { seconds?: number; _seconds?: number };
  reviewNote?: string;
};

export function AdminClassAssignmentRequestsPanel({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = React.useState<AssignmentRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionBusyId, setActionBusyId] = React.useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = React.useState<{
    id: string;
    teacherName: string;
    requestedClass: string;
    requestedSection: string;
  } | null>(null);
  const [declineNote, setDeclineNote] = React.useState("");

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/school/teachers/assignment-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch assignment requests");
      const data = await res.json();
      if (Array.isArray(data.requests)) {
        setItems(data.requests);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error loading assignment requests");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const handleReview = async (requestId: string, action: "approve" | "reject", note = "") => {
    setActionBusyId(requestId);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not authenticated");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/teachers/assignment-requests", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");

      toast.success(
        action === "approve"
          ? "Teacher appointed as Class Teacher! Access activated."
          : "Assignment request rejected."
      );

      // Update local state
      setItems((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: action === "approve" ? "approved" : "rejected", reviewNote: note }
            : r
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error reviewing assignment request");
    } finally {
      setActionBusyId(null);
    }
  };

  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-950">
        <CardHeader className="px-4 sm:px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <UserCheck className="size-5 text-blue-600 dark:text-blue-400" />
                Class Teacher Appointment Requests
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-xs px-2.5 py-0.5 font-bold">
                    {pendingCount} Pending
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Review teacher applications to be assigned as official Class Teachers for specific classes.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status filter tabs */}
              <div className="inline-flex rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 text-xs">
                {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-lg px-3 py-1 font-bold capitalize transition-all cursor-pointer",
                      filter === f
                        ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    {f}
                    {f === "pending" && pendingCount > 0 && ` (${pendingCount})`}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchRequests}
                disabled={loading}
                className="rounded-xl h-8 px-2.5 gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 sm:px-6 py-5">
          {loading ? (
            <div className="py-16 text-center text-xs text-zinc-400 animate-pulse">
              Loading teacher assignment requests...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center dark:border-white/10">
              <AlertCircle className="size-8 text-zinc-400 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                No {filter !== "all" ? filter : ""} class teacher assignment requests found
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {filter === "pending"
                  ? "All class teacher assignment applications have been reviewed."
                  : `No requests with status "${filter}".`}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-340px)] min-h-[280px] overflow-y-auto pr-1 sm:pr-2">
          {filtered.map((r) => {
            const isBusy = actionBusyId === r.id;
            const dateStr = r.createdAt?._seconds
              ? new Date(r.createdAt._seconds * 1000).toLocaleString()
              : r.createdAt?.seconds
              ? new Date(r.createdAt.seconds * 1000).toLocaleString()
              : "Recently";

            return (
              <Card
                key={r.id}
                className={cn(
                  "border-zinc-200/90 shadow-xs dark:border-white/10 transition-all",
                  r.status === "pending"
                    ? "bg-white dark:bg-zinc-950 border-amber-500/30"
                    : "bg-zinc-50/50 dark:bg-zinc-900/30 opacity-80"
                )}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <User className="size-4 text-zinc-400" />
                          {r.teacherName}
                        </span>
                        <span className="text-xs text-zinc-400">({r.teacherEmail})</span>
                        {r.employeeId && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                            {r.employeeId}
                          </span>
                        )}

                        {/* Status Badge */}
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold border ml-auto sm:ml-2",
                            r.status === "pending" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                            r.status === "approved" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                            r.status === "rejected" && "bg-rose-500/10 text-rose-600 border-rose-500/20",
                            r.status === "cancelled" && "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                          )}
                        >
                          {r.status === "pending" ? "● Pending Approval" : r.status.toUpperCase()}
                        </span>
                      </div>

                      {/* Request details */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          Requested Appointment:
                        </span>
                        <span className="rounded-lg bg-blue-500/10 px-2 py-0.5 font-extrabold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          {r.requestedClass} — {r.requestedSection}
                        </span>
                        <span className="text-zinc-400 font-medium">({r.wingId} wing)</span>
                        <span className="text-zinc-300 dark:text-zinc-700">•</span>
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Clock className="size-3" /> {dateStr}
                        </span>
                      </div>

                      {r.reason && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 italic bg-zinc-50 dark:bg-zinc-900 p-2 rounded-xl border border-zinc-100 dark:border-white/5">
                          &ldquo;{r.reason}&rdquo;
                        </p>
                      )}

                      {r.reviewNote && (
                        <p className="text-xs text-rose-600 dark:text-rose-400">
                          Admin note: {r.reviewNote}
                        </p>
                      )}
                    </div>

                    {/* Action buttons if pending */}
                    {r.status === "pending" && (
                      <div className="flex sm:flex-col gap-2 shrink-0 self-end sm:self-center">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleReview(r.id, "approve")}
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl h-8 px-3"
                        >
                          <Check className="size-3.5" />
                          Approve Appointment
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => {
                            setDeclineNote("");
                            setDeclineTarget({
                              id: r.id,
                              teacherName: r.teacherName,
                              requestedClass: r.requestedClass,
                              requestedSection: r.requestedSection,
                            });
                          }}
                          className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-950/20 text-xs font-bold rounded-xl h-8 px-3"
                        >
                          <X className="size-3.5" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DangerConfirmModal for Declining Assignment Request */}
      <DangerConfirmModal
        open={Boolean(declineTarget)}
        onClose={() => setDeclineTarget(null)}
        onConfirm={async () => {
          if (!declineTarget) return;
          const { id } = declineTarget;
          const note = declineNote.trim();
          setDeclineTarget(null);
          await handleReview(id, "reject", note);
        }}
        title="Decline Class Teacher Assignment"
        subtitle={
          declineTarget
            ? `${declineTarget.teacherName} — ${declineTarget.requestedClass} (${declineTarget.requestedSection})`
            : undefined
        }
        description={
          <div className="space-y-3">
            <p className="text-xs text-zinc-300">
              Are you sure you want to decline this class teacher assignment request? You can provide a reason or note below.
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              placeholder="Reason for declining (optional)..."
              rows={3}
              className="w-full rounded-xl border border-red-500/30 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none resize-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
        }
        confirmText="Decline Assignment"
        cancelText="Cancel"
        loading={Boolean(actionBusyId)}
        variant="danger"
      />
    </div>
  );
}
