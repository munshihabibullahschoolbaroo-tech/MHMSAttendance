"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getFirestoreSeconds } from "@/lib/client/firestore-timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionModal, ResultModal } from "@/components/client/feedback-modals";
import { toast } from "sonner";
import { DEFAULT_ATTENDANCE_TIME_ZONE } from "@/lib/date/time-zone";
import { useCalendarMode } from "@/components/client/calendar-mode-context";
import { formatIsoForCalendar, formatTimestampForMode, CalendarMode } from "@/lib/date/bs-calendar";
import { cn } from "@/lib/utils";
import { formatWallHm12h } from "@/lib/time/format-wall-time";
import { Clock, RefreshCw, AlertCircle } from "lucide-react";

type Segment = { siteId: string; inHm: string; outHm: string; };

type Row = {
  id: string;
  workerId?: string;
  workerName?: string | null;
  workerEmail?: string | null;
  date?: string;
  reason?: string;
  status?: string;
  type?: string;
  isLateSignOut?: boolean;
  segments?: Segment[];
  createdAt?: { seconds?: number };
  reviewedAt?: { seconds?: number };
  reviewedByEmail?: string | null;
  reviewNote?: string | null;
};

function fmt(v: unknown, mode: CalendarMode) {
  const s = getFirestoreSeconds(v);
  if (s == null) return "—";
  return formatTimestampForMode(s * 1000, mode, DEFAULT_ATTENDANCE_TIME_ZONE);
}

