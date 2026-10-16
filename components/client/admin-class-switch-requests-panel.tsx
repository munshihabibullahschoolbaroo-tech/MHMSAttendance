"use client";

import * as React from "react";
import { Check, X, Clock, AlertCircle, Sparkles, User, RefreshCw, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppDatePicker } from "@/components/ui/app-date-picker";

type ClassSwitchRequest = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  wingId: string;
  assignedClass: string;
  assignedSection: string;
  requestedClass: string;
  requestedSection: string;
  reason: string;
  date: string;
  status: "pending" | "approved" | "rejected" | "consumed";
  createdAt?: { seconds?: number; _seconds?: number };
  reviewedByEmail?: string;
  reviewedAt?: { seconds?: number; _seconds?: number };
  reviewNote?: string;
};

export function AdminClassSwitchRequestsPanel({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = React.useState<ClassSwitchRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionBusyId, setActionBusyId] = React.useState<string | null>(null);

  const realTodayStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDate, setSelectedDate] = React.useState<string>(realTodayStr);

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch(`/api/school/students/switch-request?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch switch requests");
      const data = await res.json();
      if (Array.isArray(data.requests)) {
        setItems(data.requests);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error loading class switch requests");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  React.useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const handleReview = async (requestId: string, action: "approve" | "reject") => {
    setActionBusyId(requestId);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not authenticated");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/students/switch-request", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");

      toast.success(
        action === "approve"
          ? "Class switch approved! Teacher appointed to the new class and previous class unassigned."
          : "Class switch request rejected."
      );

      // Update state locally
      setItems((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: action === "approve" ? "approved" : "rejected" }
            : r
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review request");
    } finally {
      setActionBusyId(null);
    }
  };

  const filteredItems = React.useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const pendingCount = React.useMemo(() => items.filter((i) => i.status === "pending").length, [items]);

  const getWingLabel = (wingId: string) => {
    if (wingId === "lower") return "Lower School";
    if (wingId === "higher") return "Higher School";
    if (wingId === "rewa_na_kasco") return "Rewa na Kasco";
    return wingId;
  };

  return (
    <Card className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-950">
      <CardHeader className="px-4 sm:px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-white/5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="size-5 text-blue-500" />
              Teacher Class Switch Requests
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-xs px-2.5 py-0.5 font-bold">
                  {pendingCount} Pending
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Review teacher requests to switch and be appointed as Class Teacher for a different class.
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

            <div className="w-36">
              <AppDatePicker
                value={selectedDate}
                onChange={(d) => setSelectedDate(d)}
                showClear={false}
                className="py-1 text-xs"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchRequests()}
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
            Loading class switch requests...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center dark:border-white/10">
            <AlertCircle className="size-8 text-zinc-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No {filter !== "all" ? filter : ""} class switch requests found
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {filter === "pending"
                ? "All teacher class switch requests for this date have been reviewed."
                : `No requests with status "${filter}" on ${selectedDate}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[calc(100vh-340px)] min-h-[280px] overflow-y-auto pr-1 sm:pr-2">
            {filteredItems.map((req) => {
              const isBusy = actionBusyId === req.id;
              return (
                <div
                  key={req.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs transition-all dark:border-white/10 dark:bg-zinc-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        <User className="size-4 text-blue-500" />
                        {req.teacherName}
                      </span>
                      <span className="text-[11px] text-zinc-400">• {req.teacherEmail}</span>
                      <span className="rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 border border-blue-500/20">
                        {getWingLabel(req.wingId)}
                      </span>
                      {req.status === "pending" && (
                        <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 border border-amber-500/30">
                          Pending Approval
                        </span>
                      )}
                      {req.status === "approved" && (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 border border-emerald-500/30">
                          Approved (Class Appointed)
                        </span>
                      )}
                      {req.status === "rejected" && (
                        <span className="rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-2 py-0.5 border border-rose-500/30">
                          Rejected
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-zinc-500">
                        Assigned Class: <strong className="text-zinc-800 dark:text-zinc-200">{req.assignedClass || "None"} ({req.assignedSection || "A"})</strong>
                      </span>
                      <span className="text-zinc-400">→</span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/50">
                        Requested: {req.requestedClass} — {req.requestedSection}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-white/5 p-2 rounded-xl border border-zinc-100 dark:border-white/5">
                      <strong className="text-zinc-500">Reason:</strong> &ldquo;{req.reason}&rdquo;
                    </p>
                  </div>

                  {/* Actions */}
                  {req.status === "pending" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void handleReview(req.id, "approve")}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs gap-1.5 h-8 font-bold shadow-xs cursor-pointer"
                      >
                        <Check className="size-3.5" />
                        Approve Switch
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void handleReview(req.id, "reject")}
                        className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 dark:hover:bg-rose-950/20 text-xs gap-1.5 h-8 font-bold cursor-pointer"
                      >
                        <X className="size-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                  {req.status === "approved" && (
                    <div className="text-right shrink-0">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="size-3.5" />
                        Class Teacher Appointed
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