export function AdminManualPunchRequestsPanel({ embedded = false }: { embedded?: boolean }) {
  const { mode } = useCalendarMode();
  const [items, setItems] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionBusy, setActionBusy] = React.useState(false);
  const [sites, setSites] = React.useState<{ id: string; name?: string }[]>([]);

  const [confirm, setConfirm] = React.useState<
    | null
    | { kind: "delete"; id: string }
    | { kind: "unapprove"; row: Row }
    | { kind: "reject"; row: Row }
  >(null);

  const [doneFeedback, setDoneFeedback] = React.useState<{ title: string; description: string } | null>(null);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadSites = React.useCallback(async () => {
    setSites([{ id: "main-campus", name: "Main Campus" }]);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/manual-punch", { headers: h });
      const data = (await res.json()) as { items?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load requests");
      setItems(data.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const filtered = React.useMemo(() => {
    if (filter === "all") return items;
    return items.filter((row) => row.status === filter);
  }, [items, filter]);

  const pendingCount = React.useMemo(() => items.filter((row) => row.status === "pending").length, [items]);

  React.useEffect(() => {
    void loadSites();
  }, [loadSites]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const siteName = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return "Unknown Site";
      const s = sites.find((x) => x.id === id);
      return s?.name ?? id;
    },
    [sites]
  );

  const doAction = async (id: string, action: "approved" | "rejected" | "pending") => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const note = confirm?.kind === "reject" || confirm?.kind === "unapprove"
        ? (document.getElementById("mp-reason") as HTMLInputElement)?.value || "No note"
        : undefined;

      const res = await fetch(`/api/admin/manual-punch/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ status: action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setDoneFeedback({
        title: action === "approved" ? "Approved ✓" : action === "rejected" ? "Rejected" : "Un-approved",
        description: action === "approved"
          ? "The employee's attendance timeline has been corrected mathematically."
          : `Success`,
      });
      setConfirm(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActionBusy(false);
    }
  };

  const doDelete = async (id: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/manual-punch/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setConfirm(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActionBusy(false);
    }
  };

  const hasItems = items.length > 0;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-950">
        <CardHeader className="px-4 sm:px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="size-5 text-purple-600 dark:text-purple-400" />
                Missed & Late Sign-Out Requests
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-xs px-2.5 py-0.5 font-bold">
                    {pendingCount} Pending
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Approve missed punches or late sign-out attendance requests. Timeline overrides are applied automatically.
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
                onClick={() => void load()}
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
              Loading requests...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center dark:border-white/10">
              <AlertCircle className="size-8 text-zinc-400 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                No {filter !== "all" ? filter : ""} requests found
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {filter === "pending"
                  ? "All missed punch and late sign-out requests have been reviewed."
                  : `No requests with status "${filter}".`}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-340px)] min-h-[280px] overflow-y-auto pr-1 sm:pr-2">
              <ul className="space-y-3">
                {filtered.map((row) => {
                  const isPending = row.status === "pending";
                  const dateStr = typeof row.date === "string" ? formatIsoForCalendar(row.date, mode) : "—";
                  const workerLabel = row.workerName || row.workerEmail || row.workerId || "Unknown";

                  return (
                    <li key={row.id} className="relative flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs transition-colors dark:border-white/10 dark:bg-zinc-900/60">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-zinc-900 dark:text-white text-sm">{workerLabel}</h4>
                            {(row.type === "late_sign_out" || row.isLateSignOut) && (
                              <span className="rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 px-2 py-0.5 text-xs font-semibold">
                                🌙 Late Sign-Out
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Date: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{dateStr}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize border",
                              isPending && "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                              row.status === "approved" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                              row.status === "rejected" && "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="grid gap-y-1 sm:grid-cols-2 text-zinc-500">
                          <div><span className="font-medium">Submitted:</span> {fmt(row.createdAt, mode)}</div>
                          {row.reviewedAt && (
                            <div>
                              <span className="font-medium">Reviewed By:</span> {row.reviewedByEmail || "Admin"} on {fmt(row.reviewedAt, mode)}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-white/5 dark:bg-white/[0.02]">
                          <span className="font-bold text-zinc-600 dark:text-zinc-300">Reason</span>
                          <p className="mt-1 text-zinc-800 dark:text-zinc-200">{row.reason}</p>
                        </div>

                        <div className="rounded-xl border border-purple-500/20 bg-purple-50/50 p-3 dark:border-purple-500/10 dark:bg-purple-950/20">
                          <span className="font-bold text-purple-700 dark:text-purple-300">Timeline Requested</span>
                          <ul className="mt-2 space-y-1.5">
                            {row.segments?.map((seg, idx) => (
                              <li key={idx} className="flex flex-wrap items-center gap-2 text-zinc-800 dark:text-zinc-300 font-mono text-[11px]">
                                <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded font-sans font-bold text-[10px]">
                                  Block {idx + 1} ({siteName(seg.siteId)})
                                </span>
                                <span>In: {formatWallHm12h(seg.inHm)}</span>
                                <span className="text-zinc-400">→</span>
                                <span>Out: {formatWallHm12h(seg.outHm)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {row.reviewNote && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-300">
                            <strong>Rejection Note:</strong> {row.reviewNote}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {isPending ? (
                            <>
                              <Button size="sm" onClick={() => doAction(row.id, "approved")} disabled={actionBusy} className="h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs">
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "reject", row })} disabled={actionBusy} className="h-8 text-xs font-bold gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 dark:hover:bg-rose-950/20 cursor-pointer">
                                Reject
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "unapprove", row })} disabled={actionBusy} className="h-8 text-xs font-semibold cursor-pointer">
                                {row.status === "approved" ? "Un-Approve (Undo)" : "Reset to Pending"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "delete", id: row.id })} disabled={actionBusy} className="h-8 text-xs font-semibold text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/50 cursor-pointer">
                                Delete Request
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {confirm?.kind === "delete" && (
        <ConfirmActionModal
          open
          tone="danger"
          title="Delete Request"
          description="Are you sure you want to permanently delete this late request? This will also wipe the mathematical attendance entry it created."
          confirmLabel="Delete"
          onConfirm={() => doDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
          busy={actionBusy}
        />
      )}
      {(confirm?.kind === "reject" || confirm?.kind === "unapprove") && (
        <ConfirmActionModal
          open
          tone={confirm.kind === "reject" ? "danger" : "neutral"}
          title={confirm.kind === "reject" ? "Reject Request" : "Reset to Pending"}
          description={
            confirm.kind === "reject"
              ? "Provide a reason for rejection (optional). They will be notified."
              : "Reverting an approved request back to pending will automatically delete its mathematical attendance tracking from the reports."
          }
          confirmLabel={confirm.kind === "reject" ? "Reject" : "Reset"}
          onConfirm={() => doAction(confirm.row.id, confirm.kind === "reject" ? "rejected" : "pending")}
          onCancel={() => setConfirm(null)}
          busy={actionBusy}
        />
      )}

      {/* Success Modal */}
      {doneFeedback && (
        <ResultModal
          open
          variant="success"
          title={doneFeedback.title}
          description={doneFeedback.description}
          onDismiss={() => setDoneFeedback(null)}
        />
      )}
    </div>
  );
}
